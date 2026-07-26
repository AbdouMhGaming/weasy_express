import { Router, type IRouter } from "express";
import multer2 from "multer";
import { mkdirSync, writeFileSync, existsSync, createReadStream } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const UPLOADS_DIR = join(process.cwd(), "uploads", "commissions");
mkdirSync(UPLOADS_DIR, { recursive: true });
import { db, pool, partnersTable, officesTable, adminsTable, ordersTable, chargesTable, payoutsTable, eq, desc, asc, count, isNotNull, sql, and } from "@workspace/db";
import { gte, lte } from "drizzle-orm";
import {
  adminAuth,
  superAdminOnly,
  financeOrAdminOnly,
  commercialOrAdminOnly,
  generateToken,
  verifyToken,
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
  let commercialSettings: { allowedPartnerStatuses: string | null; canChangePartnerStatus: boolean } | null = null;
  if (result.role === "commercial") {
    try {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute(
          "SELECT allowed_partner_statuses, can_change_partner_status FROM admins WHERE username = ? LIMIT 1", [username]
        );
        const row = (rows as Array<{ allowed_partner_statuses: string | null; can_change_partner_status: number }>)[0];
        if (row) commercialSettings = { allowedPartnerStatuses: row.allowed_partner_statuses, canChangePartnerStatus: row.can_change_partner_status === 1 };
      } finally { conn.release(); }
    } catch { /* non-fatal */ }
  }
  res.json({ ok: true, token: generateToken(username, result.role!), role: result.role, ...(commercialSettings ?? {}) });
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
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT id, username, role, office_hub, allowed_partner_statuses, can_change_partner_status, created_at AS createdAt FROM admins ORDER BY created_at ASC"
      );
      res.json({ ok: true, admins: rows });
    } finally { conn.release(); }
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
  const officeHub = String(body.office_hub ?? "").trim().slice(0, 200);
  const validRoles = ["admin", "office", "finance", "commercial"];
  if (!username || password.length < 8 || !validRoles.includes(role)) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [existing] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [username]);
      if ((existing as unknown[]).length > 0) { res.status(409).json({ ok: false, error: "username_taken" }); return; }
      const hash = await hashPassword(password);
      const allowedStatuses = role === "commercial" && Array.isArray(body.allowed_partner_statuses)
        ? JSON.stringify((body.allowed_partner_statuses as string[]).filter((s) => ["pending", "reviewing", "approved", "rejected"].includes(s)))
        : null;
      const canChangeStatus = role === "commercial" ? (body.can_change_partner_status === true ? 1 : 0) : 0;
      const [result] = await conn.execute(
        "INSERT INTO admins (username, password_hash, role, office_hub, allowed_partner_statuses, can_change_partner_status) VALUES (?, ?, ?, ?, ?, ?)",
        [username, hash, role, officeHub, allowedStatuses, canChangeStatus]
      );
      res.json({ ok: true, id: (result as { insertId: number }).insertId });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create admin");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.put("/admin/admins/:id", adminAuth, superAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const username = String(body.username ?? "").trim().slice(0, 100);
  const password = body.password ? String(body.password) : null;
  const role = String(body.role ?? "office");
  const officeHub = String(body.office_hub ?? "").trim().slice(0, 200);
  const validRoles = ["admin", "office", "finance", "commercial"];
  if (!username || !validRoles.includes(role)) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  if (password !== null && password.length < 8) {
    res.status(400).json({ ok: false, error: "password_too_short" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [existing] = await conn.execute("SELECT id FROM admins WHERE username = ? LIMIT 1", [username]);
      if ((existing as Array<{ id: number }>).length > 0 && (existing as Array<{ id: number }>)[0].id !== id) {
        res.status(409).json({ ok: false, error: "username_taken" }); return;
      }
      const allowedStatuses = role === "commercial" && Array.isArray(body.allowed_partner_statuses)
        ? JSON.stringify((body.allowed_partner_statuses as string[]).filter((s) => ["pending", "reviewing", "approved", "rejected"].includes(s)))
        : null;
      const canChangeStatus = role === "commercial" ? (body.can_change_partner_status === true ? 1 : 0) : 0;
      if (password !== null) {
        const hash = await hashPassword(password);
        await conn.execute("UPDATE admins SET username=?, role=?, password_hash=?, office_hub=?, allowed_partner_statuses=?, can_change_partner_status=? WHERE id=?", [username, role, hash, officeHub, allowedStatuses, canChangeStatus, id]);
      } else {
        await conn.execute("UPDATE admins SET username=?, role=?, office_hub=?, allowed_partner_statuses=?, can_change_partner_status=? WHERE id=?", [username, role, officeHub, allowedStatuses, canChangeStatus, id]);
      }
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to update admin");
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
  const role = (req as AuthedRequest).adminRole;
  const username = (req as AuthedRequest).adminUsername ?? "";
  try {
    if (role === "commercial") {
      const conn = await pool.getConnection();
      try {
        const [adminRows] = await conn.execute(
          "SELECT allowed_partner_statuses FROM admins WHERE username = ? LIMIT 1", [username]
        );
        const raw = (adminRows as Array<{ allowed_partner_statuses: string | null }>)[0]?.allowed_partner_statuses;
        const allowed: string[] = raw ? JSON.parse(raw) : ["pending", "reviewing", "approved", "rejected"];
        if (allowed.length === 0) { res.json({ ok: true, partners: [] }); return; }
        const placeholders = allowed.map(() => "?").join(",");
        const [rows] = await conn.execute(
          `SELECT id, first_name AS firstName, last_name AS lastName, email, password, phone, address, city, parcels_per_month AS parcelsPerMonth, status, notes, created_at AS createdAt FROM partners WHERE status IN (${placeholders}) ORDER BY created_at DESC`,
          allowed
        );
        res.json({ ok: true, partners: rows });
      } finally { conn.release(); }
    } else {
      const rows = await db.select().from(partnersTable).orderBy(desc(partnersTable.createdAt));
      res.json({ ok: true, partners: rows });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch partners");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/partners", adminAuth, commercialOrAdminOnly, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const firstName = String(body.firstName ?? "").trim().slice(0, 100);
  const lastName = String(body.lastName ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const phone = String(body.phone ?? "").trim().slice(0, 50);
  const address = String(body.address ?? "").trim().slice(0, 500);
  const city = String(body.city ?? "").trim().slice(0, 100);
  const parcelsPerMonth = String(body.parcelsPerMonth ?? "").trim().slice(0, 50);
  const password = body.password ? String(body.password).trim().slice(0, 200) : null;
  const allowedStatuses = ["pending", "reviewing", "approved", "rejected"];
  const status = allowedStatuses.includes(String(body.status)) ? String(body.status) : "pending";
  const notes = body.notes ? String(body.notes).trim().slice(0, 2000) : null;
  if (!firstName || !lastName || !email || !phone || !address || !city || !parcelsPerMonth) {
    res.status(400).json({ ok: false, error: "missing_fields" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [result] = await conn.execute(
        "INSERT INTO partners (first_name, last_name, email, password, phone, address, city, parcels_per_month, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, email, password, phone, address, city, parcelsPerMonth, status, notes]
      );
      res.json({ ok: true, id: (result as { insertId: number }).insertId });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create partner");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.patch("/admin/partners/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const role = (req as AuthedRequest).adminRole;
  const username = (req as AuthedRequest).adminUsername ?? "";
  // Admins can always edit; commercial only if can_change_partner_status=1
  if (role !== "admin") {
    if (role !== "commercial") { res.status(403).json({ ok: false, error: "forbidden" }); return; }
    try {
      const conn = await pool.getConnection();
      try {
        const [rows] = await conn.execute("SELECT can_change_partner_status FROM admins WHERE username = ? LIMIT 1", [username]);
        if (!(rows as Array<{ can_change_partner_status: number }>)[0]?.can_change_partner_status) {
          res.status(403).json({ ok: false, error: "forbidden" }); return;
        }
      } finally { conn.release(); }
    } catch (err) {
      req.log.error({ err }, "Failed to check partner edit permission");
      res.status(500).json({ ok: false, error: "db_error" }); return;
    }
  }
  const body = (req.body ?? {}) as { status?: unknown; notes?: unknown };
  const allowed = ["pending", "reviewing", "approved", "rejected"];
  if (body.status !== undefined && !allowed.includes(String(body.status))) {
    res.status(400).json({ ok: false, error: "invalid_status" }); return;
  }
  const update: Record<string, string> = {};
  if (body.status !== undefined) update["status"] = String(body.status);
  if (role === "admin" && body.notes !== undefined) update["notes"] = String(body.notes);
  if (Object.keys(update).length === 0) { res.status(400).json({ ok: false, error: "no_fields" }); return; }
  try {
    await db.update(partnersTable).set(update).where(eq(partnersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update partner");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/partners/:id", adminAuth, superAdminOnly, async (req, res) => {
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
  const wilayaNumber = String(body.wilayaNumber ?? "").trim().slice(0, 10);
  const wilaya = String(body.wilaya ?? "").trim().slice(0, 100);
  const commune = body.commune ? String(body.commune).trim().slice(0, 100) : null;
  const address = String(body.address ?? "").trim().slice(0, 1000);
  const phone = body.phone ? String(body.phone).trim().slice(0, 50) : null;
  const mapsUrl = String(body.mapsUrl ?? "").trim().slice(0, 2000);
  const isPrincipal = body.isPrincipal === true || body.isPrincipal === "true" ? 1 : 0;
  if (!wilayaNumber || !wilaya || !address || !mapsUrl) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const conn2 = await pool.getConnection();
    try {
      const [result] = await conn2.execute(
        "INSERT INTO offices (wilaya_number, wilaya, commune, address, phone, maps_url, is_principal) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [wilayaNumber, wilaya, commune, address, phone, mapsUrl, isPrincipal]
      ) as [{ insertId: number }, unknown];
      res.json({ ok: true, id: result.insertId });
    } finally { conn2.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create office");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.patch("/admin/offices/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.wilayaNumber !== undefined) { sets.push("wilaya_number = ?"); vals.push(String(body.wilayaNumber).trim().slice(0, 10)); }
  if (body.wilaya !== undefined) { sets.push("wilaya = ?"); vals.push(String(body.wilaya).trim().slice(0, 100)); }
  if (body.commune !== undefined) { sets.push("commune = ?"); vals.push(body.commune ? String(body.commune).trim().slice(0, 100) : null); }
  if (body.address !== undefined) { sets.push("address = ?"); vals.push(String(body.address).trim().slice(0, 1000)); }
  if (body.phone !== undefined) { sets.push("phone = ?"); vals.push(body.phone ? String(body.phone).trim().slice(0, 50) : null); }
  if (body.mapsUrl !== undefined) { sets.push("maps_url = ?"); vals.push(String(body.mapsUrl).trim().slice(0, 2000)); }
  if (body.isPrincipal !== undefined) { sets.push("is_principal = ?"); vals.push(body.isPrincipal === true || body.isPrincipal === "true" ? 1 : 0); }
  if (sets.length === 0) { res.status(400).json({ ok: false, error: "no_fields" }); return; }
  try {
    const conn3 = await pool.getConnection();
    try {
      await conn3.execute(`UPDATE offices SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
      res.json({ ok: true });
    } finally { conn3.release(); }
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

// ── Wilaya name → code lookup (for matching PDF wilaya names to map codes) ─────

const WILAYA_CODE_BY_NAME: Record<string, string> = {
  "Adrar": "DZ01", "Chlef": "DZ02", "Laghouat": "DZ03", "Oum El Bouaghi": "DZ04",
  "Batna": "DZ05", "Béjaïa": "DZ06", "Béjaia": "DZ06", "Bejaia": "DZ06",
  "Biskra": "DZ07", "Béchar": "DZ08", "Bechar": "DZ08", "Blida": "DZ09",
  "Bouira": "DZ10", "Tamanrasset": "DZ11",
  "Tébessa": "DZ12", "Tebessa": "DZ12",
  "Tlemcen": "DZ13", "Tiaret": "DZ14", "Tizi Ouzou": "DZ15",
  "Alger": "DZ16", "Algiers": "DZ16",
  "Djelfa": "DZ17", "Jijel": "DZ18",
  "Sétif": "DZ19", "Setif": "DZ19",
  "Saïda": "DZ20", "Saida": "DZ20",
  "Skikda": "DZ21",
  "Sidi Bel Abbès": "DZ22", "Sidi Bel Abbes": "DZ22",
  "Annaba": "DZ23", "Guelma": "DZ24", "Constantine": "DZ25",
  "Médéa": "DZ26", "Medea": "DZ26", "Mostaganem": "DZ27",
  "M'Sila": "DZ28", "Msila": "DZ28", "Mascara": "DZ29", "Ouargla": "DZ30",
  "Oran": "DZ31", "El Bayadh": "DZ32", "Illizi": "DZ33",
  "Bordj Bou Arréridj": "DZ34", "Bordj Bou Arreridj": "DZ34",
  "Boumerdès": "DZ35", "Boumerdes": "DZ35",
  "El Tarf": "DZ36", "Tindouf": "DZ37", "Tissemsilt": "DZ38", "El Oued": "DZ39",
  "Khenchela": "DZ40", "Souk Ahras": "DZ41", "Tipaza": "DZ42", "Mila": "DZ43",
  "Aïn Defla": "DZ44", "Ain Defla": "DZ44",
  "Naâma": "DZ45", "Naama": "DZ45",
  "Aïn Témouchent": "DZ46", "Ain Temouchent": "DZ46",
  "Ghardaïa": "DZ47", "Ghardaia": "DZ47",
  "Relizane": "DZ48", "Timimoun": "DZ49",
  "Bordj Badji Mokhtar": "DZ50", "Ouled Djellal": "DZ51",
  "Béni Abbès": "DZ52", "Beni Abbes": "DZ52",
  "In Salah": "DZ53", "In Guezzam": "DZ54",
  "Touggourt": "DZ55", "Djanet": "DZ56", "El M'Ghair": "DZ57", "El Meniaa": "DZ58",
};

/** Parse "Tébessa:3,Blida:1" → [{name, count}] */
function parseWilayaStr(w: string): Array<{ name: string; count: number }> {
  return w.split(",").map(s => s.trim()).filter(Boolean).map(entry => {
    const i = entry.lastIndexOf(":");
    if (i === -1) return { name: entry, count: 1 };
    const name  = entry.slice(0, i).trim();
    const count = parseInt(entry.slice(i + 1), 10);
    return { name, count: isNaN(count) || count < 1 ? 1 : count };
  }).filter(e => e.name);
}

/** Map PDF report_type to order status */
function pdfStatus(reportType: string): string {
  if (reportType === "delivery_receipt") return "delivered";
  if (reportType === "returns_list")     return "returned";
  return "in_transit"; // route_sheet
}

// ── Dashboard stats ────────────────────────────────────────────────────────────

router.get("/admin/stats", adminAuth, async (req, res) => {
  try {
    const q = req.query as Record<string, unknown>;
    const fromStr = typeof q.from === "string" && q.from ? q.from : null;
    const toStr = typeof q.to === "string" && q.to ? q.to : null;
    const wilayaStr = typeof q.wilaya === "string" && q.wilaya ? q.wilaya : null;
    const officeStr = typeof q.office === "string" && q.office ? q.office : null;

    const conds = [];
    if (fromStr) {
      const d = new Date(fromStr);
      if (!isNaN(d.getTime())) conds.push(gte(ordersTable.createdAt, d));
    }
    if (toStr) {
      const d = new Date(toStr);
      if (!isNaN(d.getTime())) conds.push(lte(ordersTable.createdAt, d));
    }
    if (wilayaStr) conds.push(eq(ordersTable.destinationWilayaCode, wilayaStr));

    const where = conds.length > 0 ? and(...conds) : undefined;

    // ── Regular orders queries (run in parallel with office_reports query) ──────
    const byWilayaConds = wilayaStr ? conds : [...conds, isNotNull(ordersTable.destinationWilayaCode)];

    const [statusRows, byWilayaRows, recentOrdersRows, officeReportRows] = await Promise.all([
      db.select({ status: ordersTable.status, cnt: count() })
        .from(ordersTable).where(where).groupBy(ordersTable.status),
      db.select({
          code: ordersTable.destinationWilayaCode,
          name: ordersTable.destinationWilaya,
          total: count(),
          delivered: sql<number>`SUM(CASE WHEN ${ordersTable.status} = 'delivered' THEN 1 ELSE 0 END)`,
        })
        .from(ordersTable).where(and(...byWilayaConds))
        .groupBy(ordersTable.destinationWilayaCode, ordersTable.destinationWilaya)
        .orderBy(desc(count())),
      db.select().from(ordersTable).where(where).orderBy(desc(ordersTable.createdAt)).limit(500),
      // ── Fetch office PDF reports (with optional date + office filter) ─────
      pool.getConnection().then(async (conn: any) => {
        try {
          const sqlParams: string[] = [];
          let whereSql = "WHERE 1=1";
          if (fromStr) { whereSql += " AND report_date >= ?"; sqlParams.push(fromStr.slice(0, 10)); }
          if (toStr)   { whereSql += " AND report_date <= ?"; sqlParams.push(toStr.slice(0, 10)); }
          if (officeStr) { whereSql += " AND uploaded_by = ?"; sqlParams.push(officeStr); }
          const [rows] = await conn.execute(
            `SELECT id, report_type, report_date, sender_name, station, tracking_numbers, recipient_names, wilayas, order_wilayas, per_order_senders, total_parcels, created_at FROM office_reports ${whereSql} ORDER BY created_at DESC LIMIT 500`,
            sqlParams,
          );
          return rows as Array<{
            id: number; report_type: string; report_date: string;
            sender_name: string | null; station: string | null;
            tracking_numbers: string | null; recipient_names: string | null;
            wilayas: string | null; order_wilayas: string | null;
            per_order_senders: string | null;
            total_parcels: number; created_at: Date;
          }>;
        } finally { conn.release(); }
      }),
    ]);

    // ── Aggregate manual-order counts ────────────────────────────────────────
    const sm: Record<string, number> = {};
    let total = 0;
    for (const r of statusRows) { sm[r.status] = Number(r.cnt); total += Number(r.cnt); }

    // ── Build merged byWilaya map ─────────────────────────────────────────────
    // key = wilaya code (e.g. "DZ12")
    const wilayaMap: Record<string, { code: string; name: string; total: number; delivered: number }> = {};

    for (const r of byWilayaRows) {
      const code = r.code ?? "";
      if (!code) continue;
      wilayaMap[code] = {
        code,
        name: r.name ?? "",
        total: Number(r.total),
        delivered: Number(r.delivered),
      };
    }

    // Merge wilaya data from office PDF reports — exclude returns_list (not delivered)
    for (const rpt of officeReportRows) {
      if (!rpt.wilayas) continue;
      if (rpt.report_type === "returns_list") continue; // returned parcels excluded from delivery map
      const status = pdfStatus(rpt.report_type);
      for (const { name, count: cnt } of parseWilayaStr(rpt.wilayas)) {
        const code = WILAYA_CODE_BY_NAME[name];
        if (!code) continue;
        if (!wilayaMap[code]) wilayaMap[code] = { code, name, total: 0, delivered: 0 };
        wilayaMap[code].total += cnt;
        if (status === "delivered") wilayaMap[code].delivered += cnt;
      }
    }

    const byWilaya = Object.values(wilayaMap).sort((a, b) => b.total - a.total);

    // ── Aggregate PDF parcel counts into total/status summary ─────────────────
    for (const rpt of officeReportRows) {
      const st = pdfStatus(rpt.report_type);
      const cnt = rpt.total_parcels > 0
        ? rpt.total_parcels
        : (rpt.tracking_numbers?.split(",").filter(Boolean).length ?? 0);
      sm[st] = (sm[st] ?? 0) + cnt;
      total += cnt;
    }

    // ── Build virtual orders from PDF tracking numbers ────────────────────────
    const pdfOrders: Array<Record<string, unknown>> = [];
    for (const rpt of officeReportRows) {
      if (!rpt.tracking_numbers) continue;
      const nums = rpt.tracking_numbers.split(",").map((s: string) => s.trim()).filter(Boolean);
      const recipients = rpt.recipient_names ? rpt.recipient_names.split("|") : [];
      const status = pdfStatus(rpt.report_type);

      // Determine per-wilaya destination map for this report
      const wilayaEntries = rpt.wilayas ? parseWilayaStr(rpt.wilayas) : [];

      // If a wilaya filter is set, skip this report if none of its wilayas match
      if (wilayaStr) {
        const hasMatch = wilayaEntries.some((e) => WILAYA_CODE_BY_NAME[e.name] === wilayaStr);
        if (!hasMatch) continue;
      }

      // Fallback destination wilaya = first entry in wilayas field
      let fallbackWilayaName: string | null = null;
      let fallbackWilayaCode: string | null = null;
      if (wilayaEntries.length > 0) {
        fallbackWilayaName = wilayaEntries[0].name;
        fallbackWilayaCode = WILAYA_CODE_BY_NAME[wilayaEntries[0].name] ?? null;
      }

      // Per-order wilaya: pipe-separated list aligned with tracking_numbers
      const orderWilayasArr = (rpt as any).order_wilayas
        ? String((rpt as any).order_wilayas).split("|")
        : [];

      const createdAt = rpt.report_date
        ? new Date(rpt.report_date + "T00:00:00").toISOString()
        : (rpt.created_at instanceof Date ? rpt.created_at.toISOString() : String(rpt.created_at));

      // Per-order senders: pipe-separated, aligned with tracking_numbers (route_sheet only)
      const perOrderSendersArr = (rpt.report_type === "route_sheet" && rpt.per_order_senders)
        ? String(rpt.per_order_senders).split("|")
        : [];

      for (let idx = 0; idx < nums.length; idx++) {
        // Per-order destination: use per-order wilaya if available, else fallback
        const perOrderWilayaName = (orderWilayasArr[idx] && orderWilayasArr[idx].trim())
          ? orderWilayasArr[idx].trim() : fallbackWilayaName;
        const perOrderWilayaCode = perOrderWilayaName
          ? (WILAYA_CODE_BY_NAME[perOrderWilayaName] ?? fallbackWilayaCode) : fallbackWilayaCode;

        const orderRecipientName = (recipients[idx] && recipients[idx].trim()) ? recipients[idx].trim() : null;
        // For route_sheet: use the per-order sender; for other types: use the report-level sender
        const orderSenderName = perOrderSendersArr.length > 0
          ? (perOrderSendersArr[idx]?.trim() || rpt.sender_name || null)
          : (rpt.sender_name ?? null);
        pdfOrders.push({
          id: -(rpt.id * 10000 + idx),
          trackingNumber: nums[idx],
          status,
          senderName: orderSenderName,
          recipientName: orderRecipientName,
          destinationWilayaCode: perOrderWilayaCode,
          destinationWilaya: perOrderWilayaName,
          originWilayaCode: null,
          originWilaya: rpt.station ?? null,
          createdAt,
          source: "pdf",
          reportType: rpt.report_type,
        });
      }

      // Placeholder rows for parcels without extracted tracking codes
      const totalParcels = rpt.total_parcels > 0 ? rpt.total_parcels : nums.length;
      for (let idx = nums.length; idx < totalParcels; idx++) {
        pdfOrders.push({
          id: -(rpt.id * 10000 + idx),
          trackingNumber: null,
          status,
          senderName: rpt.sender_name ?? null,
          recipientName: null,
          destinationWilayaCode: fallbackWilayaCode,
          destinationWilaya: fallbackWilayaName,
          originWilayaCode: null,
          originWilaya: rpt.station ?? null,
          createdAt,
          source: "pdf",
          reportType: rpt.report_type,
        });
      }
    }

    // Merge manual orders + PDF virtual orders, sort newest first (no hard cap)
    const allOrders = [
      ...recentOrdersRows.map((o: Record<string, unknown>) => ({ ...o, source: "manual" })),
      ...pdfOrders,
    ].sort((a, b) => {
      const da = new Date(String((a as Record<string, unknown>).createdAt)).getTime();
      const db2 = new Date(String((b as Record<string, unknown>).createdAt)).getTime();
      return db2 - da;
    });

    const delivered = sm["delivered"] ?? 0;
    res.json({
      ok: true,
      stats: {
        total,
        delivered,
        in_transit: sm["in_transit"] ?? 0,
        returned: sm["returned"] ?? 0,
        pending: sm["pending"] ?? 0,
        failed: sm["failed"] ?? 0,
        cancelled: sm["cancelled"] ?? 0,
        successRate: total > 0 ? Math.round((delivered / total) * 100) : 0,
        byWilaya,
        recentOrders: allOrders,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch stats");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Orders CRUD ────────────────────────────────────────────────────────────────

router.get("/admin/orders", adminAuth, async (req, res) => {
  try {
    const orders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).limit(100);
    res.json({ ok: true, orders });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch orders");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/orders", adminAuth, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) : null);
  try {
    const [result] = await db.insert(ordersTable).values({
      trackingNumber: str(b.trackingNumber, 100),
      status: str(b.status, 20) ?? "pending",
      senderName: str(b.senderName, 100),
      recipientName: str(b.recipientName, 100),
      destinationWilayaCode: str(b.destinationWilayaCode, 10),
      destinationWilaya: str(b.destinationWilaya, 100),
      originWilayaCode: str(b.originWilayaCode, 10),
      originWilaya: str(b.originWilaya, 100),
    });
    res.json({ ok: true, id: (result as { insertId: number }).insertId });
  } catch (err) {
    req.log.error({ err }, "Failed to create order");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.patch("/admin/orders/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (v ? String(v).trim().slice(0, max) : null);
  const u: Record<string, unknown> = {};
  if (b.status !== undefined) u.status = str(b.status, 20);
  if (b.trackingNumber !== undefined) u.trackingNumber = str(b.trackingNumber, 100);
  if (b.senderName !== undefined) u.senderName = str(b.senderName, 100);
  if (b.recipientName !== undefined) u.recipientName = str(b.recipientName, 100);
  if (b.destinationWilayaCode !== undefined) u.destinationWilayaCode = str(b.destinationWilayaCode, 10);
  if (b.destinationWilaya !== undefined) u.destinationWilaya = str(b.destinationWilaya, 100);
  if (b.originWilayaCode !== undefined) u.originWilayaCode = str(b.originWilayaCode, 10);
  if (b.originWilaya !== undefined) u.originWilaya = str(b.originWilaya, 100);
  if (Object.keys(u).length === 0) { res.status(400).json({ ok: false, error: "no_fields" }); return; }
  try {
    await db.update(ordersTable).set(u).where(eq(ordersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to update order");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/orders/:id", adminAuth, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    await db.delete(ordersTable).where(eq(ordersTable.id, id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete order");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Top Stats ──────────────────────────────────────────────────────────────────
router.get("/admin/top-stats", adminAuth, async (req, res) => {
  try {
    const q = req.query as Record<string, unknown>;
    const officeStr = typeof q.office === "string" && q.office ? q.office : null;

    const [officeAgents, marketers, pdfRaw] = await Promise.all([
      db.select({ name: adminsTable.username, createdAt: adminsTable.createdAt })
        .from(adminsTable).where(eq(adminsTable.role, "office"))
        .orderBy(desc(adminsTable.createdAt)).limit(50),

      db.select({ name: adminsTable.username, createdAt: adminsTable.createdAt })
        .from(adminsTable).where(eq(adminsTable.role, "commercial"))
        .orderBy(desc(adminsTable.createdAt)).limit(10),

      // FDR (route_sheet) PDFs only for senders & recipients; all types for wilayas
      pool.getConnection().then(async (conn: any) => {
        try {
          const officeFilter = officeStr ? " AND uploaded_by = ?" : "";
          const officeParam = officeStr ? [officeStr] : [];

          // route_sheet: per_order_senders aligned per-parcel list + recipient_names
          const [rsRows] = await conn.execute(
            `SELECT per_order_senders, recipient_names
             FROM office_reports
             WHERE report_type = 'route_sheet'
               ${officeFilter}`,
            officeParam,
          );
          // all wilayas across all report types (unchanged)
          const [wilayaRows] = await conn.execute(
            `SELECT GROUP_CONCAT(wilayas ORDER BY created_at SEPARATOR ',') AS all_wilayas
             FROM office_reports
             ${officeStr ? "WHERE uploaded_by = ?" : ""}`,
            officeParam,
          );
          return {
            rsRows: rsRows as Array<{ per_order_senders: string|null; recipient_names: string|null }>,
            allWilayas: ((wilayaRows as Array<{all_wilayas:string|null}>)[0]?.all_wilayas ?? ""),
          };
        } finally { conn.release(); }
      }),
    ]);

    // ── Top Expéditeurs — FDR per_order_senders only (one entry per parcel) ──
    const senderMap: Record<string, number> = {};
    for (const s of pdfRaw.rsRows) {
      if (!s.per_order_senders) continue;
      const perOrder = s.per_order_senders.split("|").map((p: string) => p.trim()).filter(Boolean);
      for (const name of perOrder) {
        senderMap[name] = (senderMap[name] ?? 0) + 1;
      }
    }
    const topSenders = Object.entries(senderMap)
      .map(([name, count]) => ({ name, count, delivered: 0 }))
      .sort((a, b) => b.count - a.count);

    // ── Top Clients — FDR recipient_names only ────────────────────────────────
    const recipientMap: Record<string, number> = {};
    for (const row of pdfRaw.rsRows) {
      if (!row.recipient_names) continue;
      const names = row.recipient_names.split("|").map((n: string) => n.trim()).filter(Boolean);
      for (const name of names) {
        if (name.length < 2 || name.length > 100) continue;
        recipientMap[name] = (recipientMap[name] ?? 0) + 1;
      }
    }
    const topRecipients = Object.entries(recipientMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    // ── Top wilayas — all report types (unchanged) ────────────────────────────
    const wilayaMap: Record<string, number> = {};
    const allWilayasStr = pdfRaw.allWilayas ?? "";
    if (allWilayasStr) {
      for (const entry of allWilayasStr.split(",")) {
        const i = entry.lastIndexOf(":");
        if (i === -1) continue;
        const name = entry.slice(0, i).trim();
        const cnt = parseInt(entry.slice(i + 1), 10);
        if (name && !isNaN(cnt) && cnt > 0) wilayaMap[name] = (wilayaMap[name] ?? 0) + cnt;
      }
    }
    const topWilayas = Object.entries(wilayaMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({ ok: true, topSenders, topRecipients, topWilayas, officeAgents, marketers });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch top stats");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Charges Summary ────────────────────────────────────────────────────────────
router.get("/admin/charges-summary", adminAuth, financeOrAdminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  try {
    const conn = await pool.getConnection();
    try {
      const params: string[] = [];
      let where = "WHERE TRUE";
      if (q.from) { where += " AND charge_date >= ?"; params.push(q.from); }
      if (q.to) { where += " AND charge_date <= ?"; params.push(q.to); }
      const [catRows] = await conn.execute(
        `SELECT category, SUM(amount_dzd) as total FROM charges ${where} AND type = 'outcome' GROUP BY category`, params
      ) as [Array<{ category: string; total: string | number }>, unknown];
      const [outcomeRows] = await conn.execute(
        `SELECT COALESCE(SUM(amount_dzd), 0) as total FROM charges ${where} AND type = 'outcome'`, params
      ) as [Array<{ total: string | number }>, unknown];
      const [incomeRows] = await conn.execute(
        `SELECT COALESCE(SUM(amount_dzd), 0) as total FROM charges ${where} AND type = 'income'`, params
      ) as [Array<{ total: string | number }>, unknown];
      const byCategory: Record<string, number> = {};
      for (const r of catRows) byCategory[r.category] = Number(r.total);
      res.json({
        ok: true, byCategory,
        totalCharges: Number(outcomeRows[0]?.total ?? 0),
        totalIncome: Number(incomeRows[0]?.total ?? 0),
      });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch charges summary");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Charges ────────────────────────────────────────────────────────────────────
router.get("/admin/charges", adminAuth, financeOrAdminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  try {
    const conn = await pool.getConnection();
    try {
      const params: string[] = [];
      let where = "WHERE TRUE";
      if (q.from) { where += " AND charge_date >= ?"; params.push(q.from); }
      if (q.to) { where += " AND charge_date <= ?"; params.push(q.to); }
      if (q.category) { where += " AND category = ?"; params.push(q.category); }
      if (q.type) { where += " AND type = ?"; params.push(q.type); }
      const [rows] = await conn.execute(
        `SELECT id, category, amount_dzd, description, charge_date, type, attachment_name, created_at FROM charges ${where} ORDER BY charge_date DESC, created_at DESC`, params
      );
      res.json({ ok: true, charges: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch charges");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.get("/admin/charges/:id/attachment", async (req, res) => {
  const auth = (req.headers["authorization"] as string) ?? "";
  const tokenFromHeader = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const tokenFromQuery = typeof (req.query as Record<string, string>).token === "string"
    ? (req.query as Record<string, string>).token : "";
  const token = tokenFromHeader || tokenFromQuery;
  const result = verifyToken(token);
  if (!result.valid) { res.status(401).json({ ok: false, error: "unauthorized" }); return; }

  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT attachment_name, attachment_data FROM charges WHERE id = ?", [id]
      ) as [Array<{ attachment_name: string | null; attachment_data: Buffer | null }>, unknown];
      const row = rows[0];
      if (!row || !row.attachment_data || !row.attachment_name) {
        res.status(404).json({ ok: false, error: "not_found" }); return;
      }
      const ext = row.attachment_name.split(".").pop()?.toLowerCase() ?? "";
      const mime = ext === "pdf" ? "application/pdf"
        : ext === "png" ? "image/png"
        : ext === "jpg" || ext === "jpeg" ? "image/jpeg"
        : "application/octet-stream";
      res.setHeader("Content-Type", mime);
      res.setHeader("Content-Disposition", `inline; filename="${row.attachment_name}"`);
      res.send(row.attachment_data);
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch attachment");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/charges", adminAuth, financeOrAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const category = String(b.category ?? "").trim();
  const amount = parseInt(String(b.amount_dzd ?? "0"), 10);
  const description = b.description ? String(b.description).trim().slice(0, 500) : null;
  const chargeDate = String(b.charge_date ?? "").trim() || new Date().toISOString().split("T")[0];
  const type = b.type === "income" ? "income" : "outcome";
  if (!category || isNaN(amount) || amount < 0) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  let attachmentName: string | null = null;
  let attachmentData: Buffer | null = null;
  if (b.attachment_data && b.attachment_name) {
    try {
      attachmentName = String(b.attachment_name).slice(0, 255);
      attachmentData = Buffer.from(String(b.attachment_data), "base64");
      if (attachmentData.length > 10 * 1024 * 1024) {
        res.status(400).json({ ok: false, error: "attachment_too_large" }); return;
      }
    } catch {
      res.status(400).json({ ok: false, error: "invalid_attachment" }); return;
    }
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [catRows] = await conn.execute(
        "SELECT cat_key FROM charge_categories WHERE cat_key = ? LIMIT 1", [category]
      ) as [Array<{ cat_key: string }>, unknown];
      if (catRows.length === 0) {
        res.status(400).json({ ok: false, error: "invalid_category" }); return;
      }
      await conn.execute(
        "INSERT INTO charges (category, amount_dzd, description, charge_date, type, attachment_name, attachment_data) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [category, amount, description, chargeDate, type, attachmentName, attachmentData]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create charge");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/charges/:id", adminAuth, superAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM charges WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete charge");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Payouts ────────────────────────────────────────────────────────────────────
router.get("/admin/payouts", adminAuth, superAdminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  try {
    const conn = await pool.getConnection();
    try {
      const params: string[] = [];
      let where = "WHERE TRUE";
      if (q.from) { where += " AND payout_date >= ?"; params.push(q.from); }
      if (q.to) { where += " AND payout_date <= ?"; params.push(q.to); }
      const [rows] = await conn.execute(
        `SELECT * FROM payouts ${where} ORDER BY payout_date DESC, created_at DESC`, params
      );
      res.json({ ok: true, payouts: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch payouts");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/payouts", adminAuth, superAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const amount = parseInt(String(b.amount_dzd ?? "0"), 10);
  const method = String(b.method ?? "virement").trim().slice(0, 50);
  const category = String(b.category ?? "general").trim().slice(0, 50);
  const reference = b.reference ? String(b.reference).trim().slice(0, 100) : null;
  const notes = b.notes ? String(b.notes).trim().slice(0, 500) : null;
  const payoutDate = String(b.payout_date ?? "").trim() || new Date().toISOString().split("T")[0];
  if (isNaN(amount) || amount < 0) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "INSERT INTO payouts (category, amount_dzd, method, reference, notes, payout_date) VALUES (?, ?, ?, ?, ?, ?)",
        [category, amount, method, reference, notes, payoutDate]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create payout");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/payouts/:id", adminAuth, superAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM payouts WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete payout");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Charge Categories ──────────────────────────────────────────────────────────
router.get("/admin/categories", adminAuth, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT id, cat_key, name, icon, sort_order, parent_id FROM charge_categories ORDER BY sort_order ASC, id ASC"
      ) as [Array<{ id: number; cat_key: string; name: string; icon: string; sort_order: number; parent_id: number | null }>, unknown];
      res.json({ ok: true, categories: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch categories");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/categories", adminAuth, superAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const name = String(b.name ?? "").trim().slice(0, 100);
  const icon = String(b.icon ?? "📋").trim().slice(0, 20);
  const parentId = b.parent_id ? parseInt(String(b.parent_id), 10) : null;
  if (!name) { res.status(400).json({ ok: false, error: "invalid_fields" }); return; }
  const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 50) + "_" + Date.now();
  try {
    const conn = await pool.getConnection();
    try {
      const [r] = await conn.execute(
        "INSERT INTO charge_categories (cat_key, name, icon, sort_order, parent_id) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM charge_categories c2), ?)",
        [key, name, icon, parentId]
      ) as [{ insertId: number }, unknown];
      res.json({ ok: true, id: r.insertId, cat_key: key });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create category");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/categories/:id", adminAuth, superAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM charge_categories WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete category");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Commission Rates ────────────────────────────────────────────────────────────
// ── Office-specific commission rates ───────────────────────────────────────────

router.get("/admin/office-commission-rates", adminAuth, financeOrAdminOnly, async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const officeName = typeof q.office === "string" ? q.office.trim() : "";
  if (!officeName) { res.status(400).json({ ok: false, error: "missing_office" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT id, office_name, wilaya_name, wilaya_number, classic_stop_desk_dzd, classic_domicile_dzd, ecommerce_stop_desk_dzd, ecommerce_domicile_dzd FROM office_commission_rates WHERE office_name = ? ORDER BY wilaya_name ASC",
        [officeName]
      ) as [Array<Record<string, unknown>>, unknown];
      res.json({ ok: true, rates: rows.map(r => ({
        ...r,
        classic_stop_desk_dzd: Number(r.classic_stop_desk_dzd ?? 0),
        classic_domicile_dzd: Number(r.classic_domicile_dzd ?? 0),
        ecommerce_stop_desk_dzd: Number(r.ecommerce_stop_desk_dzd ?? 0),
        ecommerce_domicile_dzd: Number(r.ecommerce_domicile_dzd ?? 0),
      })) });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch office commission rates");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.put("/admin/office-commission-rates/bulk", adminAuth, financeOrAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const officeName = String(b.office_name ?? "").trim();
  const rates = b.rates as Array<{ wilaya_name: string; wilaya_number: string; classic_stop_desk_dzd: number; classic_domicile_dzd: number; ecommerce_stop_desk_dzd: number; ecommerce_domicile_dzd: number }>;
  if (!officeName || !Array.isArray(rates)) { res.status(400).json({ ok: false, error: "invalid" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      for (const r of rates) {
        const wName = String(r.wilaya_name ?? "").trim();
        const wNum  = String(r.wilaya_number ?? "").trim();
        const csd   = parseFloat(String(r.classic_stop_desk_dzd ?? "0")) || 0;
        const cd    = parseFloat(String(r.classic_domicile_dzd ?? "0")) || 0;
        const esd   = parseFloat(String(r.ecommerce_stop_desk_dzd ?? "0")) || 0;
        const ed    = parseFloat(String(r.ecommerce_domicile_dzd ?? "0")) || 0;
        if (!wName) continue;
        await conn.execute(
          `INSERT INTO office_commission_rates (office_name, wilaya_name, wilaya_number, classic_stop_desk_dzd, classic_domicile_dzd, ecommerce_stop_desk_dzd, ecommerce_domicile_dzd)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE classic_stop_desk_dzd=VALUES(classic_stop_desk_dzd), classic_domicile_dzd=VALUES(classic_domicile_dzd), ecommerce_stop_desk_dzd=VALUES(ecommerce_stop_desk_dzd), ecommerce_domicile_dzd=VALUES(ecommerce_domicile_dzd), wilaya_number=VALUES(wilaya_number)`,
          [officeName, wName, wNum, csd, cd, esd, ed]
        );
      }
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to bulk save office commission rates");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Global commission rates ─────────────────────────────────────────────────────

router.get("/admin/commission-rates", adminAuth, financeOrAdminOnly, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT id, wilaya_name, wilaya_number, rate_dzd FROM wilaya_commission_rates ORDER BY wilaya_name ASC"
      ) as [Array<{ id: number; wilaya_name: string; wilaya_number: string | null; rate_dzd: string }>, unknown];
      res.json({ ok: true, rates: rows.map(r => ({ ...r, rate_dzd: Number(r.rate_dzd) })) });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch commission rates");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/commission-rates", adminAuth, financeOrAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const wilayaName = String(b.wilaya_name ?? "").trim().slice(0, 100);
  const wilayaNumber = b.wilaya_number ? String(b.wilaya_number).trim().slice(0, 10) : null;
  const rateDzd = parseFloat(String(b.rate_dzd ?? "0"));
  if (!wilayaName || isNaN(rateDzd)) { res.status(400).json({ ok: false, error: "invalid_fields" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "INSERT INTO wilaya_commission_rates (wilaya_name, wilaya_number, rate_dzd) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rate_dzd = VALUES(rate_dzd), wilaya_number = VALUES(wilaya_number)",
        [wilayaName, wilayaNumber, rateDzd]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to save commission rate");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/commission-rates/:id", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM wilaya_commission_rates WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete commission rate");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.put("/admin/commission-rates/bulk", adminAuth, financeOrAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const rates = b.rates as Array<{ wilaya_name: string; wilaya_number: string; rate_dzd: number }>;
  if (!Array.isArray(rates)) { res.status(400).json({ ok: false, error: "invalid" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      for (const r of rates) {
        const wilayaName = String(r.wilaya_name ?? "").trim();
        const wilayaNumber = String(r.wilaya_number ?? "").trim();
        const rateDzd = parseFloat(String(r.rate_dzd ?? "0")) || 0;
        if (!wilayaName) continue;
        await conn.execute(
          "INSERT INTO wilaya_commission_rates (wilaya_name, wilaya_number, rate_dzd) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE rate_dzd = VALUES(rate_dzd), wilaya_number = VALUES(wilaya_number)",
          [wilayaName, wilayaNumber, rateDzd]
        );
      }
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to bulk save commission rates");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Commission Calculation (from xlsx upload) ──────────────────────────────────
const xlsxUpload = multer2({ storage: multer2.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/admin/commissions/add", adminAuth, financeOrAdminOnly, xlsxUpload.single("xlsx"), async (req, res) => {
  const file = req.file;
  const officeName = String((req.body as Record<string, unknown>)?.officeName ?? "").trim();
  const rateTypeRaw = String((req.body as Record<string, unknown>)?.rateType ?? "classic_stop_desk").trim();
  const validRateTypes = ["classic_stop_desk", "classic_domicile", "ecommerce_stop_desk", "ecommerce_domicile"];
  const rateCol = validRateTypes.includes(rateTypeRaw) ? `${rateTypeRaw}_dzd` : "classic_stop_desk_dzd";
  if (!file || !officeName) { res.status(400).json({ ok: false, error: "missing_fields" }); return; }
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];

    // Read all rows as raw arrays to handle Ecotrack files that have merged title rows
    // (e.g. "Statistiques | ECOTRACK" spanning the first row before the real headers)
    const allArrayRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });

    // Find the actual header row: first row (within the first 10) that contains a
    // "livr" or "wilaya"/"destination" keyword in any cell
    let headerRowIdx = 0;
    for (let i = 0; i < Math.min(allArrayRows.length, 10); i++) {
      const rowStr = (allArrayRows[i] as unknown[]).map(c => String(c).toLowerCase()).join("|");
      if (rowStr.includes("livr") || rowStr.includes("wilaya") || rowStr.includes("destination")) {
        headerRowIdx = i;
        break;
      }
    }

    const headerRow = (allArrayRows[headerRowIdx] as unknown[]).map(h => String(h).trim());

    // Build keyed data rows from the rows below the header row
    const rawRows: Record<string, unknown>[] = allArrayRows
      .slice(headerRowIdx + 1)
      .filter(row => (row as unknown[]).some(c => c !== "" && c !== null && c !== undefined))
      .map(row => {
        const obj: Record<string, unknown> = {};
        headerRow.forEach((h, idx) => { obj[h] = (row as unknown[])[idx] ?? ""; });
        return obj;
      });

    if (!rawRows.length) { res.status(400).json({ ok: false, error: "empty_file" }); return; }
    const headers = headerRow;

    const deliveredCol = headers.find(h => {
      const hl = h.toLowerCase();
      return hl.includes("livr") && hl.includes("date");
    }) ?? headers.find(h => h.toLowerCase().includes("livr")) ?? "";

    const wilayaCol = headers.find(h => {
      const hl = h.toLowerCase();
      return hl.includes("wilaya") || hl.includes("wilaya dest") || hl.includes("destination");
    }) ?? "";

    if (!deliveredCol) {
      res.status(400).json({ ok: false, error: "column_not_found", detail: `No livraison column found. Available: ${headers.join(", ")}` }); return;
    }
    if (!wilayaCol) {
      res.status(400).json({ ok: false, error: "column_not_found", detail: `No wilaya column found. Available: ${headers.join(", ")}` }); return;
    }

    const conn = await pool.getConnection();
    try {
      // Try office-specific rates first, fall back to global wilaya rates
      const [officeRateRows] = await conn.execute(
        `SELECT wilaya_name, wilaya_number, ${rateCol} AS rate_dzd FROM office_commission_rates WHERE office_name = ?`,
        [officeName]
      ) as [Array<{ wilaya_name: string; wilaya_number: string | null; rate_dzd: string }>, unknown];

      let rateMap: Record<string, number> = {};
      if (officeRateRows.length > 0) {
        for (const r of officeRateRows) {
          rateMap[r.wilaya_name.toLowerCase()] = Number(r.rate_dzd);
          if (r.wilaya_number) rateMap[r.wilaya_number.toLowerCase()] = Number(r.rate_dzd);
        }
      } else {
        const [globalRateRows] = await conn.execute(
          `SELECT wilaya_name, wilaya_number, ${rateCol} AS rate_dzd FROM wilaya_commission_rates`
        ) as [Array<{ wilaya_name: string; wilaya_number: string | null; rate_dzd: string }>, unknown];
        for (const r of globalRateRows) {
          rateMap[r.wilaya_name.toLowerCase()] = Number(r.rate_dzd);
          if (r.wilaya_number) rateMap[r.wilaya_number.toLowerCase()] = Number(r.rate_dzd);
        }
      }

      const wilayaMap: Record<string, { delivered: number; rate: number }> = {};
      for (const row of rawRows) {
        const wilayaRaw = String(row[wilayaCol] ?? "").trim();
        if (!wilayaRaw) continue;
        const delivered = parseInt(String(row[deliveredCol] ?? "0").replace(/[\s,]/g, ""), 10) || 0;
        if (delivered === 0) continue;
        if (!wilayaMap[wilayaRaw]) {
          const rate = rateMap[wilayaRaw.toLowerCase()] ?? 0;
          wilayaMap[wilayaRaw] = { delivered: 0, rate };
        }
        wilayaMap[wilayaRaw].delivered += delivered;
      }

      const results = Object.entries(wilayaMap)
        .map(([wilaya, d]) => ({ office: officeName, wilaya, delivered: d.delivered, rate: d.rate, commission: d.delivered * d.rate }))
        .sort((a, b) => b.commission - a.commission);

      const totalCommissions = results.reduce((s, r) => s + r.commission, 0);

      // Save xlsx file to disk
      const xlsxFilename = `${randomUUID()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const xlsxPath = join(UPLOADS_DIR, xlsxFilename);
      writeFileSync(xlsxPath, file.buffer);

      const authReq = req as AuthedRequest;
      await conn.execute(
        "INSERT INTO commission_uploads (uploaded_by, file_name, period_label, results_json, total_commissions, xlsx_file) VALUES (?, ?, ?, ?, ?, ?)",
        [authReq.adminUsername ?? "", file.originalname, officeName, JSON.stringify({ breakdown: results, rateType: rateTypeRaw }), totalCommissions, xlsxFilename]
      );

      res.json({ ok: true, results, totalCommissions, officeName, detectedDeliveredCol: deliveredCol, detectedWilayaCol: wilayaCol });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to add commission");
    res.status(500).json({ ok: false, error: "parse_error", detail: String(err) });
  }
});

router.post("/admin/commissions/calculate", adminAuth, financeOrAdminOnly, xlsxUpload.single("xlsx"), async (req, res) => {
  const file = req.file;
  if (!file) { res.status(400).json({ ok: false, error: "no_file" }); return; }
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
    if (!rawRows.length) { res.status(400).json({ ok: false, error: "empty_file" }); return; }
    const headers = Object.keys(rawRows[0]);
    // Return headers + first 5 rows preview for the frontend to map columns
    res.json({ ok: true, headers, preview: rawRows.slice(0, 5), totalRows: rawRows.length, rows: rawRows });
  } catch (err) {
    req.log.error({ err }, "Failed to parse xlsx");
    res.status(500).json({ ok: false, error: "parse_error", detail: String(err) });
  }
});

router.post("/admin/commissions/compute", adminAuth, financeOrAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const rows = (b.rows ?? []) as Array<Record<string, unknown>>;
  const officeCol = String(b.officeCol ?? "");
  const deliveredCol = String(b.deliveredCol ?? "");
  const wilayaCol = String(b.wilayaCol ?? "");
  const periodLabel = String(b.periodLabel ?? "").slice(0, 100);

  if (!officeCol || !deliveredCol || !rows.length) {
    res.status(400).json({ ok: false, error: "invalid_params" }); return;
  }

  try {
    const conn = await pool.getConnection();
    try {
      // Fetch commission rates
      const [rateRows] = await conn.execute(
        "SELECT wilaya_name, rate_dzd FROM wilaya_commission_rates"
      ) as [Array<{ wilaya_name: string; rate_dzd: string }>, unknown];
      const rateMap: Record<string, number> = {};
      for (const r of rateRows) rateMap[r.wilaya_name.toLowerCase()] = Number(r.rate_dzd);

      // Fetch offices to match station → wilaya
      const [officeRows] = await conn.execute(
        "SELECT wilaya_number, wilaya FROM offices"
      ) as [Array<{ wilaya_number: string; wilaya: string }>, unknown];
      const officeWilayaMap: Record<string, string> = {};
      for (const o of officeRows) {
        officeWilayaMap[o.wilaya_number.toLowerCase()] = o.wilaya;
        officeWilayaMap[o.wilaya.toLowerCase()] = o.wilaya;
      }

      // Aggregate delivered per office (+ optional wilaya col)
      const officeMap: Record<string, { delivered: number; wilaya: string; commission: number }> = {};
      for (const row of rows) {
        const officeName = String(row[officeCol] ?? "").trim();
        const delivered = parseInt(String(row[deliveredCol] ?? "0").replace(/\s/g, ""), 10) || 0;
        if (!officeName || delivered === 0) continue;

        // Determine wilaya: from xlsx col if provided, else match office name to DB
        let wilaya = "";
        if (wilayaCol && row[wilayaCol]) {
          wilaya = String(row[wilayaCol]).trim();
        } else {
          wilaya = officeWilayaMap[officeName.toLowerCase()] ?? "";
        }
        const rate = rateMap[wilaya.toLowerCase()] ?? 0;
        const commission = delivered * rate;

        if (!officeMap[officeName]) {
          officeMap[officeName] = { delivered: 0, wilaya, commission: 0 };
        }
        officeMap[officeName].delivered += delivered;
        officeMap[officeName].commission += commission;
      }

      const results = Object.entries(officeMap)
        .map(([office, d]) => ({ office, wilaya: d.wilaya, delivered: d.delivered, commission: d.commission }))
        .sort((a, b) => b.commission - a.commission);

      const totalCommissions = results.reduce((s, r) => s + r.commission, 0);

      // Save upload record
      const authReq = req as AuthedRequest;
      await conn.execute(
        "INSERT INTO commission_uploads (uploaded_by, file_name, period_label, results_json, total_commissions) VALUES (?, ?, ?, ?, ?)",
        [authReq.adminUsername ?? "", "xlsx", periodLabel, JSON.stringify(results), totalCommissions]
      );

      res.json({ ok: true, results, totalCommissions });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to compute commissions");
    res.status(500).json({ ok: false, error: "db_error", detail: String(err) });
  }
});

router.get("/admin/commissions/history", adminAuth, financeOrAdminOnly, async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const office = typeof q.office === "string" && q.office ? q.office : null;
  const from   = typeof q.from   === "string" && q.from   ? q.from   : null;
  const to     = typeof q.to     === "string" && q.to     ? q.to     : null;
  try {
    const conn = await pool.getConnection();
    try {
      const params: string[] = [];
      let where = "WHERE 1=1";
      if (office) { where += " AND period_label = ?"; params.push(office); }
      if (from)   { where += " AND DATE(created_at) >= ?"; params.push(from.slice(0, 10)); }
      if (to)     { where += " AND DATE(created_at) <= ?"; params.push(to.slice(0, 10)); }
      const [rows] = await conn.execute(
        `SELECT id, uploaded_by, file_name, period_label, results_json, total_commissions, created_at FROM commission_uploads ${where} ORDER BY created_at DESC LIMIT 1000`,
        params,
      ) as [Array<Record<string, unknown>>, unknown];
      res.json({ ok: true, history: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch commission history");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.get("/admin/commissions/:id/file", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT file_name, xlsx_file FROM commission_uploads WHERE id = ?", [id]
      ) as [Array<{ file_name: string; xlsx_file: string | null }>, unknown];
      if (!rows.length || !rows[0].xlsx_file) { res.status(404).json({ ok: false, error: "not_found" }); return; }
      const { file_name, xlsx_file } = rows[0];
      const filePath = join(UPLOADS_DIR, xlsx_file);
      if (!existsSync(filePath)) { res.status(404).json({ ok: false, error: "file_missing" }); return; }
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(file_name)}"`);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      createReadStream(filePath).pipe(res);
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to stream commission file");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/commissions/:id", adminAuth, superAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM commission_uploads WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete commission upload");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── App Settings (key-value store) ────────────────────────────────────────────
router.get("/admin/settings/:key", adminAuth, async (req, res) => {
  const key = (req.params as { key: string }).key;
  if (!key || key.length > 100) { res.status(400).json({ ok: false, error: "invalid_key" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT setting_value FROM app_settings WHERE setting_key = ?", [key]
      ) as [Array<{ setting_value: string }>, unknown];
      res.json({ ok: true, value: rows[0]?.setting_value ?? null });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to get setting");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.put("/admin/settings/:key", adminAuth, financeOrAdminOnly, async (req, res) => {
  const key = (req.params as { key: string }).key;
  const value = String((req.body as Record<string, unknown>)?.value ?? "");
  if (!key || key.length > 100) { res.status(400).json({ ok: false, error: "invalid_key" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)",
        [key, value]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to set setting");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Commission Returns ─────────────────────────────────────────────────────────
router.get("/admin/commission-returns", adminAuth, financeOrAdminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  try {
    const conn = await pool.getConnection();
    try {
      const params: string[] = [];
      let where = "WHERE 1=1";
      if (q.from)   { where += " AND return_date >= ?"; params.push(q.from); }
      if (q.to)     { where += " AND return_date <= ?"; params.push(q.to); }
      if (q.office) { where += " AND office_name = ?"; params.push(q.office); }
      const [rows] = await conn.execute(
        `SELECT id, office_name, return_count, deduction_dzd, return_date, uploaded_by, created_at FROM commission_returns ${where} ORDER BY return_date DESC, created_at DESC LIMIT 1000`,
        params
      ) as [Array<Record<string, unknown>>, unknown];
      res.json({ ok: true, returns: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch commission returns");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/commission-returns", adminAuth, financeOrAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const officeName = String(b.office_name ?? "").trim();
  const returnCount = parseInt(String(b.return_count ?? "0"), 10);
  const deductionDzd = parseInt(String(b.deduction_dzd ?? "0"), 10);
  const returnDate = String(b.return_date ?? "").trim() || new Date().toISOString().split("T")[0];
  if (!officeName || isNaN(returnCount) || returnCount < 0) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const authReq = req as AuthedRequest;
      await conn.execute(
        "INSERT INTO commission_returns (office_name, return_count, deduction_dzd, return_date, uploaded_by) VALUES (?, ?, ?, ?, ?)",
        [officeName, returnCount, deductionDzd, returnDate, authReq.adminUsername ?? ""]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to add commission return");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/commission-returns/:id", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM commission_returns WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete commission return");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Commission SP (Stop Desk) ──────────────────────────────────────────────────
router.get("/admin/commission-sp", adminAuth, financeOrAdminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  try {
    const conn = await pool.getConnection();
    try {
      const params: string[] = [];
      let where = "WHERE 1=1";
      if (q.from)   { where += " AND sp_date >= ?"; params.push(q.from); }
      if (q.to)     { where += " AND sp_date <= ?"; params.push(q.to); }
      if (q.office) { where += " AND office_name = ?"; params.push(q.office); }
      const [rows] = await conn.execute(
        `SELECT id, office_name, sp_count, commission_dzd, sp_date, uploaded_by, created_at FROM commission_sp ${where} ORDER BY sp_date DESC, created_at DESC LIMIT 1000`,
        params
      ) as [Array<Record<string, unknown>>, unknown];
      res.json({ ok: true, entries: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch commission SP");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/commission-sp", adminAuth, financeOrAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const officeName = String(b.office_name ?? "").trim();
  const spCount = parseInt(String(b.sp_count ?? "0"), 10);
  const commissionDzd = parseInt(String(b.commission_dzd ?? "0"), 10);
  const spDate = String(b.sp_date ?? "").trim() || new Date().toISOString().split("T")[0];
  if (!officeName || isNaN(spCount) || spCount < 0) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const authReq = req as AuthedRequest;
      await conn.execute(
        "INSERT INTO commission_sp (office_name, sp_count, commission_dzd, sp_date, uploaded_by) VALUES (?, ?, ?, ?, ?)",
        [officeName, spCount, commissionDzd, spDate, authReq.adminUsername ?? ""]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to add commission SP");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/commission-sp/:id", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM commission_sp WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete commission SP");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Workers ──────────────────────────────────────────────────────────────────

router.get("/admin/workers", adminAuth, financeOrAdminOnly, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM workers ORDER BY last_name ASC, first_name ASC");
      res.json({ ok: true, workers: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch workers");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/workers", adminAuth, financeOrAdminOnly, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
  const workerId = typeof body.worker_id === "string" ? body.worker_id.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const nin = typeof body.nin === "string" ? body.nin.trim() : "";
  const position = typeof body.position === "string" ? body.position.trim() : "";
  const hub = typeof body.hub === "string" ? body.hub.trim() : "";
  if (!firstName || !lastName) { res.status(400).json({ ok: false, error: "missing_fields" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "INSERT INTO workers (first_name, last_name, worker_id, phone, nin, position, hub) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [firstName, lastName, workerId, phone, nin, position, hub]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create worker");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.put("/admin/workers/:id", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const firstName = typeof body.first_name === "string" ? body.first_name.trim() : "";
  const lastName = typeof body.last_name === "string" ? body.last_name.trim() : "";
  const workerId = typeof body.worker_id === "string" ? body.worker_id.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const nin = typeof body.nin === "string" ? body.nin.trim() : "";
  const position = typeof body.position === "string" ? body.position.trim() : "";
  const hub = typeof body.hub === "string" ? body.hub.trim() : "";
  if (!firstName || !lastName) { res.status(400).json({ ok: false, error: "missing_fields" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "UPDATE workers SET first_name=?, last_name=?, worker_id=?, phone=?, nin=?, position=?, hub=? WHERE id=?",
        [firstName, lastName, workerId, phone, nin, position, hub, id]
      );
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to update worker");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/workers/:id", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM workers WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete worker");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Décharges ────────────────────────────────────────────────────────────────

router.get("/admin/decharges", adminAuth, financeOrAdminOnly, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM decharges ORDER BY created_at DESC");
      res.json({ ok: true, decharges: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch decharges");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/decharges", adminAuth, financeOrAdminOnly, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const workerId = typeof body.worker_id === "number" ? body.worker_id : parseInt(String(body.worker_id ?? "0"), 10);
  const salaireFixe = parseFloat(String(body.salaire_fixe ?? "0")) || 0;
  const primes = parseFloat(String(body.primes ?? "0")) || 0;
  const montantNet = parseFloat(String(body.montant_net ?? "0")) || (salaireFixe + primes);
  const periodLabel = typeof body.period_label === "string" ? body.period_label.trim() : "";
  if (!workerId) { res.status(400).json({ ok: false, error: "missing_worker" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      // Fetch worker info
      const [workerRows] = await conn.execute("SELECT * FROM workers WHERE id = ? LIMIT 1", [workerId]) as [any[], any];
      if (!workerRows.length) { res.status(404).json({ ok: false, error: "worker_not_found" }); return; }
      const w = workerRows[0];

      // Generate Reçu number: increment counter in app_settings
      const year = new Date().getFullYear();
      const [counterRows] = await conn.execute(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'decharge_counter' FOR UPDATE"
      ) as [any[], any];
      const currentCount = parseInt(String(counterRows[0]?.setting_value ?? "0"), 10);
      const nextCount = currentCount + 1;
      await conn.execute("UPDATE app_settings SET setting_value = ? WHERE setting_key = 'decharge_counter'", [String(nextCount)]);
      const recuNumber = `DEC-${year}-${String(nextCount).padStart(4, "0")}`;

      const authReq = req as AuthedRequest;
      await conn.execute(
        `INSERT INTO decharges (worker_db_id, worker_first_name, worker_last_name, worker_position, worker_id_card, worker_phone, worker_nin, worker_hub, recu_number, salaire_fixe, primes, montant_net, period_label, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [workerId, w.first_name, w.last_name, w.position, w.worker_id, w.phone, w.nin, w.hub, recuNumber, salaireFixe, primes, montantNet, periodLabel, authReq.adminUsername ?? ""]
      );
      res.json({ ok: true, recu_number: recuNumber });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create decharge");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/decharges/:id", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM decharges WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete decharge");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Station Commissions ────────────────────────────────────────────────────────

router.get("/admin/station-commissions", adminAuth, financeOrAdminOnly, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT * FROM station_commissions ORDER BY created_at DESC"
      );
      res.json({ ok: true, commissions: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch station commissions");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/station-commissions", adminAuth, financeOrAdminOnly, async (req, res) => {
  const authReq = req as AuthedRequest;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const hubName = String(body.hub_name ?? "").trim();
  const hubPhone = String(body.hub_phone ?? "").trim();
  const agentName = String(body.agent_name ?? "").trim();
  const nbColis = parseInt(String(body.nb_colis ?? "0"), 10) || 0;
  const bonusRetour = parseFloat(String(body.bonus_retour ?? "0")) || 0;
  const montantNet = parseFloat(String(body.montant_net ?? "0")) || 0;
  const periodLabel = String(body.period_label ?? "").trim();
  if (!hubName) { res.status(400).json({ ok: false, error: "missing_hub" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [counterRows] = await conn.execute(
        "SELECT setting_value FROM app_settings WHERE setting_key = 'station_comm_counter' FOR UPDATE"
      );
      const currentCount = parseInt((counterRows as Array<{ setting_value: string }>)[0]?.setting_value ?? "0", 10);
      const nextCount = currentCount + 1;
      await conn.execute("UPDATE app_settings SET setting_value = ? WHERE setting_key = 'station_comm_counter'", [String(nextCount)]);
      const year = new Date().getFullYear();
      const recuNumber = `COM-${year}-${String(nextCount).padStart(4, "0")}`;
      const [result] = await conn.execute(
        `INSERT INTO station_commissions (hub_name, hub_phone, agent_name, recu_number, nb_colis, bonus_retour, montant_net, period_label, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [hubName, hubPhone, agentName, recuNumber, nbColis, bonusRetour, montantNet, periodLabel, authReq.adminUsername ?? ""]
      );
      await conn.commit();
      res.json({ ok: true, id: (result as { insertId: number }).insertId, recu_number: recuNumber });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to create station commission");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/admin/station-commissions/:id", adminAuth, financeOrAdminOnly, async (req, res) => {
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM station_commissions WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to delete station commission");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

export default router;
