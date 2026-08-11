import { Router } from "express";
import { pool } from "@workspace/db";
import { adminAuth, hashPassword, type AuthedRequest } from "../lib/adminAuth";

const router = Router();

// ── GET /api/admin/expediteurs — list expediteurs (admin or office) ─────────

router.get("/admin/expediteurs", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  if (role !== "admin" && role !== "office") return res.status(403).json({ ok: false, error: "Forbidden" });
  const conn = await pool.getConnection();
  try {
    if (role === "office") {
      // Office agents only see expediteurs linked to their own hub
      const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      const hub = me[0]?.office_hub ?? null;
      const [rows] = await conn.execute(
        "SELECT id, username, phone, email, office_hub, created_at AS createdAt FROM admins WHERE role='expediteur' AND parent_id IS NULL AND office_hub = ? ORDER BY created_at ASC",
        [hub]
      ) as any;
      res.json({ ok: true, expediteurs: rows });
    } else {
      const [rows] = await conn.execute(
        "SELECT id, username, phone, email, office_hub, created_at AS createdAt FROM admins WHERE role='expediteur' AND (parent_id IS NULL) ORDER BY created_at ASC"
      ) as any;
      res.json({ ok: true, expediteurs: rows });
    }
  } finally { conn.release(); }
});

// ── POST /api/admin/expediteurs — create expediteur (admin or office) ────────

router.post("/admin/expediteurs", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  if (role !== "admin" && role !== "office") return res.status(403).json({ ok: false, error: "Forbidden" });
  const body = req.body ?? {};
  const newUsername = String(body.username ?? "").trim().slice(0, 100);
  const password    = String(body.password ?? "");
  const phone       = String(body.phone ?? "").trim().slice(0, 20);
  const email       = String(body.email ?? "").trim().slice(0, 100);
  if (!newUsername || password.length < 8) return res.status(400).json({ ok: false, error: "invalid_fields" });
  const conn = await pool.getConnection();
  try {
    // Office agents: force office_hub to their own hub (ignore what the client sends)
    let officeHub: string | null;
    if (role === "office") {
      const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      officeHub = me[0]?.office_hub ?? null;
    } else {
      officeHub = String(body.office_hub ?? "").trim().slice(0, 200) || null;
    }
    const [ex] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [newUsername]) as any;
    if (ex.length > 0) return res.status(409).json({ ok: false, error: "username_taken" });
    const hash = await hashPassword(password);
    const [result] = await conn.execute(
      "INSERT INTO admins (username, password_hash, role, phone, email, office_hub) VALUES (?, ?, 'expediteur', ?, ?, ?)",
      [newUsername, hash, phone || null, email || null, officeHub]
    ) as any;
    res.json({ ok: true, id: result.insertId });
  } finally { conn.release(); }
});

// ── PUT /api/admin/expediteurs/:id — update expediteur (admin only) ──────────

router.put("/admin/expediteurs/:id", adminAuth, async (req: AuthedRequest, res) => {
  if (req.adminRole !== "admin") return res.status(403).json({ ok: false, error: "Forbidden" });
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
  const body = req.body ?? {};
  const username = String(body.username ?? "").trim().slice(0, 100);
  const password = body.password ? String(body.password) : null;
  const phone    = String(body.phone ?? "").trim().slice(0, 20);
  const email    = String(body.email ?? "").trim().slice(0, 100);
  const officeHub = String(body.office_hub ?? "").trim().slice(0, 200);
  if (!username) return res.status(400).json({ ok: false, error: "invalid_fields" });
  if (password !== null && password.length < 8) return res.status(400).json({ ok: false, error: "password_too_short" });
  const conn = await pool.getConnection();
  try {
    const [ex] = await conn.execute("SELECT id FROM admins WHERE username = ? AND id != ? LIMIT 1", [username, id]) as any;
    if (ex.length > 0) return res.status(409).json({ ok: false, error: "username_taken" });
    if (password) {
      const hash = await hashPassword(password);
      await conn.execute("UPDATE admins SET username=?, password_hash=?, phone=?, email=?, office_hub=? WHERE id=?", [username, hash, phone || null, email || null, officeHub || null, id]);
    } else {
      await conn.execute("UPDATE admins SET username=?, phone=?, email=?, office_hub=? WHERE id=?", [username, phone || null, email || null, officeHub || null, id]);
    }
    res.json({ ok: true });
  } finally { conn.release(); }
});

// ── DELETE /api/expediteur/payouts/:id — delete payout (admin only) ──────────

router.delete("/expediteur/payouts/:id", adminAuth, async (req: AuthedRequest, res) => {
  if (req.adminRole !== "admin") return res.status(403).json({ ok: false, error: "Forbidden" });
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
  const conn = await pool.getConnection();
  try {
    await conn.execute("DELETE FROM expediteur_payouts WHERE id = ?", [id]);
    res.json({ ok: true });
  } finally { conn.release(); }
});

// ── DELETE /api/admin/expediteurs/:id (admin only) ───────────────────────────

router.delete("/admin/expediteurs/:id", adminAuth, async (req: AuthedRequest, res) => {
  if (req.adminRole !== "admin") return res.status(403).json({ ok: false, error: "Forbidden" });
  const id = parseInt(req.params.id, 10);
  const conn = await pool.getConnection();
  try {
    // also delete their team accounts
    await conn.execute("DELETE FROM admins WHERE parent_id = ?", [id]);
    await conn.execute("DELETE FROM admins WHERE id = ? AND role = 'expediteur'", [id]);
    res.json({ ok: true });
  } finally { conn.release(); }
});

// ── GET /api/admin/users/expediteur — list expediteurs for ticket form ───────

router.get("/admin/users/expediteur", adminAuth, async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      "SELECT id, username, phone, email, office_hub FROM admins WHERE role='expediteur' AND parent_id IS NULL ORDER BY username ASC"
    ) as any;
    res.json({ ok: true, users: rows });
  } finally { conn.release(); }
});

// ── GET /api/admin/offices-simple — list offices for pickup_desk selection ──

router.get("/admin/offices-simple", adminAuth, async (_req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      "SELECT id, wilaya, commune, wilaya_number FROM offices ORDER BY wilaya_number ASC, wilaya ASC"
    ) as any;
    res.json({ ok: true, offices: rows });
  } finally { conn.release(); }
});

// ── GET /api/expediteur/payouts — list payout requests ───────────────────────

router.get("/expediteur/payouts", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    let rows: any[];
    if (role === "admin") {
      [rows] = await conn.execute("SELECT * FROM expediteur_payouts ORDER BY created_at DESC") as any;
    } else if (role === "office") {
      // office sees payouts for their office hub
      const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      const hub = me[0]?.office_hub;
      if (!hub) { rows = []; }
      else { [rows] = await conn.execute("SELECT * FROM expediteur_payouts WHERE office_hub = ? ORDER BY created_at DESC", [hub]) as any; }
    } else if (role === "expediteur") {
      [rows] = await conn.execute("SELECT * FROM expediteur_payouts WHERE expediteur_username = ? ORDER BY created_at DESC", [username]) as any;
    } else {
      rows = [];
    }
    res.json({ ok: true, payouts: rows });
  } finally { conn.release(); }
});

// ── POST /api/expediteur/payouts — create payout request (expediteur only) ──

router.post("/expediteur/payouts", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  if (role !== "expediteur") return res.status(403).json({ ok: false, error: "Forbidden" });
  const body = req.body ?? {};
  const amount = parseInt(String(body.amount_dzd ?? "0"), 10);
  const date   = String(body.requested_date ?? "").slice(0, 10);
  const notes  = String(body.expediteur_notes ?? "").slice(0, 500);
  if (!amount || amount <= 0 || !date) return res.status(400).json({ ok: false, error: "invalid_fields" });
  const conn = await pool.getConnection();
  try {
    const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
    const hub = me[0]?.office_hub;
    if (!hub) return res.status(400).json({ ok: false, error: "no_office_linked" });
    const [result] = await conn.execute(
      "INSERT INTO expediteur_payouts (expediteur_username, office_hub, amount_dzd, requested_date, expediteur_notes) VALUES (?, ?, ?, ?, ?)",
      [username, hub, amount, date, notes || null]
    ) as any;
    res.json({ ok: true, id: result.insertId });
  } finally { conn.release(); }
});

// ── PUT /api/expediteur/payouts/:id — update status (office or admin) ────────

router.put("/expediteur/payouts/:id", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
  const VALID_STATUSES = ["pending", "accepted", "refused", "delayed", "paid"];
  const status = String(req.body?.status ?? "");
  const adminNotes = String(req.body?.admin_notes ?? "").slice(0, 500);
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ ok: false, error: "invalid_status" });
  const conn = await pool.getConnection();
  try {
    const [[payout]] = await conn.execute("SELECT * FROM expediteur_payouts WHERE id = ? LIMIT 1", [id]) as any;
    if (!payout) return res.status(404).json({ ok: false, error: "Not found" });
    if (role !== "admin") {
      // office can only update payouts for their hub
      const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      const hub = me[0]?.office_hub;
      if (role !== "office" || payout.office_hub !== hub) return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    await conn.execute(
      "UPDATE expediteur_payouts SET status=?, admin_notes=? WHERE id=?",
      [status, adminNotes || null, id]
    );
    res.json({ ok: true });
  } finally { conn.release(); }
});

// ── GET /api/admin/team — list team accounts for current user ─────────────────

router.get("/admin/team", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    let rows: any[];
    if (role === "admin") {
      // super admin sees all team accounts
      [rows] = await conn.execute(
        "SELECT a.id, a.username, a.role, a.permissions, a.created_at AS createdAt, p.username AS parent_username FROM admins a LEFT JOIN admins p ON a.parent_id = p.id WHERE a.parent_id IS NOT NULL ORDER BY a.created_at DESC"
      ) as any;
    } else {
      // expediteur/office sees only their own sub-accounts
      const [[me]] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      if (!me) { rows = []; }
      else {
        [rows] = await conn.execute(
          "SELECT id, username, role, permissions, created_at AS createdAt FROM admins WHERE parent_id = ? ORDER BY created_at DESC",
          [me.id]
        ) as any;
      }
    }
    res.json({ ok: true, accounts: rows });
  } finally { conn.release(); }
});

// ── POST /api/admin/team — create team sub-account ────────────────────────────

router.post("/admin/team", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  if (!["admin", "expediteur", "office"].includes(role)) return res.status(403).json({ ok: false, error: "Forbidden" });
  const body = req.body ?? {};
  const newUsername = String(body.username ?? "").trim().slice(0, 100);
  const password    = String(body.password ?? "");
  const permissions = Array.isArray(body.permissions) ? body.permissions as string[] : [];
  if (!newUsername || password.length < 8) return res.status(400).json({ ok: false, error: "invalid_fields" });
  const conn = await pool.getConnection();
  try {
    // find the creator's ID
    const [[me]] = await conn.execute("SELECT id, office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
    if (!me) return res.status(400).json({ ok: false, error: "creator_not_found" });
    // check username unique
    const [ex] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [newUsername]) as any;
    if (ex.length > 0) return res.status(409).json({ ok: false, error: "username_taken" });
    const hash = await hashPassword(password);
    const parentId = role === "admin" ? null : me.id; // admin team accounts have no parent constraint
    const officeHub = me.office_hub;
    const [result] = await conn.execute(
      "INSERT INTO admins (username, password_hash, role, office_hub, parent_id, permissions) VALUES (?, ?, ?, ?, ?, ?)",
      [newUsername, hash, role, officeHub || null, parentId, JSON.stringify(permissions)]
    ) as any;
    res.json({ ok: true, id: result.insertId });
  } finally { conn.release(); }
});

// ── DELETE /api/admin/team/:id — delete team sub-account ─────────────────────

router.delete("/admin/team/:id", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
  const conn = await pool.getConnection();
  try {
    const [[target]] = await conn.execute("SELECT parent_id, role FROM admins WHERE id = ? LIMIT 1", [id]) as any;
    if (!target || target.parent_id === null) return res.status(404).json({ ok: false, error: "not_found" });
    if (role !== "admin") {
      const [[me]] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      if (!me || me.id !== target.parent_id) return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    await conn.execute("DELETE FROM admins WHERE id = ?", [id]);
    res.json({ ok: true });
  } finally { conn.release(); }
});

export default router;
