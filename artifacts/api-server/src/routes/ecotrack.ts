import { Router } from "express";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";
import { EcotrackError, ecotrackPdf, ecotrackRequest, ecotrackToken } from "../lib/ecotrackClient";

const router = Router();
const PAGE_SIZE = 40;
const MAX_SYNC_PAGES = 10;
const references = new Map<string, { until: number; value: unknown }>();

async function accountFor(req: AuthedRequest): Promise<any | null> {
  if (req.adminRole !== "expediteur") return null;
  const conn = await pool.getConnection();
  try {
    const [[sessionAccount]] = await conn.execute(
      "SELECT id, parent_id, permissions FROM admins WHERE username=? AND role='expediteur' LIMIT 1",
      [req.adminUsername],
    ) as any;
    if (!sessionAccount) return null;
    if (!sessionAccount.parent_id) return sessionAccount;

    let permissions: string[] = [];
    try {
      permissions = sessionAccount.permissions ? JSON.parse(sessionAccount.permissions) : [];
    } catch {
      return null;
    }
    // Empty permissions retain the project's existing "all sections" behavior.
    if (permissions.length > 0 && !permissions.includes("ecotrack")) return null;

    const [[rootAccount]] = await conn.execute(
      "SELECT id, parent_id FROM admins WHERE id=? AND role='expediteur' AND parent_id IS NULL LIMIT 1",
      [sessionAccount.parent_id],
    ) as any;
    return rootAccount ?? null;
  } finally { conn.release(); }
}
async function credentials(req: AuthedRequest) {
  const account = await accountFor(req);
  if (!account) throw new EcotrackError("forbidden", 403, null);
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.execute(
      `SELECT token_ciphertext, token_iv, token_auth_tag FROM expediteur_ecotrack_credentials
       WHERE expediteur_id=? LIMIT 1`, [account.id],
    ) as any;
    if (!row) throw new EcotrackError("Ecotrack is not connected", 409, null);
    return { expediteurId: account.id as number, token: ecotrackToken(row.token_ciphertext, row.token_iv, row.token_auth_tag) };
  } finally { conn.release(); }
}
function tracking(value: unknown) {
  const result = String(value ?? "").trim();
  return result.length > 0 && result.length <= 255 ? result : null;
}
function error(res: any, e: unknown) {
  const x = e instanceof EcotrackError ? e : new EcotrackError("Internal error", 500, null);
  return res.status(x.status === 429 ? 429 : x.status >= 400 && x.status < 600 ? x.status : 502).json({
    ok: false, error: x.credentialError ? "ecotrack_credentials_invalid" : x.message,
    ...(x.retryAfter === null ? {} : { retryAfter: x.retryAfter }),
    ...(x.body && typeof x.body === "object" ? { details: x.body } : {}),
  });
}
function compact(body: any, allowed: string[]) {
  const result: Record<string, string | number | boolean> = {};
  for (const key of allowed) {
    const value = body?.[key];
    if (value !== undefined && value !== null && value !== "") result[key] = typeof value === "string" ? value.trim().slice(0, 255) : value;
  }
  return result;
}
const createFields = ["reference", "nom_client", "telephone", "telephone_2", "adresse", "code_postal", "commune", "code_wilaya", "montant", "remarque", "produit", "stock", "quantite", "produit_a_recuperer", "boutique", "type", "stop_desk", "weight", "fragile", "gps_link"];
const updateFields = ["tracking", "reference", "client", "tel", "tel2", "adresse", "code_postal", "commune", "wilaya", "montant", "remarque", "product", "boutique", "type", "stop_desk", "fragile", "gps_link"];

async function cacheOrders(expediteurId: number, orders: any[]) {
  if (!orders.length) return;
  const conn = await pool.getConnection();
  try {
    for (const order of orders) {
      const id = tracking(order?.tracking); if (!id) continue;
      await conn.execute(
        `INSERT INTO expediteur_ecotrack_order_cache
         (expediteur_id, tracking, reference_value, client_name, phone, status_value, montant, tarif_prestation, tarif_retour, created_at_remote, last_updated_at_remote, raw_order, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE reference_value=VALUES(reference_value), client_name=VALUES(client_name), phone=VALUES(phone),
          status_value=VALUES(status_value), montant=VALUES(montant), tarif_prestation=VALUES(tarif_prestation), tarif_retour=VALUES(tarif_retour), created_at_remote=VALUES(created_at_remote),
          last_updated_at_remote=VALUES(last_updated_at_remote), raw_order=VALUES(raw_order), fetched_at=NOW()`,
        [expediteurId, id, order.reference ?? null, order.client ?? null, order.phone ?? null,
          order.status ?? order.process_state_id ?? null, order.montant ?? null, order.tarif_prestation ?? null, order.tarif_retour ?? null, order.created_at ?? null,
          order.last_updated_at ?? null, JSON.stringify(order)],
      );
    }
  } finally { conn.release(); }
}
async function upstream(req: AuthedRequest) { return credentials(req); }

router.use("/expediteur/ecotrack", adminAuth);

router.get("/expediteur/ecotrack/dashboard", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId } = await credentials(req);
    const conn = await pool.getConnection();
    try {
      const [[total]] = await conn.execute(`SELECT COUNT(*) total, COALESCE(SUM(montant),0) amount,
        COALESCE(SUM(tarif_prestation),0) prestationFees, COALESCE(SUM(tarif_retour),0) returnFees, MAX(fetched_at) lastSync
        FROM expediteur_ecotrack_order_cache WHERE expediteur_id=?`, [expediteurId]) as any;
      const [statuses] = await conn.execute(`SELECT status_value status, COUNT(*) count, COALESCE(SUM(montant),0) amount
        FROM expediteur_ecotrack_order_cache WHERE expediteur_id=? GROUP BY status_value`, [expediteurId]) as any;
      const [recent] = await conn.execute(`SELECT raw_order FROM expediteur_ecotrack_order_cache WHERE expediteur_id=?
        ORDER BY COALESCE(last_updated_at_remote, created_at_remote) DESC, fetched_at DESC LIMIT 10`, [expediteurId]) as any;
      const [[state]] = await conn.execute("SELECT next_page, last_page, last_synced_at, blocked_until FROM expediteur_ecotrack_sync_state WHERE expediteur_id=?", [expediteurId]) as any;
      return res.json({ ok: true, totals: { orders: Number(total.total), montant: Number(total.amount), tarifPrestation: Number(total.prestationFees), tarifRetour: Number(total.returnFees) }, statuses, recentOrders: recent.map((r: any) => JSON.parse(r.raw_order)), sync: state ?? { next_page: 1, last_page: null, last_synced_at: null, blocked_until: null } });
    } finally { conn.release(); }
  } catch (e) { return error(res, e); }
});

router.post("/expediteur/ecotrack/sync", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req);
    const conn = await pool.getConnection();
    let state: any;
    try {
      const [[row]] = await conn.execute("SELECT next_page, last_page, blocked_until FROM expediteur_ecotrack_sync_state WHERE expediteur_id=?", [expediteurId]) as any;
      state = row ?? { next_page: 1, last_page: null, blocked_until: null };
      if (state.blocked_until && new Date(state.blocked_until).getTime() > Date.now()) return res.status(429).json({ ok: false, error: "rate_limited", retryAfter: Math.ceil((new Date(state.blocked_until).getTime() - Date.now()) / 1000) });
    } finally { conn.release(); }
    let page = Math.max(1, Number(state.next_page) || 1), fetched = 0, lastPage = Number(state.last_page) || null;
    for (; fetched < MAX_SYNC_PAGES; fetched++) {
      let result;
      try { result = await ecotrackRequest(token, "/api/v1/get/orders", { params: { page } }); }
      catch (e) {
        if (e instanceof EcotrackError && e.status === 429) {
          const wait = e.retryAfter ?? 60; const db = await pool.getConnection();
          try { await db.execute(`INSERT INTO expediteur_ecotrack_sync_state (expediteur_id,next_page,last_page,blocked_until) VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND))
            ON DUPLICATE KEY UPDATE next_page=VALUES(next_page),last_page=VALUES(last_page),blocked_until=VALUES(blocked_until)`, [expediteurId, page, lastPage, wait]); } finally { db.release(); }
        }
        throw e;
      }
      const body = result.body ?? {}; await cacheOrders(expediteurId, Array.isArray(body.data) ? body.data : []);
      lastPage = Number(body.last_page) || page;
      page = page >= lastPage ? 1 : page + 1;
      if (page === 1) { fetched++; break; }
    }
    const db = await pool.getConnection();
    try { await db.execute(`INSERT INTO expediteur_ecotrack_sync_state (expediteur_id,next_page,last_page,last_synced_at,blocked_until) VALUES (?,?,?,NOW(),NULL)
      ON DUPLICATE KEY UPDATE next_page=VALUES(next_page),last_page=VALUES(last_page),last_synced_at=NOW(),blocked_until=NULL`, [expediteurId, page, lastPage]); } finally { db.release(); }
    return res.json({ ok: true, pagesFetched: fetched, nextPage: page, lastPage, complete: page === 1 });
  } catch (e) { return error(res, e); }
});

router.get("/expediteur/ecotrack/orders", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req); const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const search = String(req.query.search ?? "").trim().slice(0, 255), status = String(req.query.status ?? "").trim().slice(0, 255);
    if (search || status) {
      const conn = await pool.getConnection(); try {
        const where = ["expediteur_id=?"]; const params: any[] = [expediteurId];
        if (status) { where.push("status_value=?"); params.push(status); }
        if (search) { where.push("(tracking LIKE ? OR reference_value LIKE ? OR client_name LIKE ? OR phone LIKE ?)"); params.push(...Array(4).fill(`%${search}%`)); }
        const [[count]] = await conn.execute(`SELECT COUNT(*) total FROM expediteur_ecotrack_order_cache WHERE ${where.join(" AND ")}`, params) as any;
        const [rows] = await conn.execute(`SELECT raw_order FROM expediteur_ecotrack_order_cache WHERE ${where.join(" AND ")} ORDER BY fetched_at DESC LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]) as any;
        const total = Number(count.total); return res.json({ ok: true, data: rows.map((r: any) => JSON.parse(r.raw_order)), pagination: { current_page: page, per_page: PAGE_SIZE, total, last_page: Math.max(1, Math.ceil(total / PAGE_SIZE)) }, source: "cache" });
      } finally { conn.release(); }
    }
    const result = await ecotrackRequest(token, "/api/v1/get/orders", { params: { page, tracking: req.query.tracking } });
    await cacheOrders(expediteurId, Array.isArray(result.body?.data) ? result.body.data : []);
    return res.json({ ok: true, data: result.body?.data ?? [], pagination: { current_page: result.body?.current_page ?? page, per_page: PAGE_SIZE, total: result.body?.total ?? 0, last_page: result.body?.last_page ?? 1 }, source: "upstream" });
  } catch (e) { return error(res, e); }
});

router.get("/expediteur/ecotrack/orders/:tracking", async (req: AuthedRequest, res) => {
  const id = tracking(req.params.tracking); if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
  try {
    const { token } = await upstream(req);
    const info = ecotrackRequest(token, "/api/v1/get/tracking/info", { params: { tracking: id } });
    let updates: any;
    try { updates = await ecotrackRequest(token, "/api/v1/get/maj", { method: "POST", params: { tracking: id } }); }
    catch { updates = await ecotrackRequest(token, "/api/v1/get/maj", { params: { tracking: id } }); }
    return res.json({ ok: true, tracking: id, info: (await info).body, updates: updates.body });
  } catch (e) { return error(res, e); }
});

async function mutation(req: AuthedRequest, res: any, path: string, method: string, params: any, body?: any) {
  try { const { token } = await upstream(req); const result = await ecotrackRequest(token, path, { method, params, body }); return res.json({ ok: true, result: result.body }); } catch (e) { return error(res, e); }
}
router.post("/expediteur/ecotrack/create/order", (req: AuthedRequest, res) => mutation(req, res, "/api/v1/create/order", "POST", compact(req.body, createFields)));
router.post("/expediteur/ecotrack/create/orders", (req: AuthedRequest, res) => {
  const items = Array.isArray(req.body?.orders) ? req.body.orders : Object.values(req.body?.orders ?? {});
  if (!items.length || items.length > 100) return res.status(400).json({ ok: false, error: "orders_must_contain_1_to_100_items" });
  return mutation(req, res, "/api/v1/create/orders", "POST", {}, { orders: Object.fromEntries(items.map((item: any, i: number) => [i, compact(item, createFields)])) });
});
router.put("/expediteur/ecotrack/update/order", (req: AuthedRequest, res) => mutation(req, res, "/api/v1/update/order", "POST", compact(req.body, updateFields)));
router.delete("/expediteur/ecotrack/order", (req: AuthedRequest, res) => mutation(req, res, "/api/v1/delete/order", "DELETE", { tracking: tracking(req.body?.tracking ?? req.query.tracking) }));
router.post("/expediteur/ecotrack/validate", (req: AuthedRequest, res) => mutation(req, res, "/api/v1/valid/order", "POST", compact(req.body, ["tracking", "ask_collection"])));
router.post("/expediteur/ecotrack/note", (req: AuthedRequest, res) => mutation(req, res, "/api/v1/add/maj", "POST", compact(req.body, ["tracking", "content"])));
router.post("/expediteur/ecotrack/return-request", (req: AuthedRequest, res) => mutation(req, res, "/api/v1/ask/for/order/return", "POST", compact(req.body, ["tracking"])));

router.get("/expediteur/ecotrack/orders/:tracking/label", async (req: AuthedRequest, res) => {
  const id = tracking(req.params.tracking); if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
  try { const { token } = await upstream(req); const response = await ecotrackPdf(token, "/api/v1/get/order/label", { tracking: id });
    if (!response.body || !response.headers.get("content-type")?.toLowerCase().includes("application/pdf")) throw new EcotrackError("Invalid label response", 502, null);
    res.status(200).set("Content-Type", "application/pdf").set("Content-Disposition", `inline; filename="label-${id.replace(/[^A-Za-z0-9_-]/g, "")}.pdf"`).set("X-Content-Type-Options", "nosniff");
    const { Readable } = await import("node:stream"); Readable.fromWeb(response.body as any).pipe(res);
    return undefined;
  } catch (e) { if (!res.headersSent) return error(res, e); res.destroy(); return undefined; }
});

for (const [name, path] of Object.entries({ wilayas: "/api/v1/get/wilayas", communes: "/api/v1/get/communes", desks: "/api/v1/get/desks", fees: "/api/v1/get/fees", products: "/api/v1/get/products/list" })) {
  router.get(`/expediteur/ecotrack/${name}`, async (req: AuthedRequest, res) => {
    try { const { expediteurId, token } = await upstream(req); const suffix = name === "communes" ? `:${String(req.query.wilaya_id ?? "")}` : name === "products" ? `:${String(req.query.page ?? 1)}` : "";
      const key = `${expediteurId}:${name}${suffix}`, saved = references.get(key);
      if (saved && saved.until > Date.now()) return res.json({ ok: true, data: saved.value, cached: true });
      const result = await ecotrackRequest(token, path, { params: name === "communes" ? { wilaya_id: req.query.wilaya_id } : name === "products" ? { page: req.query.page } : {} });
      if (references.size >= 128) references.delete(references.keys().next().value!);
      references.set(key, { until: Date.now() + 5 * 60_000, value: result.body }); return res.json({ ok: true, data: result.body, cached: false });
    } catch (e) { return error(res, e); }
  });
}
export default router;