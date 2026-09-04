import { Router } from "express";
import { createRequire } from "node:module";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";
import { EcotrackError, ecotrackPdf, ecotrackRequest, ecotrackToken } from "../lib/ecotrackClient";
import { cacheOrders, syncEcotrackAccount } from "../lib/ecotrackSync";
import {
  ecotrackReferenceCache as references,
  ecotrackResolvedCommuneCache as resolvedCommunes,
} from "../lib/ecotrackRuntimeCache";

const router = Router();
const PAGE_SIZE = 40;
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

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
const updateFields = ["tracking", "reference", "client", "tel", "tel2", "adresse", "code_postal", "commune", "wilaya", "montant", "remarque", "product", "boutique", "type", "stop_desk", "weight", "fragile", "gps_link"];

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
      const sync = state
        ? {
            ...state,
            complete: state.last_page !== null && Number(state.next_page) === 1 && Boolean(state.last_synced_at),
          }
        : { next_page: 1, last_page: null, last_synced_at: null, blocked_until: null, complete: false };
      return res.json({ ok: true, totals: { orders: Number(total.total), montant: Number(total.amount), tarifPrestation: Number(total.prestationFees), tarifRetour: Number(total.returnFees) }, statuses, recentOrders: recent.map((r: any) => JSON.parse(r.raw_order)), sync });
    } finally { conn.release(); }
  } catch (e) { return error(res, e); }
});

router.post("/expediteur/ecotrack/sync", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req);
    const result = await syncEcotrackAccount(expediteurId, token);
    if (result.blocked) {
      return res.status(429).json({ ok: false, error: "rate_limited", retryAfter: result.retryAfter });
    }
    return res.json({ ok: true, ...result });
  } catch (e) { return error(res, e); }
});

router.get("/expediteur/ecotrack/orders", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId } = await upstream(req); const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const search = String(req.query.search ?? "").trim().slice(0, 255), status = String(req.query.status ?? "").trim().slice(0, 255);
    const conn = await pool.getConnection(); try {
      const where = ["expediteur_id=?"]; const params: any[] = [expediteurId];
      if (status) { where.push("status_value=?"); params.push(status); }
      if (search) { where.push("(tracking LIKE ? OR reference_value LIKE ? OR client_name LIKE ? OR phone LIKE ?)"); params.push(...Array(4).fill(`%${search}%`)); }
      const [[count]] = await conn.execute(`SELECT COUNT(*) total FROM expediteur_ecotrack_order_cache WHERE ${where.join(" AND ")}`, params) as any;
      const [rows] = await conn.execute(`SELECT raw_order FROM expediteur_ecotrack_order_cache WHERE ${where.join(" AND ")}
        ORDER BY COALESCE(last_updated_at_remote, created_at_remote) DESC, fetched_at DESC LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]) as any;
      const total = Number(count.total); return res.json({ ok: true, data: rows.map((r: any) => JSON.parse(r.raw_order)), pagination: { current_page: page, per_page: PAGE_SIZE, total, last_page: Math.max(1, Math.ceil(total / PAGE_SIZE)) }, source: "cache" });
    } finally { conn.release(); }
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

router.get("/expediteur/ecotrack/orders/:tracking/commune", async (req: AuthedRequest, res) => {
  const id = tracking(req.params.tracking);
  const wilayaId = String(req.query.wilaya_id ?? "").trim();
  if (!id || !wilayaId) return res.status(400).json({ ok: false, error: "tracking_and_wilaya_required" });
  try {
    const { expediteurId, token } = await upstream(req);
    const cacheKey = `${expediteurId}:${id}`;
    const cached = resolvedCommunes.get(cacheKey);
    if (cached && cached.until > Date.now()) return res.json({ ok: true, commune: cached.value, cached: true });

    const communesKey = `${expediteurId}:communes`;
    const savedCommunes = references.get(communesKey);
    let communesBody: any;
    if (savedCommunes && savedCommunes.until > Date.now()) {
      communesBody = savedCommunes.value;
    } else {
      const result = await ecotrackRequest(token, "/api/v1/get/communes");
      communesBody = result.body ?? {};
      references.set(communesKey, { until: Date.now() + 5 * 60_000, value: communesBody });
    }

    const labelResponse = await ecotrackPdf(token, "/api/v1/get/order/label", { tracking: id });
    const labelText = String((await pdfParse(Buffer.from(await labelResponse.arrayBuffer())))?.text ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();
    const candidates = Object.values(communesBody ?? {})
      .filter((commune: any) => String(commune?.wilaya_id) === wilayaId && typeof commune?.nom === "string")
      .map((commune: any) => String(commune.nom))
      .filter((name: string) => labelText.includes(name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()))
      .sort((a: string, b: string) => b.length - a.length);
    const commune = candidates[0];
    if (!commune) return res.status(404).json({ ok: false, error: "commune_not_found_on_label" });
    resolvedCommunes.set(cacheKey, { until: Date.now() + 24 * 60 * 60_000, value: commune });
    return res.json({ ok: true, commune, cached: false });
  } catch (e) {
    return error(res, e);
  }
});

async function mutation(req: AuthedRequest, res: any, path: string, method: string, params: any, body?: any) {
  try { const { token } = await upstream(req); const result = await ecotrackRequest(token, path, { method, params, body }); return res.json({ ok: true, result: result.body }); } catch (e) { return error(res, e); }
}
function createdTracking(body: any) {
  return tracking(body?.tracking ?? body?.data?.tracking ?? body?.order?.tracking ?? body?.result?.tracking);
}
function cachedCreatedOrder(item: any, id: string) {
  return {
    tracking: id,
    reference: item.reference ?? null,
    client: item.nom_client ?? null,
    phone: item.telephone ?? null,
    phone_2: item.telephone_2 ?? null,
    adresse: item.adresse ?? null,
    wilaya_id: item.code_wilaya ?? null,
    commune_name: item.commune ?? null,
    montant: item.montant ?? null,
    products: item.produit ?? null,
    weight: item.weight ?? null,
    remarque: item.remarque ?? null,
    type_id: item.type ?? null,
    stop_desk: item.stop_desk ?? 0,
    fragile: item.fragile ?? 0,
    status: "en_preparation",
    created_at: new Date().toISOString(),
    last_updated_at: new Date().toISOString(),
  };
}
async function patchCachedOrder(expediteurId: number, id: string, changes: any) {
  const conn = await pool.getConnection();
  try {
    const [[row]] = await conn.execute(
      "SELECT raw_order FROM expediteur_ecotrack_order_cache WHERE expediteur_id=? AND tracking=? LIMIT 1",
      [expediteurId, id],
    ) as any;
    if (!row) return;
    const current = JSON.parse(row.raw_order);
    await cacheOrders(expediteurId, [{
      ...current,
      reference: changes.reference ?? current.reference,
      client: changes.client ?? current.client,
      phone: changes.tel ?? current.phone,
      phone_2: changes.tel2 ?? current.phone_2,
      adresse: changes.adresse ?? current.adresse,
      wilaya_id: changes.wilaya ?? current.wilaya_id,
      commune_name: changes.commune ?? current.commune_name,
      montant: changes.montant ?? current.montant,
      products: changes.product ?? current.products,
      weight: changes.weight ?? current.weight,
      remarque: changes.remarque ?? current.remarque,
      type_id: changes.type ?? current.type_id,
      stop_desk: changes.stop_desk ?? current.stop_desk,
      fragile: changes.fragile ?? current.fragile,
      last_updated_at: new Date().toISOString(),
    }]);
  } finally {
    conn.release();
  }
}
async function refreshCachedOrder(expediteurId: number, token: string, id: string) {
  const result = await ecotrackRequest(token, "/api/v1/get/orders", {
    params: {
      tracking: id,
      start_date: "2020-01-01",
      end_date: new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10),
    },
  });
  const body = result.body ?? {};
  const order = Array.isArray(body.data) ? body.data.find((item: any) => tracking(item?.tracking) === id) : null;
  if (order) await cacheOrders(expediteurId, [order]);
}
router.post("/expediteur/ecotrack/create/order", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req);
    const item = compact(req.body, createFields);
    const result = await ecotrackRequest(token, "/api/v1/create/order", { method: "POST", body: item });
    const id = createdTracking(result.body);
    if (id) await cacheOrders(expediteurId, [cachedCreatedOrder(item, id)]);
    return res.json({ ok: true, result: result.body, tracking: id });
  } catch (e) { return error(res, e); }
});
router.post("/expediteur/ecotrack/create/orders", async (req: AuthedRequest, res) => {
  const items = Array.isArray(req.body?.orders) ? req.body.orders : Object.values(req.body?.orders ?? {});
  if (!items.length || items.length > 100) return res.status(400).json({ ok: false, error: "orders_must_contain_1_to_100_items" });
  try {
    const { expediteurId, token } = await upstream(req);
    const usedReferences = new Set<string>();
    const submitted = items.map((item: any, index: number) => {
      const order = compact(item, createFields);
      const original = String(order.reference ?? "").trim();
      let reference = original || `WEASY-${Date.now()}-${index + 1}`;
      let suffix = 2;
      while (usedReferences.has(reference.toLocaleLowerCase())) reference = `${original || reference}-${suffix++}`;
      usedReferences.add(reference.toLocaleLowerCase());
      return { ...order, reference };
    });
    const result = await ecotrackRequest(token, "/api/v1/create/orders", {
      method: "POST",
      body: { orders: Object.fromEntries(submitted.map((item, index) => [index, item])) },
    });
    const results = result.body?.results && typeof result.body.results === "object" ? result.body.results : {};
    const created = submitted.flatMap((item) => {
      const id = createdTracking(results[item.reference]);
      return id ? [cachedCreatedOrder(item, id)] : [];
    });
    if (created.length) await cacheOrders(expediteurId, created);
    const failures = submitted
      .filter((item) => !createdTracking(results[item.reference]))
      .map((item) => ({ reference: item.reference, details: results[item.reference] ?? "missing_result" }));
    return res.json({
      ok: created.length > 0 && failures.length === 0,
      ...(failures.length ? { error: "some_orders_failed" } : {}),
      result: result.body,
      created: created.map((item) => item.tracking),
      failures,
    });
  } catch (e) { return error(res, e); }
});
router.put("/expediteur/ecotrack/update/order", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req);
    const changes = compact(req.body, updateFields);
    const id = tracking(changes.tracking);
    if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
    const result = await ecotrackRequest(token, "/api/v1/update/order", { method: "POST", body: changes });
    await patchCachedOrder(expediteurId, id, changes);
    return res.json({ ok: true, result: result.body });
  } catch (e) { return error(res, e); }
});
router.delete("/expediteur/ecotrack/order", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req);
    const id = tracking(req.body?.tracking ?? req.query.tracking);
    if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
    const result = await ecotrackRequest(token, "/api/v1/delete/order", { method: "DELETE", params: { tracking: id } });
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM expediteur_ecotrack_order_cache WHERE expediteur_id=? AND tracking=?", [expediteurId, id]);
    } finally { conn.release(); }
    return res.json({ ok: true, result: result.body });
  } catch (e) { return error(res, e); }
});
router.post("/expediteur/ecotrack/validate", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req);
    const payload = compact(req.body, ["tracking", "ask_collection"]);
    const id = tracking(payload.tracking);
    if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
    const result = await ecotrackRequest(token, "/api/v1/valid/order", { method: "POST", body: payload });
    await refreshCachedOrder(expediteurId, token, id);
    return res.json({ ok: true, result: result.body });
  } catch (e) { return error(res, e); }
});
router.post("/expediteur/ecotrack/note", (req: AuthedRequest, res) => mutation(req, res, "/api/v1/add/maj", "POST", compact(req.body, ["tracking", "content"])));
router.post("/expediteur/ecotrack/return-request", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId, token } = await upstream(req);
    const payload = compact(req.body, ["tracking"]);
    const id = tracking(payload.tracking);
    if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
    const result = await ecotrackRequest(token, "/api/v1/ask/for/order/return", { method: "POST", body: payload });
    await refreshCachedOrder(expediteurId, token, id);
    return res.json({ ok: true, result: result.body });
  } catch (e) { return error(res, e); }
});

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