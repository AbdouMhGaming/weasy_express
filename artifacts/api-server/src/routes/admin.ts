import { Router, type IRouter } from "express";
import { db, partnersTable, officesTable, adminsTable, eq, desc, asc } from "@workspace/db";
import {
  adminAuth,
  superAdminOnly,
  generateToken,
  verifyAdminCredentials,
  verifyPassword,
  hashPassword,
  updateAdminPassword,
  findAdmin,
  type AuthedRequest,
} from "../lib/adminAuth";

const router: IRouter = Router();

// ── Auth ──────────────────────────────────────────────────────────────────────

router.post("/admin/login", async (req, res) => {
  const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    res.status(400).json({ ok: false, error: "missing_fields" }); return;
  }
  let result: { valid: boolean; role?: string };
  try {
    result = await verifyAdminCredentials(username, password);
  } catch (err) {
    req.log.error({ err }, "DB error during admin login");
    res.status(500).json({ ok: false, error: "db_error" }); return;
  }
  if (!result.valid) {
    res.status(401).json({ ok: false, error: "invalid_credentials" }); return;
  }
  res.json({ ok: true, token: generateToken(username, result.role!), role: result.role });
});

router.post("/admin/verify", adminAuth, (req, res) => {
  res.json({ ok: true, role: (req as AuthedRequest).adminRole });
});

router.post("/admin/change-password", adminAuth, async (req, res) => {
  const username = (req as AuthedRequest).adminUsername ?? "";
  const body = (req.body ?? {}) as { currentPassword?: unknown; newPassword?: unknown };
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (!currentPassword || !newPassword) {
    res.status(400).json({ ok: false, error: "missing_fields" }); return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ ok: false, error: "password_too_short" }); return;
  }
  try {
    const admin = await findAdmin(username);
    if (!admin) { res.status(404).json({ ok: false, error: "admin_not_found" }); return; }
    const isCorrect = await verifyPassword(currentPassword, admin.passwordHash);
    if (!isCorrect) { res.status(401).json({ ok: false, error: "wrong_current_password" }); return; }
    await updateAdminPassword(username, await hashPassword(newPassword));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to change admin password");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Admin management (super admin only) ───────────────────────────────────────

router.get("/admin/admins", adminAuth, superAdminOnly, async (req, res) => {
  try {
    const rows = await db.select({
      id: adminsTable.id,
      username: adminsTable.username,
      role: adminsTable.role,
      createdAt: adminsTable.createdAt,
    }).from(adminsTable).orderBy(asc(adminsTable.createdAt));
    res.json({ ok: true, admins: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admins");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/admins", adminAuth, superAdminOnly, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const username = String(body.username ?? "").trim().slice(0, 100);
  const password = String(body.password ?? "");
  const role = String(body.role ?? "office");
  const validRoles = ["admin", "office", "finance", "commercial"];
  if (!username || password.length < 8 || !validRoles.includes(role)) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const existing = await db.select({ id: adminsTable.id }).from(adminsTable).where(eq(adminsTable.username, username)).limit(1);
    if (existing.length > 0) { res.status(409).json({ ok: false, error: "username_taken" }); return; }
    const hash = await hashPassword(password);
    const [result] = await db.insert(adminsTable).values({ username, passwordHash: hash, role });
    res.json({ ok: true, id: (result as { insertId: number }).insertId });
  } catch (err) {
    req.log.error({ err }, "Failed to create admin");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/admins/:id", adminAuth, superAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const selfUsername = (req as AuthedRequest).adminUsername ?? "";
  try {
    const rows = await db.select({ username: adminsTable.username }).from(adminsTable).where(eq(adminsTable.id, id)).limit(1);
    if (rows.length > 0 && rows[0].username === selfUsername) {
      res.status(400).json({ ok: false, error: "cannot_delete_self" }); return;
    }
    await db.delete(adminsTable).where(eq(adminsTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete admin");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Partners ──────────────────────────────────────────────────────────────────

router.get("/admin/partners", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(partnersTable).orderBy(desc(partnersTable.createdAt));
    res.json({ ok: true, partners: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch partners");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.patch("/admin/partners/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const body = (req.body ?? {}) as { status?: unknown; notes?: unknown };
  const allowed = ["pending", "reviewing", "approved", "rejected"];
  if (body.status !== undefined && !allowed.includes(String(body.status))) {
    res.status(400).json({ ok: false, error: "invalid_status" }); return;
  }
  const update: Record<string, string> = {};
  if (body.status !== undefined) update["status"] = String(body.status);
  if (body.notes !== undefined) update["notes"] = String(body.notes);
  if (Object.keys(update).length === 0) { res.status(400).json({ ok: false, error: "no_fields" }); return; }
  try {
    await db.update(partnersTable).set(update).where(eq(partnersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update partner");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/partners/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    await db.delete(partnersTable).where(eq(partnersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete partner");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Offices ───────────────────────────────────────────────────────────────────

router.get("/admin/offices", adminAuth, async (req, res) => {
  try {
    const rows = await db.select().from(officesTable).orderBy(asc(officesTable.wilayaNumber), asc(officesTable.id));
    res.json({ ok: true, offices: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch offices");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/offices", adminAuth, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const wilayaNumber = parseInt(String(body.wilayaNumber ?? ""), 10);
  const wilaya = String(body.wilaya ?? "").trim().slice(0, 100);
  const commune = body.commune ? String(body.commune).trim().slice(0, 100) : undefined;
  const address = String(body.address ?? "").trim().slice(0, 1000);
  const phone = body.phone ? String(body.phone).trim().slice(0, 50) : undefined;
  const mapsUrl = String(body.mapsUrl ?? "").trim().slice(0, 2000);
  const isPrincipal = body.isPrincipal === true || body.isPrincipal === "true";
  if (isNaN(wilayaNumber) || !wilaya || !address || !mapsUrl) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const [result] = await db.insert(officesTable).values({ wilayaNumber, wilaya, commune, address, phone, mapsUrl, isPrincipal });
    res.json({ ok: true, id: (result as { insertId: number }).insertId });
  } catch (err) {
    req.log.error({ err }, "Failed to create office");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.patch("/admin/offices/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  if (body.wilayaNumber !== undefined) update["wilayaNumber"] = parseInt(String(body.wilayaNumber), 10);
  if (body.wilaya !== undefined) update["wilaya"] = String(body.wilaya).trim().slice(0, 100);
  if (body.commune !== undefined) update["commune"] = body.commune ? String(body.commune).trim().slice(0, 100) : null;
  if (body.address !== undefined) update["address"] = String(body.address).trim().slice(0, 1000);
  if (body.phone !== undefined) update["phone"] = body.phone ? String(body.phone).trim().slice(0, 50) : null;
  if (body.mapsUrl !== undefined) update["mapsUrl"] = String(body.mapsUrl).trim().slice(0, 2000);
  if (body.isPrincipal !== undefined) update["isPrincipal"] = body.isPrincipal === true || body.isPrincipal === "true";
  if (Object.keys(update).length === 0) { res.status(400).json({ ok: false, error: "no_fields" }); return; }
  try {
    await db.update(officesTable).set(update).where(eq(officesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update office");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/offices/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    await db.delete(officesTable).where(eq(officesTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete office");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

export default router;
