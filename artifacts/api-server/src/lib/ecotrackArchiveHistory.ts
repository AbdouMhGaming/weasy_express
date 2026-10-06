import { pool } from "@workspace/db";
import { EcotrackError, ecotrackRequest } from "./ecotrackClient";
import { lookup, unwrap } from "./ecotrackOrderRules";

type Scan = { cursor: string; complete: boolean; refreshAt: number; error?: string; retryAfter?: number };
const scans = new Map<number, Scan>();
const running = new Map<number, Promise<Scan>>();
let storage: Promise<void> | undefined;

export function ensureArchiveHistoryStorage() {
  if (!storage) storage = pool.execute(`CREATE TABLE IF NOT EXISTS expediteur_ecotrack_archive_cache (
    expediteur_id INT NOT NULL,
    tracking VARCHAR(255) NOT NULL,
    kind VARCHAR(16) NOT NULL,
    status_value VARCHAR(255) NOT NULL,
    reference_value VARCHAR(255) NULL,
    client_name VARCHAR(255) NULL,
    phone VARCHAR(100) NULL,
    montant DECIMAL(14,2) NULL,
    created_at_remote DATETIME NULL,
    last_updated_at_remote DATETIME NULL,
    raw_order LONGTEXT NOT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (expediteur_id, tracking),
    KEY ix_ecotrack_archive_kind (expediteur_id, kind, created_at_remote)
  ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`).then(() => undefined).catch((e: unknown) => {
    storage = undefined; throw e;
  });
  return storage;
}

export function receivedArchiveKind(value: unknown): "payment" | "return" | null {
  const status = lookup(value).replace(/[\s-]+/g, "_");
  if (["paye_et_archive", "paiement_archive", "paiements_archives", "paid", "payed"].includes(status)) return "payment";
  if (["retour_archive", "return_received", "retours_recus"].includes(status)) return "return";
  return null;
}

export function verifiedArchiveEntries(body: any, requested: string[]) {
  const allowed = new Set(requested);
  return Object.entries(unwrap(body) ?? {}).flatMap(([tracking, info]: [string, any]) => {
    const kind = receivedArchiveKind(info?.status);
    return allowed.has(tracking) && kind ? [{ tracking, kind, status: info.status }] : [];
  });
}

const parse = (value: any): any => {
  try { return typeof value === "string" ? JSON.parse(value) : value ?? {}; } catch { return {}; }
};
const date = (value: unknown) => {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 19).replace("T", " ") : null;
};

async function scanArchive(expediteurId: number, token: string): Promise<Scan> {
  await ensureArchiveHistoryStorage();
  let state = scans.get(expediteurId);
  if (state && state.refreshAt > Date.now() && (state.complete || state.error)) return state;
  if (!state || state.complete || state.error) {
    state = { cursor: "", complete: false, refreshAt: 0 };
    scans.set(expediteurId, state);
  }
  // Bounded work per request; both history views share the same scan and cache.
  for (let batch = 0; batch < 3; batch++) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT h.tracking FROM expediteur_ecotrack_status_history h
       WHERE h.expediteur_id=? AND BINARY h.tracking > BINARY ?
       AND NOT EXISTS (SELECT 1 FROM expediteur_ecotrack_order_cache c
         WHERE c.expediteur_id=h.expediteur_id AND BINARY c.tracking=BINARY h.tracking
         AND c.status_value NOT IN ('paye_et_archive','payé_et_archivé','paiement_archive','retour_archive','return_received'))
       ORDER BY BINARY h.tracking LIMIT 100`, [expediteurId, state.cursor],
    ) as any;
    const requested: string[] = rows.map((r: any) => String(r.tracking));
    if (!requested.length) { state.complete = true; state.refreshAt = Date.now() + 15 * 60_000; break; }
    try {
      const { body } = await ecotrackRequest(token, "/api/v1/get/orders/status", {
        params: { trackings: requested.join(","), status: "paye_et_archive,retour_archive" },
      });
      const entries = verifiedArchiveEntries(body, requested);
      if (entries.length) {
        const details = await ecotrackRequest(token, "/api/v1/get/trackings/info", {
          params: { "trackings[]": entries.map(e => e.tracking) },
        });
        const detailsByTracking = unwrap(details.body) ?? {};
        // Never assign a different returned parcel to a requested tracking.
        const [existing] = await pool.execute(
          `SELECT tracking,raw_order FROM expediteur_ecotrack_archive_cache
           WHERE expediteur_id=? AND tracking IN (${entries.map(() => "?").join(",")})`,
          [expediteurId, ...entries.map(e => e.tracking)],
        ) as any;
        const previous = new Map<string, any>(existing.map((r: any) => [String(r.tracking), parse(r.raw_order)]));
        for (const entry of entries) {
          const detail = detailsByTracking[entry.tracking];
          const info = detail?.OrderInfo;
          const raw = {
            ...(info && String(info.tracking) === entry.tracking ? info : previous.get(entry.tracking) ?? {}),
            ...(Array.isArray(detail?.activity) ? { activity: detail.activity } : {}),
            tracking: entry.tracking,
            status: entry.kind === "payment" ? "paiement_archive" : "return_received",
          };
          const amount = raw.montant !== null && raw.montant !== undefined && raw.montant !== "" && Number.isFinite(Number(raw.montant)) ? Number(raw.montant) : null;
          await pool.execute(
            `INSERT INTO expediteur_ecotrack_archive_cache
             (expediteur_id,tracking,kind,status_value,reference_value,client_name,phone,montant,created_at_remote,last_updated_at_remote,raw_order,fetched_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW())
             ON DUPLICATE KEY UPDATE kind=VALUES(kind),status_value=VALUES(status_value),
             reference_value=VALUES(reference_value),client_name=VALUES(client_name),phone=VALUES(phone),montant=VALUES(montant),
             created_at_remote=VALUES(created_at_remote),last_updated_at_remote=VALUES(last_updated_at_remote),
             raw_order=VALUES(raw_order),fetched_at=NOW()`,
            [expediteurId, entry.tracking, entry.kind, raw.status, raw.reference ?? null, raw.client ?? null,
              raw.phone ?? null, amount, date(raw.created_at), date(raw.last_updated_at ?? raw.created_at), JSON.stringify(raw)],
          );
        }
      }
      state.cursor = requested[requested.length - 1];
      if (requested.length < 100) { state.complete = true; state.refreshAt = Date.now() + 15 * 60_000; break; }
    } catch (e) {
      const error = e instanceof EcotrackError ? e : null;
      state.error = error?.status === 429 ? "rate_limited" : "archive_sync_failed";
      state.retryAfter = error?.retryAfter ?? 60;
      state.refreshAt = Date.now() + Math.max(60, state.retryAfter) * 1000;
      break;
    }
  }
  return state;
}

export async function refreshArchiveHistory(expediteurId: number, token: string) {
  let promise = running.get(expediteurId);
  if (!promise) {
    promise = scanArchive(expediteurId, token).finally(() => running.delete(expediteurId));
    running.set(expediteurId, promise);
  }
  const scan = await promise;
  return { hasMore: !scan.complete && !scan.error, complete: scan.complete, error: scan.error,
    retryAfter: scan.retryAfter, coverage: "known_trackings" };
}
