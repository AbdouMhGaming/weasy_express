import { Router } from "express";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { adminAuth, hashPassword, type AuthedRequest } from "../lib/adminAuth";
import { decryptEcotrackToken, encryptEcotrackToken, normalizeEcotrackToken, validateEcotrackToken } from "../lib/ecotrack";
import { clearEcotrackRuntimeCache } from "../lib/ecotrackRuntimeCache";
import { queueEcotrackFullSync, withEcotrackAccountLock } from "../lib/ecotrackSync";

const router = Router();
const TEAM_PERMISSIONS: Record<string, string[]> = {
  office: ["office-dashboard","expediteurs","queue","payouts","team","returns","merchants","messaging","analytics"],
  expediteur: ["ecotrack","ecotrack-desks","ecotrack-fees","ecotrack-products","queue","payouts","team"],
  admin_team: ["ecotrack","team","expediteurs","queue","payouts","returns","merchants","messaging","analytics","users"],
};
// Scope the guard to this router's non-admin prefix. /admin routes are already
// protected by the admin router's ticket-manager guard.
router.use("/expediteur", adminAuth, (req, res, next) => {
  if ((req as AuthedRequest).adminRole === "ticket_manager") {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  next();
});

async function getRootExpediteur(req: AuthedRequest) {
  const username = req.adminDataUsername ?? req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    const [[account]] = await conn.execute(
      "SELECT id, username, parent_id FROM admins WHERE username = ? AND role = 'expediteur' LIMIT 1",
      [username],
    ) as any;
    return account ?? null;
  } finally {
    conn.release();
  }
}

// ── Ecotrack credentials (root Expediteur only) ─────────────────────────────

router.get("/expediteur/ecotrack/settings", adminAuth, async (req: AuthedRequest, res) => {
  if (req.adminRole !== "expediteur") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  if (req.adminDataUsername && req.adminDataUsername !== req.adminUsername) {
    return res.status(403).json({ ok: false, error: "root_account_required" });
  }
  const account = await getRootExpediteur(req);
  if (!account || account.parent_id) {
    return res.status(403).json({ ok: false, error: "root_account_required" });
  }
  const conn = await pool.getConnection();
  try {
    const [[credential]] = await conn.execute(
      `SELECT token_ciphertext, token_iv, token_auth_tag, token_hint, connection_status, last_validated_at, updated_at
       FROM expediteur_ecotrack_credentials WHERE expediteur_id = ? LIMIT 1`,
      [account.id],
    ) as any;
    let decryptable = false;
    if (credential) {
      try {
        decryptEcotrackToken(credential.token_ciphertext, credential.token_iv, credential.token_auth_tag);
        decryptable = true;
      } catch {
        decryptable = false;
      }
    }
    res.json({
      ok: true,
      connected: Boolean(credential) && decryptable,
      tokenHint: credential?.token_hint ?? null,
      status: credential && !decryptable ? "reconnect_required" : credential?.connection_status ?? "disconnected",
      lastValidatedAt: credential?.last_validated_at ?? null,
      updatedAt: credential?.updated_at ?? null,
    });
  } finally {
    conn.release();
  }
});

router.put("/expediteur/ecotrack/settings", adminAuth, async (req: AuthedRequest, res) => {
  if (req.adminRole !== "expediteur") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  if (req.adminDataUsername && req.adminDataUsername !== req.adminUsername) {
    return res.status(403).json({ ok: false, error: "root_account_required" });
  }
  const account = await getRootExpediteur(req);
  if (!account || account.parent_id) {
    return res.status(403).json({ ok: false, error: "root_account_required" });
  }
  // Accept common copied token formats without persisting wrappers or URL text.
  const token = normalizeEcotrackToken(req.body?.token);
  if (token.length < 10 || token.length > 2000) {
    return res.status(400).json({ ok: false, error: "invalid_token_format" });
  }

  const validation = await validateEcotrackToken(token);
  if (!validation.valid) {
    const status = validation.reason === "unavailable" ? 502 : 400;
    return res.status(status).json({ ok: false, error: `ecotrack_${validation.reason}` });
  }

  const encrypted = encryptEcotrackToken(token);
  await withEcotrackAccountLock(account.id, async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        `INSERT INTO expediteur_ecotrack_credentials
         (expediteur_id, token_ciphertext, token_iv, token_auth_tag, token_hint, connection_status, last_validated_at)
         VALUES (?, ?, ?, ?, ?, 'connected', NOW())
         ON DUPLICATE KEY UPDATE
           token_ciphertext = VALUES(token_ciphertext),
           token_iv = VALUES(token_iv),
           token_auth_tag = VALUES(token_auth_tag),
           token_hint = VALUES(token_hint),
           connection_status = 'connected',
           last_validated_at = NOW()`,
        [account.id, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.hint],
      );
      await conn.execute("DELETE FROM expediteur_ecotrack_order_cache WHERE expediteur_id = ?", [account.id]);
      await conn.execute("DELETE FROM expediteur_ecotrack_sync_state WHERE expediteur_id = ?", [account.id]);
      await conn.execute(
        `INSERT INTO expediteur_ecotrack_sync_state
         (expediteur_id, next_page, last_page, last_synced_at, blocked_until)
         VALUES (?, 1, NULL, NULL, NULL)`,
        [account.id],
      );
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  });
  clearEcotrackRuntimeCache(account.id);
  queueEcotrackFullSync(account.id, token);
  res.json({ ok: true, connected: true, tokenHint: encrypted.hint });
});

router.delete("/expediteur/ecotrack/settings", adminAuth, async (req: AuthedRequest, res) => {
  if (req.adminRole !== "expediteur") {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  if (req.adminDataUsername && req.adminDataUsername !== req.adminUsername) {
    return res.status(403).json({ ok: false, error: "root_account_required" });
  }
  const account = await getRootExpediteur(req);
  if (!account || account.parent_id) {
    return res.status(403).json({ ok: false, error: "root_account_required" });
  }
  await withEcotrackAccountLock(account.id, async () => {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute("DELETE FROM expediteur_ecotrack_credentials WHERE expediteur_id = ?", [account.id]);
      await conn.execute("DELETE FROM expediteur_ecotrack_order_cache WHERE expediteur_id = ?", [account.id]);
      await conn.execute("DELETE FROM expediteur_ecotrack_sync_state WHERE expediteur_id = ?", [account.id]);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  });
  clearEcotrackRuntimeCache(account.id);
  res.json({ ok: true });
});

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
  // For team sub-accounts, scope data to the parent expediteur's username
  const dataUsername = req.adminDataUsername ?? username;
  const conn = await pool.getConnection();
  try {
    let rows: any[];
    if (role === "admin") {
      [rows] = await conn.execute("SELECT p.*, a.id expediteur_id, a.phone expediteur_phone, a.email expediteur_email FROM expediteur_payouts p LEFT JOIN admins a ON BINARY a.username=BINARY p.expediteur_username AND a.role='expediteur' ORDER BY p.created_at DESC") as any;
    } else if (role === "office") {
      const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      const hub = me[0]?.office_hub;
      if (!hub) { rows = []; }
      else { [rows] = await conn.execute("SELECT p.*, a.id expediteur_id, a.phone expediteur_phone, a.email expediteur_email FROM expediteur_payouts p LEFT JOIN admins a ON BINARY a.username=BINARY p.expediteur_username AND a.role='expediteur' WHERE p.office_hub = ? ORDER BY p.created_at DESC", [hub]) as any; }
    } else if (role === "expediteur") {
      [rows] = await conn.execute("SELECT p.*, a.id expediteur_id, a.phone expediteur_phone, a.email expediteur_email FROM expediteur_payouts p LEFT JOIN admins a ON BINARY a.username=BINARY p.expediteur_username AND a.role='expediteur' WHERE p.expediteur_username = ? ORDER BY p.created_at DESC", [dataUsername]) as any;
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
  const dataUsername = req.adminDataUsername ?? username;
  if (role !== "expediteur") return res.status(403).json({ ok: false, error: "Forbidden" });
  const body = req.body ?? {};
  const amount = parseInt(String(body.amount_dzd ?? "0"), 10);
  const date   = String(body.requested_date ?? "").slice(0, 10);
  const notes  = String(body.expediteur_notes ?? "").slice(0, 500);
  const address = String(body.client_address ?? "").trim().slice(0, 500);
  if (!amount || amount <= 0 || !date) return res.status(400).json({ ok: false, error: "invalid_fields" });
  const conn = await pool.getConnection();
  try {
    // Look up hub from the parent account (dataUsername) so team members inherit it
    const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [dataUsername]) as any;
    const hub = me[0]?.office_hub;
    if (!hub) return res.status(400).json({ ok: false, error: "no_office_linked" });
    const [result] = await conn.execute(
      "INSERT INTO expediteur_payouts (expediteur_username, office_hub, amount_dzd, requested_date, expediteur_notes, client_address) VALUES (?, ?, ?, ?, ?, ?)",
      [dataUsername, hub, amount, date, notes || null, address || null]
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
    if (payout.status === "paid" && status !== "paid") {
      return res.status(409).json({ ok: false, error: "already_paid" });
    }
    if (status === "paid" && role !== "admin") {
      return res.status(403).json({ ok: false, error: "only_super_admin_can_mark_paid" });
    }
    if (role !== "admin") {
      // office can only update payouts for their hub
      const [me] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      const hub = me[0]?.office_hub;
      if (role !== "office" || payout.office_hub !== hub) return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    if (status === "accepted" && payout.status !== "accepted") {
      const token = crypto.randomBytes(32).toString("base64url");
      const receipt = `PV${String(payout.id).padStart(8, "0")}`;
      await conn.execute(
        "UPDATE expediteur_payouts SET status=?, admin_notes=?, confirmation_token=?, receipt_number=?, approved_at=CURRENT_TIMESTAMP WHERE id=?",
        [status, adminNotes || null, token, receipt, id],
      );
      return res.json({ ok: true, confirmation_token: token, receipt_number: receipt });
    }
    await conn.execute(
      status === "paid"
        ? "UPDATE expediteur_payouts SET status=?, admin_notes=?, paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP) WHERE id=?"
        : "UPDATE expediteur_payouts SET status=?, admin_notes=? WHERE id=?",
      [status, adminNotes || null, id],
    );
    res.json({ ok: true });
  } finally { conn.release(); }
});

// QR links are intentionally read-only. Payment confirmation requires the
// authenticated owning Expediteur and a POST, so a scanner/crawler cannot pay.
router.get("/expediteur/payouts/:id/receipt", adminAuth, async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
  const conn = await pool.getConnection();
  try {
    const [[payout]] = await conn.execute("SELECT * FROM expediteur_payouts WHERE id=? LIMIT 1", [id]) as any;
    if (!payout) return res.status(404).json({ ok: false, error: "not_found" });
    const role = req.adminRole;
    if (role === "office") {
      const [[me]] = await conn.execute("SELECT office_hub FROM admins WHERE username=? LIMIT 1", [req.adminUsername]) as any;
      if (!me?.office_hub || me.office_hub !== payout.office_hub) return res.status(403).json({ ok: false, error: "forbidden" });
    } else if (role === "expediteur" && (req.adminDataUsername ?? req.adminUsername) !== payout.expediteur_username) {
      return res.status(403).json({ ok: false, error: "forbidden" });
    } else if (!["admin", "office", "expediteur"].includes(role ?? "")) return res.status(403).json({ ok: false, error: "forbidden" });
    res.json({ ok: true, payout });
  } finally { conn.release(); }
});

router.post("/expediteur/payouts/:id/confirm", adminAuth, async (req: AuthedRequest, res) => {
  if (req.adminRole !== "expediteur") return res.status(403).json({ ok: false, error: "expediteur_confirmation_only" });
  const id = Number(req.params.id);
  const token = String(req.body?.confirmation_token ?? "");
  if (!Number.isInteger(id) || !token) return res.status(400).json({ ok: false, error: "invalid_confirmation" });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[payout]] = await conn.execute("SELECT * FROM expediteur_payouts WHERE id=? FOR UPDATE", [id]) as any;
    if (!payout || payout.expediteur_username !== (req.adminDataUsername ?? req.adminUsername)) {
      await conn.rollback(); return res.status(403).json({ ok: false, error: "forbidden" });
    }
    if (payout.status === "paid") { await conn.commit(); return res.json({ ok: true, already_paid: true }); }
    if (payout.status !== "accepted" || payout.confirmation_token !== token) {
      await conn.rollback(); return res.status(409).json({ ok: false, error: "confirmation_expired" });
    }
    const [result] = await conn.execute(
      "UPDATE expediteur_payouts SET status='paid', paid_at=CURRENT_TIMESTAMP, confirmation_token=NULL WHERE id=? AND status='accepted' AND confirmation_token=?",
      [id, token],
    ) as any;
    if (!result.affectedRows) { await conn.rollback(); return res.status(409).json({ ok: false, error: "already_confirmed" }); }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) { await conn.rollback(); throw err; } finally { conn.release(); }
});

// ── GET /api/admin/team — list team accounts for current user ─────────────────

router.get("/admin/team", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    let rows: any[];
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize ?? req.query.per_page) || 50));
    const search = String(req.query.search ?? "").trim().slice(0, 100);
    const parentRole = String(req.query.parent_role ?? req.query.parentRole ?? "").trim();
    const parentUsername = String(req.query.parent_username ?? req.query.parentUsername ?? "").trim().slice(0, 100);
    const where = ["a.parent_id IS NOT NULL"];
    const params: any[] = [];
    if (search) { where.push("a.username LIKE ?"); params.push(`%${search}%`); }
    if (role === "admin") {
      if (parentRole && ["admin","office","expediteur"].includes(parentRole)) { where.push("p.role=?"); params.push(parentRole); }
      if (parentUsername) { where.push("p.username=?"); params.push(parentUsername); }
    } else {
      where.push("a.parent_id = (SELECT id FROM admins WHERE username = ? LIMIT 1)");
      params.push(username);
    }
    if (role === "admin") {
      // super admin sees all team accounts with full parent info
      [rows] = await conn.execute(
        `SELECT a.id, a.username, a.role, a.permissions, a.created_at AS createdAt,
                p.username AS parent_username, p.role AS parent_role, p.office_hub AS parent_hub
         FROM admins a
         LEFT JOIN admins p ON a.parent_id = p.id
         WHERE ${where.join(" AND ")}
         ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize],
      ) as any;
    } else {
      // expediteur/office sees only their own sub-accounts
      const [[me]] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      if (!me) { rows = []; }
      else {
        [rows] = await conn.execute(
          `SELECT id, username, role, permissions, created_at AS createdAt FROM admins
           WHERE parent_id = ? ${search ? "AND username LIKE ?" : ""} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          search ? [me.id, `%${search}%`, pageSize, (page - 1) * pageSize] : [me.id, pageSize, (page - 1) * pageSize],
        ) as any;
      }
    }
    const [[totalRow]] = await conn.execute(
      role === "admin" ? `SELECT COUNT(*) total FROM admins a LEFT JOIN admins p ON a.parent_id=p.id WHERE ${where.join(" AND ")}` : `SELECT COUNT(*) total FROM admins WHERE parent_id=(SELECT id FROM admins WHERE username=? LIMIT 1)${search ? " AND username LIKE ?" : ""}` ,
      role === "admin" ? params : (search ? [username, `%${search}%`] : [username]),
    ) as any;
    res.json({ ok: true, accounts: rows, pagination: { current_page: page, per_page: pageSize, total: Number(totalRow?.total ?? rows.length), last_page: Math.max(1, Math.ceil(Number(totalRow?.total ?? rows.length) / pageSize)) } });
  } finally { conn.release(); }
});

router.get("/admin/team/parents", adminAuth, async (req: AuthedRequest, res) => {
  if ((req as AuthedRequest).adminRole !== "admin") return res.status(403).json({ ok: false, error: "Forbidden" });
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize ?? req.query.per_page) || 100));
  const search = String(req.query.search ?? "").trim().slice(0, 100);
  const where = ["parent_id IS NULL", "role IN ('admin','office','expediteur')"];
  const params: any[] = [];
  if (search) { where.push("username LIKE ?"); params.push(`%${search}%`); }
  const conn = await pool.getConnection();
  try {
    const [[totalRow]] = await conn.execute(`SELECT COUNT(*) total FROM admins WHERE ${where.join(" AND ")}`, params) as any;
    const [rows] = await conn.execute(
      `SELECT id,username,role,office_hub AS officeHub FROM admins WHERE ${where.join(" AND ")}
       ORDER BY username ASC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize],
    ) as any;
    const total = Number(totalRow?.total ?? 0);
    return res.json({ ok: true, parents: rows, pagination: { current_page: page, per_page: pageSize, total, last_page: Math.max(1, Math.ceil(total / pageSize)) } });
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
  const requestedPermissions = Array.isArray(body.permissions) ? body.permissions as string[] : [];
  if (!newUsername || password.length < 8) return res.status(400).json({ ok: false, error: "invalid_fields" });
  const conn = await pool.getConnection();
  try {
    let parentId: number | null;
    let insertRole: string;
    let officeHub: string | null;

    if (role === "admin") {
      // admin must specify a parent_username to link the sub-account to
      const parentUname = String(body.parent_username ?? "").trim();
      if (!parentUname) return res.status(400).json({ ok: false, error: "parent_required" });
      const [[parent]] = await conn.execute(
        "SELECT id, role, office_hub FROM admins WHERE username = ? AND parent_id IS NULL LIMIT 1",
        [parentUname]
      ) as any;
      if (!parent || !["admin","office","expediteur"].includes(parent.role)) return res.status(400).json({ ok: false, error: "parent_not_found" });
      parentId   = parent.id;
       insertRole = parent.role === "admin" ? "admin_team" : parent.role;
      officeHub  = parent.office_hub ?? null;
    } else {
      const [[me]] = await conn.execute("SELECT id, office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      if (!me) return res.status(400).json({ ok: false, error: "creator_not_found" });
      parentId   = me.id;
       insertRole = role;
      officeHub  = me.office_hub ?? null;
    }
    const permissions = requestedPermissions.filter((key) => (TEAM_PERMISSIONS[insertRole] ?? []).includes(String(key)));

    // check username unique
    const [ex] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [newUsername]) as any;
    if (ex.length > 0) return res.status(409).json({ ok: false, error: "username_taken" });
    const hash = await hashPassword(password);
    const [result] = await conn.execute(
      "INSERT INTO admins (username, password_hash, role, office_hub, parent_id, permissions) VALUES (?, ?, ?, ?, ?, ?)",
      [newUsername, hash, insertRole, officeHub, parentId, JSON.stringify(permissions)]
    ) as any;
    res.json({ ok: true, id: result.insertId });
  } finally { conn.release(); }
});

// ── PUT /api/admin/team/:id — edit team sub-account (password + permissions) ──

router.put("/admin/team/:id", adminAuth, async (req: AuthedRequest, res) => {
  const role = req.adminRole!;
  const username = req.adminUsername!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
  const body = req.body ?? {};
  const newPassword   = String(body.password ?? "").trim();
  const permissions   = Array.isArray(body.permissions) ? body.permissions as string[] : null;
  const parentUname   = typeof body.parent_username === "string" ? body.parent_username.trim() : null;
  if (newPassword && newPassword.length < 8) return res.status(400).json({ ok: false, error: "password_too_short" });
  const conn = await pool.getConnection();
  try {
    const [[target]] = await conn.execute("SELECT parent_id, role FROM admins WHERE id = ? LIMIT 1", [id]) as any;
    if (!target || target.parent_id === null) return res.status(404).json({ ok: false, error: "not_found" });
    if (role !== "admin") {
      const [[me]] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [username]) as any;
      if (!me || me.id !== target.parent_id) return res.status(403).json({ ok: false, error: "Forbidden" });
    }
    // Admin: optionally re-link to a different parent
    if (role === "admin" && parentUname) {
      const [[newParent]] = await conn.execute(
        "SELECT id, role, office_hub FROM admins WHERE username = ? AND parent_id IS NULL LIMIT 1",
        [parentUname]
      ) as any;
       if (!newParent || !["admin", "office", "expediteur"].includes(newParent.role)) return res.status(400).json({ ok: false, error: "parent_not_found" });
      await conn.execute(
        "UPDATE admins SET parent_id = ?, role = ?, office_hub = ? WHERE id = ?",
        [newParent.id, newParent.role === "admin" ? "admin_team" : newParent.role, newParent.office_hub ?? null, id]
      );
    }
    if (newPassword) {
      const hash = await hashPassword(newPassword);
      await conn.execute("UPDATE admins SET password_hash = ? WHERE id = ?", [hash, id]);
    }
    if (permissions !== null) {
      const safePermissions = permissions.filter((key) => (TEAM_PERMISSIONS[target.role] ?? []).includes(String(key)));
      await conn.execute("UPDATE admins SET permissions = ? WHERE id = ?", [JSON.stringify(safePermissions), id]);
    }
    res.json({ ok: true });
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
