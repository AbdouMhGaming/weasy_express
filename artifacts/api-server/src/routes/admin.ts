import { Router, type IRouter } from "express";
import { db, pool, partnersTable, officesTable, adminsTable, ordersTable, chargesTable, payoutsTable, eq, desc, asc, count, isNotNull, sql, and } from "@workspace/db";
import { gte, lte } from "drizzle-orm";
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

    const [manualSenders, manualRecipients, officeAgents, marketers, pdfRaw] = await Promise.all([
      db.select({
        name: ordersTable.senderName,
        count: count(),
        delivered: sql<number>`SUM(CASE WHEN ${ordersTable.status} = 'delivered' THEN 1 ELSE 0 END)`,
      }).from(ordersTable).where(isNotNull(ordersTable.senderName))
        .groupBy(ordersTable.senderName).orderBy(desc(count())).limit(50),

      // Top recipients from manual orders
      db.select({
        name: ordersTable.recipientName,
        count: count(),
      }).from(ordersTable).where(isNotNull(ordersTable.recipientName))
        .groupBy(ordersTable.recipientName).orderBy(desc(count())).limit(500),

      db.select({ name: adminsTable.username, createdAt: adminsTable.createdAt })
        .from(adminsTable).where(eq(adminsTable.role, "office"))
        .orderBy(desc(adminsTable.createdAt)).limit(50),

      db.select({ name: adminsTable.username, createdAt: adminsTable.createdAt })
        .from(adminsTable).where(eq(adminsTable.role, "commercial"))
        .orderBy(desc(adminsTable.createdAt)).limit(10),

      // Get sender/recipient/wilaya data from PDF office_reports
      pool.getConnection().then(async (conn: any) => {
        try {
          const officeFilter = officeStr ? " AND uploaded_by = ?" : "";
          const officeParam = officeStr ? [officeStr] : [];

          // delivery_receipt: single sender per report — counts are accurate
          const [drRows] = await conn.execute(
            `SELECT sender_name,
               SUM(total_parcels) AS cnt,
               SUM(total_parcels) AS del,
               GROUP_CONCAT(recipient_names SEPARATOR '|') AS all_recipients,
               GROUP_CONCAT(wilayas ORDER BY created_at SEPARATOR ',') AS all_wilayas
             FROM office_reports
             WHERE report_type = 'delivery_receipt'
               AND sender_name IS NOT NULL AND sender_name != ''
               ${officeFilter}
             GROUP BY sender_name`,
            officeParam,
          );
          // route_sheet: per_order_senders is a pipe-separated list aligned with tracking numbers
          // (one entry per parcel), giving the exact order count per sender.
          // sender_name is only the deduplicated unique-senders string — do NOT use it for counts.
          const [rsRows] = await conn.execute(
            `SELECT sender_name, total_parcels, per_order_senders
             FROM office_reports
             WHERE report_type = 'route_sheet'
               AND sender_name IS NOT NULL AND sender_name != ''
               ${officeFilter}`,
            officeParam,
          );
          // returns_list: single sender per report
          const [retRows] = await conn.execute(
            `SELECT sender_name,
               SUM(total_parcels) AS cnt
             FROM office_reports
             WHERE report_type = 'returns_list'
               AND sender_name IS NOT NULL AND sender_name != ''
               ${officeFilter}
             GROUP BY sender_name`,
            officeParam,
          );
          // all wilayas across all types (for wilaya aggregation)
          const [wilayaRows] = await conn.execute(
            `SELECT GROUP_CONCAT(wilayas ORDER BY created_at SEPARATOR ',') AS all_wilayas
             FROM office_reports
             ${officeStr ? "WHERE uploaded_by = ?" : ""}`,
            officeParam,
          );
          return {
            drRows: drRows as Array<{ sender_name: string; cnt: string|number; del: string|number; all_recipients: string|null; all_wilayas: string|null }>,
            rsRows: rsRows as Array<{ sender_name: string; total_parcels: string|number; per_order_senders: string|null }>,
            retRows: retRows as Array<{ sender_name: string; cnt: string|number }>,
            allWilayas: ((wilayaRows as Array<{all_wilayas:string|null}>)[0]?.all_wilayas ?? ""),
          };
        } finally { conn.release(); }
      }),
    ]);

    // ── Merge senders ────────────────────────────────────────────────────────
    // Only delivery_receipt gives accurate per-sender parcel counts.
    const senderMap: Record<string, { name: string; count: number; delivered: number }> = {};
    for (const s of manualSenders) {
      if (!s.name) continue;
      senderMap[s.name] = { name: s.name, count: Number(s.count), delivered: Number(s.delivered) };
    }
    // delivery_receipt PDF rows — single sender, accurate counts
    for (const s of pdfRaw.drRows) {
      const name = s.sender_name;
      if (!name) continue;
      if (senderMap[name]) {
        senderMap[name].count    += Number(s.cnt);
        senderMap[name].delivered += Number(s.del);
      } else {
        senderMap[name] = { name, count: Number(s.cnt), delivered: Number(s.del) };
      }
    }
    // route_sheet PDF rows — use per_order_senders (one entry per parcel, pipe-separated)
    // to get the true per-sender parcel count. sender_name is only the deduplicated list
    // and must NOT be used for counting (every unique sender would get the full total).
    for (const s of pdfRaw.rsRows) {
      if (s.per_order_senders) {
        // Count each sender's actual parcels from the per-order aligned list
        const perOrder = s.per_order_senders.split("|").map((p: string) => p.trim()).filter(Boolean);
        const perSenderCount: Record<string, number> = {};
        for (const name of perOrder) {
          perSenderCount[name] = (perSenderCount[name] ?? 0) + 1;
        }
        for (const [name, cnt] of Object.entries(perSenderCount)) {
          if (senderMap[name]) {
            senderMap[name].count += cnt;
          } else {
            senderMap[name] = { name, count: cnt, delivered: 0 };
          }
        }
      } else {
        // Fallback for older reports without per_order_senders: divide equally across unique senders
        const parts = s.sender_name.split("|").map((p: string) => p.trim()).filter(Boolean);
        if (parts.length === 0) continue;
        const each = Math.round((Number(s.total_parcels) || 1) / parts.length);
        for (const name of parts) {
          if (!name) continue;
          if (senderMap[name]) {
            senderMap[name].count += each;
          } else {
            senderMap[name] = { name, count: each, delivered: 0 };
          }
        }
      }
    }
    // retRows = returns_list: excluded from senderMap (returned parcels must not inflate sender counts)
    const topSenders = Object.values(senderMap)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Merge recipients ─────────────────────────────────────────────────────
    const recipientMap: Record<string, number> = {};

    // From manual orders
    for (const r of manualRecipients) {
      if (!r.name) continue;
      const key = r.name.trim();
      if (!key) continue;
      recipientMap[key] = (recipientMap[key] ?? 0) + Number(r.count);
    }

    // From PDF delivery_receipt rows — recipient_names is pipe-separated
    for (const row of pdfRaw.drRows) {
      if (!row.all_recipients) continue;
      const names = row.all_recipients.split(/[|\n]/).map((n: string) => n.trim()).filter(Boolean);
      for (const name of names) {
        if (name.length < 2 || name.length > 100) continue;
        recipientMap[name] = (recipientMap[name] ?? 0) + 1;
      }
    }

    const topRecipients = Object.entries(recipientMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── Merge top wilayas from all PDF report types ───────────────────────────
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
router.get("/admin/charges-summary", adminAuth, superAdminOnly, async (req, res) => {
  try {
    const conn = await pool.getConnection();
    try {
      const [catRows] = await conn.execute(
        "SELECT category, SUM(amount_dzd) as total FROM charges GROUP BY category"
      ) as [Array<{ category: string; total: string | number }>, unknown];
      const [payRows] = await conn.execute(
        "SELECT COALESCE(SUM(amount_dzd), 0) as total_paid FROM payouts"
      ) as [Array<{ total_paid: string | number }>, unknown];
      const [chgRows] = await conn.execute(
        "SELECT COALESCE(SUM(amount_dzd), 0) as total_charges FROM charges"
      ) as [Array<{ total_charges: string | number }>, unknown];
      const byCategory: Record<string, number> = {};
      for (const r of catRows) byCategory[r.category] = Number(r.total);
      res.json({
        ok: true, byCategory,
        totalCharges: Number(chgRows[0]?.total_charges ?? 0),
        totalPaid: Number(payRows[0]?.total_paid ?? 0),
      });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch charges summary");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ── Charges ────────────────────────────────────────────────────────────────────
router.get("/admin/charges", adminAuth, superAdminOnly, async (req, res) => {
  const q = req.query as Record<string, string>;
  try {
    const conn = await pool.getConnection();
    try {
      const params: string[] = [];
      let where = "WHERE TRUE";
      if (q.from) { where += " AND charge_date >= ?"; params.push(q.from); }
      if (q.to) { where += " AND charge_date <= ?"; params.push(q.to); }
      if (q.category) { where += " AND category = ?"; params.push(q.category); }
      const [rows] = await conn.execute(
        `SELECT * FROM charges ${where} ORDER BY charge_date DESC, created_at DESC`, params
      );
      res.json({ ok: true, charges: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch charges");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.post("/admin/charges", adminAuth, superAdminOnly, async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const validCats = ["marketing", "hr", "it", "packaging", "cod", "warehouse", "various"];
  const category = String(b.category ?? "").trim();
  const amount = parseInt(String(b.amount_dzd ?? "0"), 10);
  const description = b.description ? String(b.description).trim().slice(0, 500) : null;
  const chargeDate = String(b.charge_date ?? "").trim() || new Date().toISOString().split("T")[0];
  if (!validCats.includes(category) || isNaN(amount) || amount < 0) {
    res.status(400).json({ ok: false, error: "invalid_fields" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        "INSERT INTO charges (category, amount_dzd, description, charge_date) VALUES (?, ?, ?, ?)",
        [category, amount, description, chargeDate]
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

export default router;
