import { Router } from "express";
import { pool } from "@workspace/db";
import { adminAuth, superAdminOnly, type AuthedRequest } from "../lib/adminAuth";

const router = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

async function getUserHub(conn: any, username: string): Promise<string | null> {
  const [rows] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
  return rows[0]?.office_hub ?? null;
}

async function generateTicketRef(conn: Awaited<ReturnType<typeof pool.getConnection>>): Promise<string> {
  const [rows] = await conn.execute<any[]>(
    "SELECT setting_value FROM app_settings WHERE setting_key = 'ticket_counter' FOR UPDATE"
  );
  const current = (rows as any)[0] ? parseInt((rows as any)[0].setting_value, 10) : 0;
  const next = current + 1;
  await conn.execute(
    "INSERT INTO app_settings (setting_key, setting_value) VALUES ('ticket_counter', ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
    [String(next)]
  );
  return `#${String(next).padStart(4, "0")}`;
}

async function logEvent(
  conn: Awaited<ReturnType<typeof pool.getConnection>>,
  ticketId: number | string,
  eventType: string,
  actor: string,
  body: string | null = null,
  meta: string | null = null
) {
  await conn.execute(
    "INSERT INTO ticket_events (ticket_id, event_type, actor, body, meta) VALUES (?, ?, ?, ?, ?)",
    [ticketId, eventType, actor, body, meta]
  );
}

const VALID_STATUSES = ["open", "claimed", "in_progress", "resolved", "pending_close", "pending_accept", "closed"];

// ── GET /api/tickets — list tickets ────────────────────────────────────────
//
// Visibility rules:
//   admin      → all tickets
//   office     → tickets they created + pickup_desk for their office hub + all central_team
//   expediteur → tickets they created + merchant tickets addressed to them
//   commercial → merchant tickets addressed to them (legacy)

router.get("/tickets", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    let rows: any[];
    if (role === "admin") {
      [rows] = await conn.execute("SELECT * FROM tickets ORDER BY updated_at DESC") as any;
    } else if (role === "office") {
      const myHub = await getUserHub(conn, username);
      if (myHub) {
        [rows] = await conn.execute(
          `SELECT * FROM tickets
           WHERE created_by = ?
              OR (destination_type = 'pickup_desk' AND recipient_office = ?)
              OR destination_type = 'central_team'
           ORDER BY updated_at DESC`,
          [username, myHub]
        ) as any;
      } else {
        [rows] = await conn.execute(
          "SELECT * FROM tickets WHERE created_by = ? OR destination_type = 'central_team' ORDER BY updated_at DESC",
          [username]
        ) as any;
      }
    } else if (role === "expediteur") {
      [rows] = await conn.execute(
        `SELECT * FROM tickets
         WHERE created_by = ?
            OR (destination_type = 'merchant' AND recipient_username = ?)
         ORDER BY updated_at DESC`,
        [username, username]
      ) as any;
    } else if (role === "commercial") {
      [rows] = await conn.execute(
        "SELECT * FROM tickets WHERE destination_type = 'merchant' AND recipient_username = ? ORDER BY updated_at DESC",
        [username]
      ) as any;
    } else {
      rows = [];
    }
    res.json({ ok: true, tickets: rows });
  } finally {
    conn.release();
  }
});

// ── POST /api/tickets — create ticket ──────────────────────────────────────

router.post("/tickets", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;

  // Only admin, office and expediteur can create tickets
  if (!["admin", "office", "expediteur"].includes(role)) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }

  const { destination_type, recipient_username, recipient_office, support_service, reason, custom_reason, comment, parcel_numbers } = req.body;
  if (!destination_type || !reason) {
    return res.status(400).json({ ok: false, error: "Missing required fields" });
  }

  // Expediteur cannot send merchant (to another expediteur)
  if (role === "expediteur" && destination_type === "merchant") {
    return res.status(400).json({ ok: false, error: "expediteur_cannot_send_merchant" });
  }

  const conn = await pool.getConnection();
  try {
    // Cannot send to self
    if (destination_type === "pickup_desk" && recipient_office) {
      const myHub = await getUserHub(conn, username);
      if (role === "office" && myHub && myHub === recipient_office) {
        conn.release();
        return res.status(400).json({ ok: false, error: "cannot_send_to_self" });
      }
    }
    if (destination_type === "merchant" && recipient_username === username) {
      conn.release();
      return res.status(400).json({ ok: false, error: "cannot_send_to_self" });
    }

    await conn.beginTransaction();
    const ref = await generateTicketRef(conn);
    const [result]: any = await conn.execute(
      `INSERT INTO tickets
         (ticket_ref, destination_type, recipient_username, recipient_office,
          support_service, reason, custom_reason, comment, parcel_numbers, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ref,
        destination_type,
        destination_type === "merchant" ? (recipient_username ?? null) : null,
        destination_type === "pickup_desk" ? (recipient_office ?? null) : null,
        support_service ?? null,
        reason,
        custom_reason ?? null,
        comment ?? null,
        Array.isArray(parcel_numbers) && parcel_numbers.length > 0
          ? JSON.stringify(parcel_numbers.filter(Boolean))
          : null,
        username,
      ]
    );
    const ticketId = result.insertId;
    await logEvent(conn, ticketId, "status_change", username!, null, "open");
    await conn.commit();
    res.json({ ok: true, ref });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

// ── PUT /api/tickets/:id/status — update status ────────────────────────────

router.put("/tickets/:id/status", adminAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: "Invalid status" });
  }

  const role = req.adminRole!;
  const username = req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    const [[ticket]] = await conn.execute("SELECT * FROM tickets WHERE id = ? LIMIT 1", [id]) as any;
    if (!ticket) return res.status(404).json({ ok: false, error: "Not found" });

    const myHub = (role === "office") ? await getUserHub(conn, username) : null;

    const isSender = ticket.created_by === username;
    const isRecipient =
      role === "admin" ||
      (role === "office" && ticket.destination_type === "central_team") ||
      (role === "office" && ticket.destination_type === "pickup_desk" && myHub && ticket.recipient_office === myHub) ||
      (role === "expediteur" && ticket.destination_type === "merchant" && ticket.recipient_username === username);

    // Recipients (admin/office/expediteur who receives the ticket) can freely change
    // to normal statuses but cannot set pending_ states (those are sender-only).
    // Senders can only request close (pending_close) or request reopen (pending_accept).
    const RECIPIENT_STATUSES = ["open", "claimed", "in_progress", "resolved", "closed"];

    if (isRecipient) {
      if (!RECIPIENT_STATUSES.includes(status)) {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
    } else if (isSender) {
      if (status === "pending_close") {
        if (!["open", "claimed", "in_progress"].includes(ticket.status)) {
          return res.status(400).json({ ok: false, error: "Invalid transition" });
        }
      } else if (status === "pending_accept") {
        if (!["closed", "resolved"].includes(ticket.status)) {
          return res.status(400).json({ ok: false, error: "Invalid transition" });
        }
      } else {
        return res.status(403).json({ ok: false, error: "Forbidden" });
      }
    } else {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    await conn.execute("UPDATE tickets SET status = ? WHERE id = ?", [status, id]);
    await logEvent(conn, id, "status_change", username, null, status);
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

// ── PUT /api/tickets/:id/claim — claim ticket ──────────────────────────────

router.put("/tickets/:id/claim", adminAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    const [[ticket]] = await conn.execute("SELECT * FROM tickets WHERE id = ? LIMIT 1", [id]) as any;
    if (!ticket) return res.status(404).json({ ok: false, error: "Not found" });

    const myHub = (role === "office") ? await getUserHub(conn, username) : null;
    const allowed =
      role === "admin" ||
      (role === "office" && ticket.destination_type === "pickup_desk" && myHub && ticket.recipient_office === myHub) ||
      (role === "office" && ticket.destination_type === "central_team") ||
      (role === "expediteur" && ticket.destination_type === "merchant" && ticket.recipient_username === username);
    if (!allowed) return res.status(403).json({ ok: false, error: "Forbidden" });

    await conn.execute(
      "UPDATE tickets SET status = 'claimed', handled_by = ? WHERE id = ?",
      [username, id]
    );
    await logEvent(conn, id, "claim", username, null, "claimed");
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

// ── GET /api/tickets/:id/events — list events ──────────────────────────────

router.get("/tickets/:id/events", adminAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    const [[ticket]] = await conn.execute("SELECT id FROM tickets WHERE id = ? LIMIT 1", [id]) as any;
    if (!ticket) return res.status(404).json({ ok: false, error: "Not found" });

    const [rows] = await conn.execute(
      "SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC",
      [id]
    ) as any;
    res.json({ ok: true, events: rows });
  } finally {
    conn.release();
  }
});

// ── POST /api/tickets/:id/events — add comment ─────────────────────────────

router.post("/tickets/:id/events", adminAuth, async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const { body } = req.body;
  if (!body?.trim()) return res.status(400).json({ ok: false, error: "Empty comment" });

  const conn = await pool.getConnection();
  try {
    const [[ticket]] = await conn.execute("SELECT * FROM tickets WHERE id = ? LIMIT 1", [id]) as any;
    if (!ticket) return res.status(404).json({ ok: false, error: "Not found" });

    if (["resolved", "closed", "pending_accept"].includes(ticket.status)) {
      return res.status(403).json({ ok: false, error: "ticket_locked" });
    }

    const username = req.adminUsername!;
    const [result]: any = await conn.execute(
      "INSERT INTO ticket_events (ticket_id, event_type, actor, body) VALUES (?, 'comment', ?, ?)",
      [id, username, body.trim()]
    );
    const [rows] = await conn.execute(
      "SELECT * FROM ticket_events WHERE id = ? LIMIT 1",
      [result.insertId]
    ) as any;
    res.json({ ok: true, event: rows[0] });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/tickets/:id — delete (super admin only) ───────────────────

router.delete("/tickets/:id", adminAuth, superAdminOnly, async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.execute("DELETE FROM ticket_events WHERE ticket_id = ?", [id]);
    await conn.execute("DELETE FROM tickets WHERE id = ?", [id]);
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

// ── GET /api/admin/users/commercial — legacy commercial users ─────────────

router.get("/admin/users/commercial", adminAuth, async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      "SELECT id, username, office_hub FROM admins WHERE role = 'commercial' ORDER BY username ASC"
    );
    res.json({ ok: true, users: rows });
  } finally {
    conn.release();
  }
});

// ── GET /api/admin/users/office — office agent users ─────────────────────

router.get("/admin/users/office", adminAuth, async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      "SELECT id, username, office_hub FROM admins WHERE role = 'office' ORDER BY username ASC"
    );
    res.json({ ok: true, users: rows });
  } finally {
    conn.release();
  }
});

export default router;
