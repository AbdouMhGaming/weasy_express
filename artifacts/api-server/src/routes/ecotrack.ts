import { Router } from "express";
import multer from "multer";
import { createRequire } from "node:module";
import { pool } from "@workspace/db";
import { adminAuth, hasTeamPermission, suiviAuth, type AuthedRequest } from "../lib/adminAuth";
import { recordRemark } from "../lib/ecotrackEvents";
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
const productUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

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
    try {
      return { expediteurId: account.id as number, token: ecotrackToken(row.token_ciphertext, row.token_iv, row.token_auth_tag) };
    } catch {
      throw new EcotrackError("Ecotrack credential must be reconnected", 409, null, true);
    }
  } finally { conn.release(); }
}
function tracking(value: unknown) {
  const result = String(value ?? "").trim();
  return result.length > 0 && result.length <= 255 ? result : null;
}
function parsedOrder(value: unknown): Record<string, any> {
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) return value as Record<string, any>;
  const raw = Buffer.isBuffer(value) ? value.toString("utf8") : String(value ?? "");
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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
function analyticsDate(value: unknown) {
  const raw = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}
function normalizedStatus(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/g, "_");
}
function statusCategory(value: unknown) {
  const status = normalizedStatus(value);
  if (status.includes("retour") || status.includes("return")) return "returned";
  if (status.includes("annul") || status.includes("cancel")) return "cancelled";
  if (status.includes("echec") || status.includes("failed") || status.includes("refus")) return "failed";
  if (
    status === "delivered" || status.includes("livre") || status.includes("livred") ||
    status.includes("encaisse") || status.includes("paye") || status.includes("paiement")
  ) return "delivered";
  if (
    status.includes("ramassage") || status.includes("hub") || status.includes("wilaya") ||
    status.includes("livraison") || status.includes("transit") || status.includes("picked") ||
    status.includes("carrier") || status.includes("driver")
  ) return "inTransit";
  return "pending";
}
function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : 100;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
const createFields = ["reference", "nom_client", "telephone", "telephone_2", "adresse", "code_postal", "commune", "code_wilaya", "montant", "remarque", "produit", "stock", "quantite", "produit_a_recuperer", "boutique", "type", "stop_desk", "weight", "fragile", "gps_link"];
const updateFields = ["tracking", "reference", "client", "tel", "tel2", "adresse", "code_postal", "commune", "wilaya", "montant", "remarque", "product", "boutique", "type", "stop_desk", "weight", "fragile", "gps_link"];

async function upstream(req: AuthedRequest) { return credentials(req); }

router.use("/expediteur/ecotrack", adminAuth);
router.use("/admin/ecotrack", adminAuth);
router.use("/suivi/ecotrack", suiviAuth);

const wilayaExpression = `CAST(COALESCE(
  JSON_UNQUOTE(JSON_EXTRACT(c.raw_order, '$.wilaya_id')),
  JSON_UNQUOTE(JSON_EXTRACT(c.raw_order, '$.code_wilaya'))
) AS UNSIGNED)`;

router.get("/expediteur/ecotrack/reports", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId } = await credentials(req);
    const from = analyticsDate(req.query.from), to = analyticsDate(req.query.to);
    const wilaya = Math.max(0, Math.min(58, Number(req.query.wilaya) || 0));
    const where = ["c.expediteur_id=?"];
    const params: any[] = [expediteurId];
    if (from) { where.push("DATE(COALESCE(c.created_at_remote,c.fetched_at))>=?"); params.push(from); }
    if (to) { where.push("DATE(COALESCE(c.created_at_remote,c.fetched_at))<=?"); params.push(to); }
    if (wilaya) { where.push(`${wilayaExpression}=?`); params.push(wilaya); }
    const status = "LOWER(COALESCE(c.status_value,''))";
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT ${wilayaExpression} wilayaId,
          COUNT(*) total,
          SUM(${status} IN ('en_ramassage','vers_station','vers_hub','en_station','en_hub','vers_wilaya','en_preparation','stock_en_preparation')) inTransit,
          SUM(${status}='en_livraison') inDelivery,
          SUM(${status} IN ('suspendu','suspendus')) suspended,
          SUM(${status} IN ('retour_en_traitement','retour_en_transit','retour_recu','retour_en_stock','return_received')) returnsProcessing,
          SUM(${status} IN (
            'livre_non_encaisse','livré_non_encaissé','livred','delivered',
            'encaisse_non_paye','encaissé_non_payé','encaissed','collected',
            'paiements_prets','paiement_pret','paiement_prêt','paiements_prêts',
            'paiement_archive','paiement_archivé','payed','paid'
          )) delivered,
          SUM(${status} LIKE '%retour%' OR ${status} LIKE '%return%') returns
         FROM expediteur_ecotrack_order_cache c
         WHERE ${where.join(" AND ")}
         GROUP BY ${wilayaExpression} ORDER BY wilayaId`,
        params,
      ) as any;
      return res.json({ ok: true, rows: rows.map((row: any) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, Number(value) || 0]))) });
    } finally { conn.release(); }
  } catch (e) { return error(res, e); }
});

router.get("/expediteur/ecotrack/delays", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId } = await credentials(req);
    const requestedStatus = normalizedStatus(req.query.status);
    const wilaya = Math.max(0, Math.min(58, Number(req.query.wilaya) || 0));
    const search = String(req.query.search ?? "").trim().slice(0, 255);
    const delayStatusCondition = "(c.status_value IN ('vers_wilaya','en_livraison','suspendu','suspendus') OR c.status_value LIKE 'retour\\_%' OR c.status_value LIKE 'return\\_%')";
    const where = ["c.expediteur_id=?", delayStatusCondition];
    const params: any[] = [expediteurId];
    if (requestedStatus === "vers_wilaya" || requestedStatus === "en_livraison") {
      where.push("c.status_value=?");
      params.push(requestedStatus);
    } else if (requestedStatus === "suspendu") {
      where.push("c.status_value IN ('suspendu','suspendus')");
    } else if (requestedStatus === "retour") {
      where.push("(c.status_value LIKE 'retour\\_%' OR c.status_value LIKE 'return\\_%')");
    }
    if (wilaya) { where.push(`${wilayaExpression}=?`); params.push(wilaya); }
    if (search) { where.push("(c.tracking LIKE ? OR c.client_name LIKE ? OR c.phone LIKE ?)"); params.push(...Array(3).fill(`%${search}%`)); }
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT c.raw_order, c.tracking, c.client_name, c.status_value status, ${wilayaExpression} wilayaId,
          COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at) enteredAt,
          TIMESTAMPDIFF(HOUR,COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at),NOW()) elapsedHours,
          CASE
            WHEN c.status_value='vers_wilaya' THEN t.vers_wilaya_hours
            WHEN c.status_value='en_livraison' THEN t.en_livraison_hours
            WHEN c.status_value IN ('suspendu','suspendus') THEN t.suspendu_hours
            ELSE t.retour_hours
          END thresholdHours
         FROM expediteur_ecotrack_order_cache c
         JOIN ecotrack_delay_thresholds t ON t.wilaya_id=${wilayaExpression}
         LEFT JOIN (
           SELECT expediteur_id,tracking,status_value,MAX(occurred_at) entered_at
           FROM expediteur_ecotrack_status_history GROUP BY expediteur_id,tracking,status_value
         ) h ON h.expediteur_id=c.expediteur_id AND h.tracking=c.tracking AND h.status_value=c.status_value
         WHERE ${where.join(" AND ")}
         HAVING elapsedHours > thresholdHours
         ORDER BY elapsedHours DESC`,
        params,
      ) as any;
      return res.json({ ok: true, orders: rows.map((row: any) => ({ ...parsedOrder(row.raw_order), tracking: row.tracking, client: row.client_name, status: row.status, wilayaId: Number(row.wilayaId), enteredAt: row.enteredAt, elapsedHours: Number(row.elapsedHours), thresholdHours: Number(row.thresholdHours) })) });
    } finally { conn.release(); }
  } catch (e) { return error(res, e); }
});

/** Cross-expediteur operational delay list for superadmin and suivi readers. */
async function allDelayedOrders(req: AuthedRequest, res: any) {
  if (req.adminRole !== "admin" && req.adminRole !== "suivi" && !hasTeamPermission(req, "ecotrack")) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const requestedStatus = normalizedStatus(req.query.status);
  const wilaya = Math.max(0, Math.min(58, Number(req.query.wilaya) || 0));
  const search = String(req.query.search ?? "").trim().slice(0, 255);
  const owner = String(req.query.expediteur ?? req.query.owner ?? "").trim().slice(0, 100);
  const where = ["c.status_value IN ('vers_wilaya','en_livraison','suspendu','suspendus') OR c.status_value LIKE 'retour\\_%' OR c.status_value LIKE 'return\\_%'"];
  const params: any[] = [];
  const filters: string[] = [`(${where[0]})`];
  if (requestedStatus === "vers_wilaya" || requestedStatus === "en_livraison") { filters.push("c.status_value=?"); params.push(requestedStatus); }
  else if (requestedStatus === "suspendu") { filters.push("c.status_value IN ('suspendu','suspendus')"); }
  else if (requestedStatus === "retour") { filters.push("(c.status_value LIKE 'retour\\_%' OR c.status_value LIKE 'return\\_%')"); }
  if (wilaya) { filters.push(`${wilayaExpression}=?`); params.push(wilaya); }
  if (owner) { filters.push("a.username=?"); params.push(owner); }
  if (search) { filters.push("(c.tracking LIKE ? OR c.client_name LIKE ? OR c.phone LIKE ? OR a.username LIKE ?)"); params.push(...Array(4).fill(`%${search}%`)); }
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
        `SELECT c.raw_order,c.expediteur_id expediteurId,c.tracking,c.client_name,c.status_value status,a.username expediteur,
        ${wilayaExpression} wilayaId,COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at) enteredAt,
        TIMESTAMPDIFF(HOUR,COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at),NOW()) elapsedHours,
        CASE WHEN c.status_value='vers_wilaya' THEN t.vers_wilaya_hours
          WHEN c.status_value='en_livraison' THEN t.en_livraison_hours
          WHEN c.status_value IN ('suspendu','suspendus') THEN t.suspendu_hours ELSE t.retour_hours END thresholdHours
       FROM expediteur_ecotrack_order_cache c
       JOIN admins a ON a.id=c.expediteur_id AND a.role='expediteur'
       JOIN ecotrack_delay_thresholds t ON t.wilaya_id=${wilayaExpression}
       LEFT JOIN (SELECT expediteur_id,tracking,status_value,MAX(occurred_at) entered_at
         FROM expediteur_ecotrack_status_history GROUP BY expediteur_id,tracking,status_value) h
         ON h.expediteur_id=c.expediteur_id AND h.tracking=c.tracking AND h.status_value=c.status_value
       WHERE ${filters.join(" AND ")} HAVING elapsedHours > thresholdHours ORDER BY elapsedHours DESC`,
      params,
    ) as any;
    return res.json({ ok: true, orders: rows.map((row: any) => ({
      ...parsedOrder(row.raw_order), tracking: row.tracking, client: row.client_name, status: row.status,
      expediteurId: Number(row.expediteurId), expediteur: row.expediteur, wilayaId: Number(row.wilayaId), enteredAt: row.enteredAt,
      elapsedHours: Number(row.elapsedHours), thresholdHours: Number(row.thresholdHours),
    })) });
  } catch (e) { return error(res, e); } finally { conn.release(); }
}
router.get("/admin/ecotrack/delays", allDelayedOrders);
router.get("/suivi/ecotrack/delays", allDelayedOrders);

router.get("/suivi/ecotrack/failures", async (req: AuthedRequest, res: any) => {
  const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
  const pageSize = Math.max(1, Math.min(100, Number(req.query.pageSize) || 50));
  const search = String(req.query.search ?? "").trim().slice(0, 255);
  const wilaya = Math.max(0, Math.min(58, Number(req.query.wilaya) || 0));
  const conn = await pool.getConnection();
  try {
    const params: any[] = [];
    // Delivery failures is the follow-up queue: include every cached order
    // with at least one Ecotrack remark, regardless of its current status.
    // The two tracking columns were created with incompatible collations, so
    // use a binary comparison rather than letting MySQL aggregate collations.
    const where = [
      `EXISTS (
        SELECT 1 FROM expediteur_ecotrack_remarks r
        WHERE r.expediteur_id=c.expediteur_id AND BINARY r.tracking=BINARY c.tracking
      )`,
    ];
    if (search) { where.push("(c.tracking LIKE ? OR c.client_name LIKE ? OR a.username LIKE ?)"); params.push(...Array(3).fill(`%${search}%`)); }
    if (wilaya) { where.push(`${wilayaExpression}=?`); params.push(wilaya); }
    const [[count]] = await conn.execute(
      `SELECT COUNT(*) total FROM expediteur_ecotrack_order_cache c JOIN admins a ON a.id=c.expediteur_id AND a.role='expediteur' WHERE ${where.join(" AND ")}`,
      params,
    ) as any;
    const [rows] = await conn.execute(
       `SELECT c.raw_order,c.expediteur_id expediteurId,c.tracking,c.status_value status,
               c.client_name,c.phone,c.last_updated_at_remote updatedAt,c.created_at_remote createdAt,
               a.username expediteur
       FROM expediteur_ecotrack_order_cache c JOIN admins a ON a.id=c.expediteur_id AND a.role='expediteur'
       WHERE ${where.join(" AND ")} ORDER BY c.last_updated_at_remote DESC,c.fetched_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, (page - 1) * pageSize],
    ) as any;
    const total = Number(count?.total ?? 0);
     return res.json({ ok: true, orders: rows.map((row: any) => {
       const parsed = parsedOrder(row.raw_order);
       const destination = parsed.destination ?? parsed.destination_wilaya ?? parsed.wilaya_id ?? parsed.wilaya
         ?? parsed.wilaya_destination ?? parsed.dest_wilaya ?? parsed.destinationWilaya;
       return {
         ...parsed, tracking: row.tracking, status: row.status,
         client: row.client_name ?? parsed.client ?? parsed.nom_client,
         phone: row.phone ?? parsed.phone ?? parsed.telephone,
         destination, wilaya: destination,
         expediteurId: Number(row.expediteurId), expediteur: row.expediteur,
         updatedAt: row.updatedAt ?? row.createdAt,
       };
     }), pagination: { current_page: page, per_page: pageSize, total, last_page: Math.max(1, Math.ceil(total / pageSize)) } });
  } catch (e) { return error(res, e); } finally { conn.release(); }
});

router.get("/admin/ecotrack/delay-thresholds", async (req: AuthedRequest, res) => {
  if (req.adminRole !== "admin") return res.status(403).json({ ok: false, error: "forbidden" });
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT t.wilaya_id wilayaId,t.vers_wilaya_hours versWilayaHours,t.en_livraison_hours enLivraisonHours,
        t.suspendu_hours suspenduHours,t.retour_hours retourHours,
        SUM(c.status_value='vers_wilaya' AND TIMESTAMPDIFF(HOUR,COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at),NOW())>t.vers_wilaya_hours) versWilayaOverdue,
        SUM(c.status_value='en_livraison' AND TIMESTAMPDIFF(HOUR,COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at),NOW())>t.en_livraison_hours) enLivraisonOverdue,
        SUM(c.status_value IN ('suspendu','suspendus') AND TIMESTAMPDIFF(HOUR,COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at),NOW())>t.suspendu_hours) suspenduOverdue,
        SUM((c.status_value LIKE 'retour\\_%' OR c.status_value LIKE 'return\\_%') AND TIMESTAMPDIFF(HOUR,COALESCE(h.entered_at,c.last_updated_at_remote,c.created_at_remote,c.fetched_at),NOW())>t.retour_hours) retourOverdue
       FROM ecotrack_delay_thresholds t
       LEFT JOIN expediteur_ecotrack_order_cache c ON ${wilayaExpression}=t.wilaya_id
         AND (c.status_value IN ('vers_wilaya','en_livraison','suspendu','suspendus') OR c.status_value LIKE 'retour\\_%' OR c.status_value LIKE 'return\\_%')
       LEFT JOIN (
         SELECT expediteur_id,tracking,status_value,MAX(occurred_at) entered_at
         FROM expediteur_ecotrack_status_history GROUP BY expediteur_id,tracking,status_value
       ) h ON h.expediteur_id=c.expediteur_id AND h.tracking=c.tracking AND h.status_value=c.status_value
       GROUP BY t.wilaya_id,t.vers_wilaya_hours,t.en_livraison_hours,t.suspendu_hours,t.retour_hours ORDER BY t.wilaya_id`,
    ) as any;
    return res.json({ ok: true, rows });
  } finally { conn.release(); }
});

router.put("/admin/ecotrack/delay-thresholds", async (req: AuthedRequest, res) => {
  if (req.adminRole !== "admin") return res.status(403).json({ ok: false, error: "forbidden" });
  const rows = Array.isArray(req.body?.rows) ? req.body.rows.slice(0, 58) : [];
  const valid = rows.map((row: any) => ({
    wilayaId: Math.floor(Number(row.wilayaId)),
    vers: Math.floor(Number(row.versWilayaHours)),
    delivery: Math.floor(Number(row.enLivraisonHours)),
    suspended: Math.floor(Number(row.suspenduHours)),
    returns: Math.floor(Number(row.retourHours)),
  })).filter((row: any) => row.wilayaId >= 1 && row.wilayaId <= 58
    && row.vers >= 1 && row.vers <= 8760
    && row.delivery >= 1 && row.delivery <= 8760
    && row.suspended >= 1 && row.suspended <= 8760
    && row.returns >= 1 && row.returns <= 8760);
  if (!valid.length) return res.status(400).json({ ok: false, error: "invalid_thresholds" });
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO ecotrack_delay_thresholds (wilaya_id,vers_wilaya_hours,en_livraison_hours,suspendu_hours,retour_hours)
       VALUES ${valid.map(() => "(?,?,?,?,?)").join(",")}
       ON DUPLICATE KEY UPDATE vers_wilaya_hours=VALUES(vers_wilaya_hours),en_livraison_hours=VALUES(en_livraison_hours),
         suspendu_hours=VALUES(suspendu_hours),retour_hours=VALUES(retour_hours)`,
      valid.flatMap((row: any) => [row.wilayaId, row.vers, row.delivery, row.suspended, row.returns]),
    );
    return res.json({ ok: true });
  } finally { conn.release(); }
});

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
      const [[state]] = await conn.execute("SELECT next_page, last_page, last_synced_at, blocked_until, last_error, last_error_at FROM expediteur_ecotrack_sync_state WHERE expediteur_id=?", [expediteurId]) as any;
      const sync = state
        ? {
            ...state,
            complete: state.last_page !== null && Number(state.next_page) === 1 && Boolean(state.last_synced_at),
          }
        : { next_page: 1, last_page: null, last_synced_at: null, blocked_until: null, complete: false };
      return res.json({ ok: true, totals: { orders: Number(total.total), montant: Number(total.amount), tarifPrestation: Number(total.prestationFees), tarifRetour: Number(total.returnFees) }, statuses, recentOrders: recent.map((r: any) => parsedOrder(r.raw_order)), sync });
    } finally { conn.release(); }
  } catch (e) { return error(res, e); }
});

router.get("/expediteur/ecotrack/analytics", async (req: AuthedRequest, res) => {
  try {
    const { expediteurId } = await credentials(req);
    const from = analyticsDate(req.query.from);
    const to = analyticsDate(req.query.to);
    const wilaya = String(req.query.wilaya ?? "").trim().slice(0, 16);
    const status = String(req.query.status ?? "").trim().slice(0, 255);
    const dateExpression = "DATE(COALESCE(created_at_remote, fetched_at))";
    const wilayaExpression = `COALESCE(
      JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.wilaya_id')),
      JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.code_wilaya'))
    )`;
    const where = ["expediteur_id=?"];
    const params: any[] = [expediteurId];
    if (from) { where.push(`${dateExpression} >= ?`); params.push(from); }
    if (to) { where.push(`${dateExpression} <= ?`); params.push(to); }
    if (wilaya) { where.push(`${wilayaExpression} = ?`); params.push(wilaya.replace(/^DZ/i, "").replace(/^0+/, "") || "0"); }
    if (status) { where.push("status_value=?"); params.push(status); }
    const whereSql = where.join(" AND ");

    let previousWhereSql: string | null = null;
    let previousParams: any[] = [];
    if (from && to) {
      const start = new Date(`${from}T00:00:00Z`);
      const end = new Date(`${to}T00:00:00Z`);
      if (start <= end) {
        const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
        const previousEnd = new Date(start.getTime() - 86_400_000);
        const previousStart = new Date(previousEnd.getTime() - (days - 1) * 86_400_000);
        const previousWhere = ["expediteur_id=?", `${dateExpression} >= ?`, `${dateExpression} <= ?`];
        previousParams = [
          expediteurId,
          previousStart.toISOString().slice(0, 10),
          previousEnd.toISOString().slice(0, 10),
        ];
        if (wilaya) { previousWhere.push(`${wilayaExpression} = ?`); previousParams.push(wilaya.replace(/^DZ/i, "").replace(/^0+/, "") || "0"); }
        if (status) { previousWhere.push("status_value=?"); previousParams.push(status); }
        previousWhereSql = previousWhere.join(" AND ");
      }
    }

    const summarySelect = `COUNT(*) orders, COALESCE(SUM(montant),0) amount,
      COALESCE(AVG(montant),0) averageAmount, COALESCE(SUM(tarif_prestation),0) serviceFees,
      COALESCE(SUM(tarif_retour),0) returnFees`;
    const conn = await pool.getConnection();
    try {
      const [[summary]] = await conn.execute(
        `SELECT ${summarySelect} FROM expediteur_ecotrack_order_cache WHERE ${whereSql}`,
        params,
      ) as any;
      const [statusRows] = await conn.execute(
        `SELECT status_value status, COUNT(*) count, COALESCE(SUM(montant),0) amount
         FROM expediteur_ecotrack_order_cache WHERE ${whereSql}
         GROUP BY status_value ORDER BY count DESC`,
        params,
      ) as any;
      const [trendRows] = await conn.execute(
        `SELECT ${dateExpression} date, status_value status, COUNT(*) count,
          COALESCE(SUM(montant),0) amount, COALESCE(SUM(tarif_prestation),0) fees
         FROM expediteur_ecotrack_order_cache WHERE ${whereSql}
         GROUP BY ${dateExpression}, status_value ORDER BY date ASC`,
        params,
      ) as any;
      const [wilayaRows] = await conn.execute(
        `SELECT ${wilayaExpression} wilayaId, status_value status, COUNT(*) count,
          COALESCE(SUM(montant),0) amount
         FROM expediteur_ecotrack_order_cache WHERE ${whereSql}
         GROUP BY ${wilayaExpression}, status_value`,
        params,
      ) as any;
      const [dimensionRows] = await conn.execute(
        `SELECT
          COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.type_id')), JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.type')), 'unknown') orderType,
          COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.stop_desk')), '0') stopDesk,
          COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.products')), JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.product')), JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.produit')), '') product,
          COUNT(*) count, COALESCE(SUM(montant),0) amount
         FROM expediteur_ecotrack_order_cache WHERE ${whereSql}
         GROUP BY orderType, stopDesk, product`,
        params,
      ) as any;
      const [recentRows] = await conn.execute(
        `SELECT raw_order FROM expediteur_ecotrack_order_cache WHERE ${whereSql}
         ORDER BY COALESCE(last_updated_at_remote, created_at_remote, fetched_at) DESC LIMIT 8`,
        params,
      ) as any;

      let previous: any = { orders: 0, amount: 0, averageAmount: 0, serviceFees: 0, returnFees: 0 };
      if (previousWhereSql) {
        const [[row]] = await conn.execute(
          `SELECT ${summarySelect} FROM expediteur_ecotrack_order_cache WHERE ${previousWhereSql}`,
          previousParams,
        ) as any;
        previous = row;
      }

      const outcomes = { delivered: 0, returned: 0, cancelled: 0, failed: 0, inTransit: 0, pending: 0 };
      for (const row of statusRows as any[]) outcomes[statusCategory(row.status) as keyof typeof outcomes] += Number(row.count);
      const trendMap = new Map<string, any>();
      for (const row of trendRows as any[]) {
        const date = row.date instanceof Date
          ? row.date.toISOString().slice(0, 10)
          : String(row.date ?? "").slice(0, 10);
        const point = trendMap.get(date) ?? { date, orders: 0, amount: 0, fees: 0, delivered: 0, returned: 0 };
        point.orders += Number(row.count);
        point.amount += Number(row.amount);
        point.fees += Number(row.fees);
        const category = statusCategory(row.status);
        if (category === "delivered") point.delivered += Number(row.count);
        if (category === "returned") point.returned += Number(row.count);
        trendMap.set(date, point);
      }
      const wilayaMap = new Map<string, any>();
      for (const row of wilayaRows as any[]) {
        const id = String(row.wilayaId ?? "").replace(/^0+/, "");
        if (!id) continue;
        const point = wilayaMap.get(id) ?? { wilayaId: id, total: 0, delivered: 0, returned: 0, amount: 0 };
        point.total += Number(row.count);
        point.amount += Number(row.amount);
        const category = statusCategory(row.status);
        if (category === "delivered") point.delivered += Number(row.count);
        if (category === "returned") point.returned += Number(row.count);
        wilayaMap.set(id, point);
      }
      const orderTypes = new Map<string, number>();
      const deliveryModes = { home: 0, stopDesk: 0 };
      const products = new Map<string, { name: string; count: number; amount: number }>();
      for (const row of dimensionRows as any[]) {
        orderTypes.set(String(row.orderType), (orderTypes.get(String(row.orderType)) ?? 0) + Number(row.count));
        deliveryModes[String(row.stopDesk) === "1" ? "stopDesk" : "home"] += Number(row.count);
        const product = String(row.product ?? "").trim();
        if (product) {
          const current = products.get(product) ?? { name: product, count: 0, amount: 0 };
          current.count += Number(row.count);
          current.amount += Number(row.amount);
          products.set(product, current);
        }
      }

      const orders = Number(summary.orders);
      const delivered = outcomes.delivered;
      const amount = Number(summary.amount);
      const serviceFees = Number(summary.serviceFees);
      const returnFees = Number(summary.returnFees);
      return res.json({
        ok: true,
        filters: { from, to, wilaya: wilaya || null, status: status || null },
        summary: {
          orders,
          amount,
          averageAmount: Number(summary.averageAmount),
          serviceFees,
          returnFees,
          netAmount: amount - serviceFees - returnFees,
          successRate: orders ? Math.round((delivered / orders) * 1000) / 10 : 0,
          returnRate: orders ? Math.round((outcomes.returned / orders) * 1000) / 10 : 0,
        },
        comparison: previousWhereSql ? {
          orders: percentChange(orders, Number(previous.orders)),
          amount: percentChange(amount, Number(previous.amount)),
          averageAmount: percentChange(Number(summary.averageAmount), Number(previous.averageAmount)),
          serviceFees: percentChange(serviceFees, Number(previous.serviceFees)),
        } : { orders: null, amount: null, averageAmount: null, serviceFees: null },
        outcomes,
        statuses: statusRows.map((row: any) => ({ status: row.status, count: Number(row.count), amount: Number(row.amount) })),
        trend: [...trendMap.values()],
        byWilaya: [...wilayaMap.values()]
          .map((item) => ({
            ...item,
            successRate: item.total ? Math.round((item.delivered / item.total) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.total - a.total),
        orderTypes: [...orderTypes].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
        deliveryModes,
        products: [...products.values()].sort((a, b) => b.count - a.count),
        recentOrders: recentRows.map((row: any) => parsedOrder(row.raw_order)),
      });
    } finally {
      conn.release();
    }
  } catch (e) {
    return error(res, e);
  }
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
    const from = analyticsDate(req.query.from), to = analyticsDate(req.query.to);
    const wilaya = String(req.query.wilaya ?? "").trim().slice(0, 16);
    const commune = String(req.query.commune ?? "").trim().slice(0, 255);
    const type = String(req.query.type ?? "").trim().slice(0, 16);
    const fragile = String(req.query.fragile ?? "").trim();
    const stopDesk = String(req.query.stop_desk ?? "").trim();
    const sort = String(req.query.sort ?? "updated_desc");
    const orderBy = ({
      created_desc: "COALESCE(created_at_remote, fetched_at) DESC, fetched_at DESC",
      created_asc: "COALESCE(created_at_remote, fetched_at) ASC, fetched_at ASC",
      updated_desc: "COALESCE(last_updated_at_remote, created_at_remote, fetched_at) DESC, fetched_at DESC",
      updated_asc: "COALESCE(last_updated_at_remote, created_at_remote, fetched_at) ASC, fetched_at ASC",
      amount_desc: "montant DESC, COALESCE(last_updated_at_remote, created_at_remote, fetched_at) DESC",
      amount_asc: "montant ASC, COALESCE(last_updated_at_remote, created_at_remote, fetched_at) DESC",
    } as Record<string, string>)[sort] ?? "COALESCE(last_updated_at_remote, created_at_remote, fetched_at) DESC, fetched_at DESC";
    const conn = await pool.getConnection(); try {
      const where = ["expediteur_id=?"]; const params: any[] = [expediteurId];
      if (status) {
        const aliases: Record<string, string[]> = {
          prete_a_expedier: ["prete_a_expedier", "pret_a_expedier"],
          vers_station: ["vers_station", "vers_hub"],
          en_station: ["en_station", "en_hub"],
          en_preparation: ["en_preparation", "stock_en_preparation"],
          suspendu: ["suspendu", "suspendus"],
          livre_non_encaisse: ["livre_non_encaisse", "livré_non_encaissé"],
          encaisse_non_paye: ["encaisse_non_paye", "encaissé_non_payé"],
          paiements_prets: ["paiements_prets", "paiement_pret", "paiement_prêt", "paiements_prêts"],
          retour_en_traitement: ["retour_en_traitement", "retour_en_transit"],
          retour_recu: ["retour_recu", "return_received", "retour_en_stock"],
        };
        const values = aliases[status] ?? [status];
        where.push(`status_value IN (${values.map(() => "?").join(",")})`);
        params.push(...values);
      }
      if (search) { where.push("(tracking LIKE ? OR reference_value LIKE ? OR client_name LIKE ? OR phone LIKE ?)"); params.push(...Array(4).fill(`%${search}%`)); }
      if (from) { where.push("DATE(COALESCE(created_at_remote, fetched_at)) >= ?"); params.push(from); }
      if (to) { where.push("DATE(COALESCE(created_at_remote, fetched_at)) <= ?"); params.push(to); }
      if (wilaya) {
        where.push("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.wilaya_id')), JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.code_wilaya'))) = ?");
        params.push(wilaya.replace(/^DZ/i, "").replace(/^0+/, "") || "0");
      }
      if (commune) {
        where.push(`(
          JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.commune_id')) = ?
          OR LOWER(COALESCE(
            JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.commune_name')),
            JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.commune'))
          )) = LOWER(?)
        )`);
        params.push(commune);
        params.push(commune);
      }
      if (type) {
        where.push("COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.type_id')), JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.type'))) = ?");
        params.push(type);
      }
      if (fragile === "yes" || fragile === "no") {
        where.push(`LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.fragile')), '0')) IN (${fragile === "yes" ? "'1','true'" : "'0','false'"})`);
      }
      if (stopDesk === "yes" || stopDesk === "no") {
        where.push(`LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(raw_order, '$.stop_desk')), '0')) IN (${stopDesk === "yes" ? "'1','true'" : "'0','false'"})`);
      }
      const [[count]] = await conn.execute(`SELECT COUNT(*) total FROM expediteur_ecotrack_order_cache WHERE ${where.join(" AND ")}`, params) as any;
      const [rows] = await conn.execute(`SELECT raw_order, status_value FROM expediteur_ecotrack_order_cache WHERE ${where.join(" AND ")}
        ORDER BY ${orderBy} LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (page - 1) * PAGE_SIZE]) as any;
      const total = Number(count.total); return res.json({
        ok: true,
        data: rows.map((r: any) => ({ ...parsedOrder(r.raw_order), status: r.status_value })),
        pagination: { current_page: page, per_page: PAGE_SIZE, total, last_page: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
        source: "cache",
      });
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
function createdTracking(body: any, depth = 0): string | null {
  if (depth > 5 || body === undefined || body === null) return null;
  if (typeof body === "string" || typeof body === "number") return tracking(body);
  if (typeof body !== "object") return null;

  for (const key of ["tracking", "tracking_number", "trackingNumber"]) {
    const value = body[key];
    if (typeof value === "string" || typeof value === "number") {
      const id = tracking(value);
      if (id) return id;
    }
  }
  for (const key of ["data", "order", "result", "parcel", "colis"]) {
    const id = createdTracking(body[key], depth + 1);
    if (id) return id;
  }
  return null;
}
function bulkResults(body: any) {
  const candidates = [
    body?.results,
    body?.data?.results,
    body?.result?.results,
    body?.data,
    body?.result,
  ];
  return candidates.find((value) => value && typeof value === "object") ?? {};
}
function bulkResultFor(results: any, item: any, index: number) {
  if (Array.isArray(results)) return results[index];
  const reference = String(item.reference ?? "");
  if (Object.prototype.hasOwnProperty.call(results, reference)) return results[reference];
  if (Object.prototype.hasOwnProperty.call(results, String(index))) return results[String(index)];

  const lowerReference = reference.toLocaleLowerCase();
  const matchingKey = Object.keys(results).find((key) => key.toLocaleLowerCase() === lowerReference);
  if (matchingKey !== undefined) return results[matchingKey];

  return Object.values(results).find((value: any) =>
    String(value?.reference ?? value?.order?.reference ?? "").toLocaleLowerCase() === lowerReference
  );
}
function normalizedPhone(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits.startsWith("213") && digits.length === 12 ? `0${digits.slice(3)}` : digits;
}
function normalizedCreateOrder(item: any) {
  const order = compact(item, createFields);
  if (order.telephone !== undefined) order.telephone = normalizedPhone(order.telephone);
  if (order.telephone_2 !== undefined) order.telephone_2 = normalizedPhone(order.telephone_2);
  return order;
}
function cachedCreatedOrder(item: any, id: string) {
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
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
    created_at: now,
    last_updated_at: now,
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
    const current = parsedOrder(row.raw_order);
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
    const item = normalizedCreateOrder(req.body);
    if (!item.reference) item.reference = `WEASY-${Date.now()}-1`;
    const result = await ecotrackRequest(token, "/api/v1/create/order", { method: "POST", body: item });
    const id = createdTracking(result.body);
    if (id) await cacheOrders(expediteurId, [cachedCreatedOrder(item, id)]);
    return res.json({ ok: true, result: result.body, tracking: id });
  } catch (e) { return error(res, e); }
});
router.post("/expediteur/ecotrack/create/orders", async (req: AuthedRequest, res) => {
  const items: any[] = Array.isArray(req.body?.orders) ? req.body.orders : Object.values(req.body?.orders ?? {});
  if (!items.length || items.length > 100) return res.status(400).json({ ok: false, error: "orders_must_contain_1_to_100_items" });
  try {
    const { expediteurId, token } = await upstream(req);
    const usedReferences = new Set<string>();
    const submitted: any[] = items.map((item: any, index: number) => {
      const order = normalizedCreateOrder(item);
      const original = String(order.reference ?? "").trim();
      let reference = original || `WEASY-${Date.now()}-${index + 1}`;
      let suffix = 2;
      while (usedReferences.has(reference.toLocaleLowerCase())) reference = `${original || reference}-${suffix++}`;
      usedReferences.add(reference.toLocaleLowerCase());
      return { ...order, reference };
    });
    const result = await ecotrackRequest(token, "/api/v1/create/orders", {
      method: "POST",
      body: { orders: Object.fromEntries(submitted.map((item: any, index: number) => [index, item])) },
    });
    const results = bulkResults(result.body);
    const resolved: Array<{ item: any; response: any; index: number; clientId: string }> = submitted.map((item: any, index: number) => ({
      item,
      response: bulkResultFor(results, item, index),
      index,
      clientId: String(items[index]?._client_id ?? ""),
    }));
    const createdItems = resolved.flatMap(({ item, response, index, clientId }) => {
      const id = createdTracking(response);
      return id ? [{ index: index + 1, clientId, reference: item.reference, tracking: id, cached: cachedCreatedOrder(item, id) }] : [];
    });
    const created = createdItems.map((item) => item.cached);
    if (created.length) await cacheOrders(expediteurId, created);
    const failures = resolved
      .filter(({ response }) => !createdTracking(response))
      .map(({ item, response, index, clientId }) => ({
        index: index + 1,
        clientId,
        reference: item.reference,
        details: response ?? "missing_result",
      }));
    return res.json({
      ok: created.length > 0 && failures.length === 0,
      ...(failures.length ? { error: "some_orders_failed" } : {}),
      result: result.body,
      created: created.map((item) => item.tracking),
      createdItems: createdItems.map(({ cached, ...item }) => item),
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
async function addRemark(req: AuthedRequest, res: any, forcedOwnerId?: number) {
  const payload = compact(req.body, ["tracking", "content"]);
  const id = tracking(payload.tracking);
  const content = String(payload.content ?? "").trim().slice(0, 5000);
  if (!id || !content) return res.status(400).json({ ok: false, error: "tracking_and_content_required" });
  try {
    let expediteurId: number;
    let token: string;
    if (!forcedOwnerId && req.adminRole === "suivi") {
      const requestedOwner = Number(req.body?.expediteurId ?? req.body?.ownerId);
      if (!Number.isInteger(requestedOwner) || requestedOwner <= 0) {
        return res.status(400).json({ ok: false, error: "expediteurId_required" });
      }
      const conn = await pool.getConnection();
      try {
        const [[owner]] = await conn.execute(
          `SELECT c.expediteur_id id FROM expediteur_ecotrack_order_cache c
           JOIN admins a ON a.id=c.expediteur_id AND a.role='expediteur'
           WHERE c.expediteur_id=? AND c.tracking=? LIMIT 1`, [requestedOwner, id],
        ) as any;
        forcedOwnerId = owner?.id ? Number(owner.id) : undefined;
      } finally { conn.release(); }
      if (!forcedOwnerId) return res.status(404).json({ ok: false, error: "order_not_found" });
    }
    if (forcedOwnerId) {
      const conn = await pool.getConnection();
      try {
        const [[order]] = await conn.execute(
          "SELECT tracking FROM expediteur_ecotrack_order_cache WHERE expediteur_id=? AND tracking=? LIMIT 1",
          [forcedOwnerId, id],
        ) as any;
        if (!order) return res.status(404).json({ ok: false, error: "order_not_found" });
        const [[credential]] = await conn.execute(
          `SELECT token_ciphertext,token_iv,token_auth_tag FROM expediteur_ecotrack_credentials WHERE expediteur_id=? LIMIT 1`,
          [forcedOwnerId],
        ) as any;
        if (!credential) return res.status(409).json({ ok: false, error: "ecotrack_not_connected" });
        expediteurId = forcedOwnerId;
        token = ecotrackToken(credential.token_ciphertext, credential.token_iv, credential.token_auth_tag);
      } finally { conn.release(); }
    } else {
      const credentialsResult = await upstream(req);
      expediteurId = credentialsResult.expediteurId;
      token = credentialsResult.token;
    }
    // Preserve Ecotrack's existing add/maj contract: this endpoint consumes
    // tracking/content as request parameters, not a JSON body.
    const result = await ecotrackRequest(token, "/api/v1/add/maj", { method: "POST", params: { tracking: id, content } });
    await recordRemark({
      expediteurId, tracking: id, content,
      authorUsername: req.adminUsername ?? "unknown", authorRole: req.adminRole ?? "unknown",
    });
    return res.json({ ok: true, result: result.body });
  } catch (e) { return error(res, e); }
}
router.post("/expediteur/ecotrack/note", (req: AuthedRequest, res) => addRemark(req, res));
router.post("/suivi/ecotrack/note", (req: AuthedRequest, res) => addRemark(req, res));
router.post("/admin/ecotrack/note", (req: AuthedRequest, res) => {
  if (!hasTeamPermission(req, "ecotrack")) return res.status(403).json({ ok: false, error: "forbidden" });
  const owner = Number(req.body?.expediteurId);
  if (!Number.isInteger(owner) || owner <= 0) return res.status(400).json({ ok: false, error: "expediteurId_required" });
  return addRemark(req, res, owner);
});

async function orderHistory(req: AuthedRequest, res: any) {
  if (req.adminRole === "admin_team" && !hasTeamPermission(req, "ecotrack")) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const id = tracking(req.params.tracking);
  if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
  const conn = await pool.getConnection();
  try {
    let ownerId: number | null = null;
    if (req.adminRole === "expediteur") {
      const account = await accountFor(req);
      ownerId = account?.id ?? null;
    } else if (req.adminRole === "admin" || req.adminRole === "admin_team" || req.adminRole === "suivi") {
      const requestedOwner = Number(req.query.expediteurId ?? req.query.ownerId);
      if (!Number.isInteger(requestedOwner) || requestedOwner <= 0) {
        return res.status(400).json({ ok: false, error: "expediteurId_required" });
      }
      const [[owner]] = await conn.execute(
        `SELECT c.expediteur_id id FROM expediteur_ecotrack_order_cache c
         JOIN admins a ON a.id=c.expediteur_id AND a.role='expediteur'
          WHERE c.expediteur_id=? AND c.tracking=? LIMIT 1`, [requestedOwner, id],
      ) as any;
      ownerId = owner?.id ?? null;
    }
    if (!ownerId) return res.status(404).json({ ok: false, error: "order_not_found" });
    const [[row]] = await conn.execute(
      "SELECT raw_order,status_value status,client_name,phone FROM expediteur_ecotrack_order_cache WHERE expediteur_id=? AND tracking=? LIMIT 1",
      [ownerId, id],
    ) as any;
    if (!row) return res.status(404).json({ ok: false, error: "order_not_found" });
    const [remarks] = await conn.execute(
      `SELECT id,tracking,author_username author,author_role role,content,created_at createdAt
       FROM expediteur_ecotrack_remarks WHERE expediteur_id=? AND tracking=? ORDER BY created_at ASC`,
      [ownerId, id],
    ) as any;
    const [statusHistory] = await conn.execute(
      `SELECT status_value status,occurred_at occurredAt FROM expediteur_ecotrack_status_history
       WHERE expediteur_id=? AND tracking=? ORDER BY occurred_at ASC`, [ownerId, id],
    ) as any;
    const order = { ...parsedOrder(row.raw_order), tracking: id, status: row.status, client: row.client_name, phone: row.phone };
    return res.json({ ok: true, tracking: id, ownerId, order, updates: Array.isArray(order.updates) ? order.updates : [], remarks, statusHistory });
  } catch (e) { return error(res, e); } finally { conn.release(); }
}
router.get("/expediteur/ecotrack/orders/:tracking/history", orderHistory);
router.get("/admin/ecotrack/orders/:tracking/history", orderHistory);
router.get("/suivi/ecotrack/orders/:tracking/history", orderHistory);

async function orderRemarks(req: AuthedRequest, res: any) {
  if (req.adminRole === "admin_team" && !hasTeamPermission(req, "ecotrack")) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  const id = tracking(req.params.tracking);
  if (!id) return res.status(400).json({ ok: false, error: "invalid_tracking" });
  try {
    const ownerId = req.adminRole === "expediteur"
      ? (await accountFor(req))?.id
      : Number(req.query.expediteurId);
    if (req.adminRole !== "expediteur" && (!Number.isInteger(ownerId) || ownerId <= 0)) {
      return res.status(400).json({ ok: false, error: "expediteurId_required" });
    }
    if (!ownerId) return res.status(403).json({ ok: false, error: "forbidden" });

    const conn = await pool.getConnection();
    let token: string;
    try {
      const [[row]] = await conn.execute(
        `SELECT k.token_ciphertext,k.token_iv,k.token_auth_tag
         FROM expediteur_ecotrack_order_cache c
         JOIN admins a ON a.id=c.expediteur_id AND a.role='expediteur'
         LEFT JOIN expediteur_ecotrack_credentials k ON k.expediteur_id=c.expediteur_id
         WHERE c.expediteur_id=? AND c.tracking=? LIMIT 1`,
        [ownerId, id],
      ) as any;
      if (!row) return res.status(404).json({ ok: false, error: "order_not_found" });
      if (!row.token_ciphertext) return res.status(409).json({ ok: false, error: "ecotrack_not_connected" });
      token = ecotrackToken(row.token_ciphertext, row.token_iv, row.token_auth_tag);
    } finally { conn.release(); }

    // This is Ecotrack's actual remark history (station, driver, sender), not
    // status transitions or only remarks recorded through this application.
    const response = await ecotrackRequest(token, "/api/v1/get/maj", { params: { tracking: id } });
    const remarks = Array.isArray(response.body) ? response.body
      : Array.isArray(response.body?.data) ? response.body.data : null;
    if (!remarks) throw new EcotrackError("Invalid Ecotrack remark history", 502, null);
    return res.json({ ok: true, remarks });
  } catch (e) { return error(res, e); }
}
router.get("/expediteur/ecotrack/orders/:tracking/remarks", orderRemarks);
router.get("/admin/ecotrack/orders/:tracking/remarks", orderRemarks);
router.get("/suivi/ecotrack/orders/:tracking/remarks", orderRemarks);

async function notificationScope(req: AuthedRequest, conn: any) {
  if (req.adminRole === "admin" || req.adminRole === "suivi") return null;
  if (req.adminRole === "expediteur") {
    const account = await accountFor(req);
    return account?.id ?? -1;
  }
  return -1;
}
function notificationReader(req: AuthedRequest) {
  return { username: req.adminUsername ?? "", audience: req.portalAudience ?? req.adminRole ?? "unknown" };
}
async function listNotifications(req: AuthedRequest, res: any) {
  const conn = await pool.getConnection();
  try {
    const scope = await notificationScope(req, conn);
    const reader = notificationReader(req);
    const where = scope === null ? "" : "WHERE n.expediteur_id=?";
    const params: any[] = scope === null ? [] : [scope];
    const unread = String(req.query.unread ?? "") === "1" || String(req.query.unread ?? "") === "true";
    const finalWhere = unread ? (where ? `${where} AND nr.notification_id IS NULL` : "WHERE nr.notification_id IS NULL") : where;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const [rows] = await conn.execute(
      `SELECT n.id,n.tracking,n.expediteur_id expediteurId,n.event_type eventType,n.title,n.body,n.author_username author,n.author_role role,
        n.created_at createdAt,nr.read_at readAt,a.username expediteur
       FROM expediteur_ecotrack_notifications n
       LEFT JOIN admins a ON a.id=n.expediteur_id
       LEFT JOIN expediteur_ecotrack_notification_reads nr ON nr.notification_id=n.id AND nr.reader_username=? AND nr.reader_audience=?
       ${finalWhere} ORDER BY n.created_at DESC LIMIT ?`,
      [reader.username, reader.audience, ...params, limit],
    ) as any;
    const [[count]] = await conn.execute(
      `SELECT COUNT(*) total FROM expediteur_ecotrack_notifications n
       LEFT JOIN expediteur_ecotrack_notification_reads nr ON nr.notification_id=n.id AND nr.reader_username=? AND nr.reader_audience=?
       ${scope === null ? "WHERE nr.notification_id IS NULL" : "WHERE n.expediteur_id=? AND nr.notification_id IS NULL"}`,
      scope === null ? [reader.username, reader.audience] : [reader.username, reader.audience, scope],
    ) as any;
    return res.json({ ok: true, notifications: rows, unreadCount: Number(count.total) });
  } catch (e) { return error(res, e); } finally { conn.release(); }
}
async function markNotificationRead(req: AuthedRequest, res: any) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ ok: false, error: "invalid_id" });
  const conn = await pool.getConnection();
  try {
    const scope = await notificationScope(req, conn);
    const reader = notificationReader(req);
    const where = scope === null ? "id=?" : "id=? AND expediteur_id=?";
    const params = scope === null ? [id] : [id, scope];
    const [[notification]] = await conn.execute(`SELECT id FROM expediteur_ecotrack_notifications WHERE ${where} LIMIT 1`, params) as any;
    if (!notification) return res.status(404).json({ ok: false, error: "notification_not_found" });
    await conn.execute(
      `INSERT INTO expediteur_ecotrack_notification_reads (notification_id,reader_username,reader_audience)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE read_at=NOW()`,
      [id, reader.username, reader.audience],
    );
    return res.json({ ok: true });
  } catch (e) { return error(res, e); } finally { conn.release(); }
}
async function notificationDetail(req: AuthedRequest, res: any) {
  const id = Number(req.params.id);
  const conn = await pool.getConnection();
  try {
    const scope = await notificationScope(req, conn);
    const reader = notificationReader(req);
    const where = scope === null ? "n.id=?" : "n.id=? AND n.expediteur_id=?";
    const params = scope === null ? [id] : [id, scope];
    const [[notification]] = await conn.execute(
      `SELECT n.*,nr.read_at readerReadAt,a.username expediteur FROM expediteur_ecotrack_notifications n
       LEFT JOIN admins a ON a.id=n.expediteur_id
       LEFT JOIN expediteur_ecotrack_notification_reads nr ON nr.notification_id=n.id AND nr.reader_username=? AND nr.reader_audience=?
       WHERE ${where} LIMIT 1`, [reader.username, reader.audience, ...params],
    ) as any;
    if (!notification) return res.status(404).json({ ok: false, error: "notification_not_found" });
    const [[orderRow]] = await conn.execute(
      "SELECT raw_order,status_value status,client_name,phone FROM expediteur_ecotrack_order_cache WHERE expediteur_id=? AND tracking=? LIMIT 1",
      [notification.expediteur_id, notification.tracking],
    ) as any;
    const [remarks] = await conn.execute(
      `SELECT id,author_username author,author_role role,content,created_at createdAt
       FROM expediteur_ecotrack_remarks WHERE expediteur_id=? AND tracking=? ORDER BY created_at ASC`,
      [notification.expediteur_id, notification.tracking],
    ) as any;
    const [statusHistory] = await conn.execute(
      `SELECT status_value status,occurred_at occurredAt FROM expediteur_ecotrack_status_history
       WHERE expediteur_id=? AND tracking=? ORDER BY occurred_at ASC`,
      [notification.expediteur_id, notification.tracking],
    ) as any;
    await conn.execute(
      `INSERT INTO expediteur_ecotrack_notification_reads (notification_id,reader_username,reader_audience)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE read_at=read_at`,
      [id, reader.username, reader.audience],
    );
    return res.json({
      ok: true, notification,
      order: orderRow ? { ...parsedOrder(orderRow.raw_order), tracking: notification.tracking, status: orderRow.status, client: orderRow.client_name, phone: orderRow.phone } : null,
      remarks, statusHistory,
    });
  } catch (e) { return error(res, e); } finally { conn.release(); }
}
router.get("/expediteur/ecotrack/notifications", listNotifications);
router.get("/admin/ecotrack/notifications", listNotifications);
router.get("/suivi/ecotrack/notifications", listNotifications);
router.put("/expediteur/ecotrack/notifications/:id/read", markNotificationRead);
router.put("/admin/ecotrack/notifications/:id/read", markNotificationRead);
router.put("/suivi/ecotrack/notifications/:id/read", markNotificationRead);
router.get("/expediteur/ecotrack/notifications/:id", notificationDetail);
router.get("/admin/ecotrack/notifications/:id", notificationDetail);
router.get("/suivi/ecotrack/notifications/:id", notificationDetail);
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

async function productOwner(req: AuthedRequest) {
  const account = await accountFor(req);
  if (!account) throw new EcotrackError("forbidden", 403, null);
  return account.id;
}
router.get("/expediteur/ecotrack/products", async (req: AuthedRequest, res) => {
  try {
    const owner = await productOwner(req);
    const [rows] = await pool.execute("SELECT id,expediteur_id,name,sku,purchase_price,sale_price,barcode,external_id,brand,alert_min_stock,weight_kg,marketer_percentage,page_url,description,photo_mime,(photo_data IS NOT NULL) has_photo FROM expediteur_products WHERE expediteur_id=? ORDER BY updated_at DESC, id DESC", [owner]) as any;
    return res.json({ ok: true, products: rows.map((p: any) => ({ ...p, photo_url: p.has_photo ? `/api/expediteur/ecotrack/products/${p.id}/photo` : null })) });
  } catch (e) { return error(res, e); }
});
router.get("/expediteur/ecotrack/products/:id/photo", async (req: AuthedRequest, res) => {
  try {
    const owner = await productOwner(req);
    const [[row]] = await pool.execute("SELECT photo_data, photo_mime FROM expediteur_products WHERE id=? AND expediteur_id=?", [Number(req.params.id), owner]) as any;
    if (!row?.photo_data) return res.status(404).end();
    res.type(row.photo_mime || "application/octet-stream"); return res.send(row.photo_data);
  } catch (e) { return error(res, e); }
});
function validateProduct(body: any, file?: Express.Multer.File) {
  const numeric = ["purchase_price", "sale_price", "alert_min_stock", "weight_kg", "marketer_percentage"];
  for (const key of numeric) if (body[key] !== undefined && body[key] !== "" && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) return `invalid_${key}`;
  if (body.page_url) { try { const url = new URL(String(body.page_url)); if (!["http:", "https:"].includes(url.protocol)) return "invalid_page_url"; } catch { return "invalid_page_url"; } }
  if (file) {
    const good = (file.mimetype === "image/jpeg" && file.buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
      || (file.mimetype === "image/png" && file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      || (file.mimetype === "image/webp" && file.buffer.subarray(0, 4).toString() === "RIFF" && file.buffer.subarray(8, 12).toString() === "WEBP");
    if (!good) return "invalid_photo";
  }
  return null;
}
router.post("/expediteur/ecotrack/products", productUpload.single("photo"), async (req: AuthedRequest, res) => {
  try {
    const owner = await productOwner(req);
    const name = String(req.body.name ?? "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "name_required" });
    const validation = validateProduct(req.body, req.file);
    if (validation) return res.status(400).json({ ok: false, error: validation });
    const numeric = (key: string) => req.body[key] === undefined || req.body[key] === "" ? null : Number(req.body[key]);
    const [result] = await pool.execute(`INSERT INTO expediteur_products (expediteur_id,name,sku,purchase_price,sale_price,barcode,external_id,brand,alert_min_stock,weight_kg,marketer_percentage,page_url,description,photo_data,photo_mime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [owner,name,req.body.sku||null,numeric("purchase_price"),numeric("sale_price"),req.body.barcode||null,req.body.external_id||null,req.body.brand||null,numeric("alert_min_stock"),numeric("weight_kg"),numeric("marketer_percentage"),req.body.page_url||null,req.body.description||null,req.file?.buffer||null,req.file?.mimetype||null]) as any;
    const [[product]] = await pool.execute("SELECT id,name,sku,purchase_price,sale_price,barcode,external_id,brand,alert_min_stock,weight_kg,marketer_percentage,page_url,description,photo_mime,(photo_data IS NOT NULL) has_photo FROM expediteur_products WHERE id=?", [result.insertId]) as any;
    return res.status(201).json({ ok: true, product: { ...product, photo_url: product.has_photo ? `/api/expediteur/ecotrack/products/${result.insertId}/photo` : null } });
  } catch (e) { return error(res, e); }
});
router.put("/expediteur/ecotrack/products/:id", productUpload.single("photo"), async (req: AuthedRequest, res) => {
  try {
    const owner = await productOwner(req); const id = Number(req.params.id);
    const [[current]] = await pool.execute("SELECT * FROM expediteur_products WHERE id=? AND expediteur_id=?", [id, owner]) as any;
    if (!current) return res.status(404).json({ ok: false, error: "not_found" });
    const validation = validateProduct(req.body, req.file);
    if (validation) return res.status(400).json({ ok: false, error: validation });
    const numeric = (key: string) => req.body[key] === undefined || req.body[key] === "" ? null : Number(req.body[key]);
    await pool.execute(`UPDATE expediteur_products SET name=?,sku=?,purchase_price=?,sale_price=?,barcode=?,external_id=?,brand=?,alert_min_stock=?,weight_kg=?,marketer_percentage=?,page_url=?,description=?,photo_data=COALESCE(?,photo_data),photo_mime=COALESCE(?,photo_mime) WHERE id=? AND expediteur_id=?`, [String(req.body.name ?? current.name).trim(),req.body.sku||null,numeric("purchase_price"),numeric("sale_price"),req.body.barcode||null,req.body.external_id||null,req.body.brand||null,numeric("alert_min_stock"),numeric("weight_kg"),numeric("marketer_percentage"),req.body.page_url||null,req.body.description||null,req.file?.buffer||null,req.file?.mimetype||null,id,owner]);
    const [[product]] = await pool.execute("SELECT id,name,sku,purchase_price,sale_price,barcode,external_id,brand,alert_min_stock,weight_kg,marketer_percentage,page_url,description,photo_mime,(photo_data IS NOT NULL) has_photo FROM expediteur_products WHERE id=?", [id]) as any;
    return res.json({ ok: true, product: { ...product, photo_url: product.has_photo ? `/api/expediteur/ecotrack/products/${id}/photo` : null } });
  } catch (e) { return error(res, e); }
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