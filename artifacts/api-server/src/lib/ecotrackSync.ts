import { pool } from "@workspace/db";
import { EcotrackError, ecotrackRequest, ecotrackToken } from "./ecotrackClient";
import { logger } from "./logger";
import { ensureEcotrackEventsStorage, recordSuspension } from "./ecotrackEvents";
import { canonicalOrderStatus } from "./ecotrackOrderRules";

const MAX_SYNC_PAGES = 10;
const LIVE_SYNC_INTERVAL_MS = 60_000;
const REQUEST_PACING_MS = 1_100;
const accountSyncs = new Map<number, Promise<EcotrackSyncResult>>();
const cycleStartedAt = new Map<number, Date>();

export async function ensureEcotrackStorage() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS expediteur_ecotrack_order_cache (
        id BIGINT NOT NULL AUTO_INCREMENT,
        expediteur_id INT NOT NULL,
        tracking VARCHAR(255) NOT NULL,
        reference_value VARCHAR(255) NULL,
        client_name VARCHAR(255) NULL,
        phone VARCHAR(64) NULL,
        status_value VARCHAR(255) NULL,
        montant DECIMAL(14,2) NULL,
        tarif_prestation DECIMAL(14,2) NULL,
        tarif_retour DECIMAL(14,2) NULL,
        created_at_remote DATETIME NULL,
        last_updated_at_remote DATETIME NULL,
        raw_order JSON NOT NULL,
        fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ecotrack_cache_expediteur_tracking (expediteur_id, tracking),
        KEY ix_ecotrack_cache_expediteur_status (expediteur_id, status_value),
        KEY ix_ecotrack_cache_expediteur_fetched (expediteur_id, fetched_at)
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS expediteur_ecotrack_sync_state (
        expediteur_id INT NOT NULL,
        next_page INT NOT NULL DEFAULT 1,
        last_page INT NULL,
        last_synced_at TIMESTAMP NULL DEFAULT NULL,
        blocked_until TIMESTAMP NULL DEFAULT NULL,
        last_error TEXT NULL,
        last_error_at TIMESTAMP NULL DEFAULT NULL,
        PRIMARY KEY (expediteur_id)
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS expediteur_ecotrack_status_history (
        id BIGINT NOT NULL AUTO_INCREMENT,
        expediteur_id INT NOT NULL,
        tracking VARCHAR(255) NOT NULL,
        status_value VARCHAR(255) NOT NULL,
        occurred_at DATETIME NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ecotrack_status_event (expediteur_id, tracking, status_value, occurred_at),
        KEY ix_ecotrack_status_current (expediteur_id, status_value, occurred_at)
      )
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS ecotrack_delay_thresholds (
        wilaya_id INT NOT NULL,
        vers_wilaya_hours INT NOT NULL DEFAULT 48,
        en_livraison_hours INT NOT NULL DEFAULT 72,
        suspendu_hours INT NOT NULL DEFAULT 72,
        retour_hours INT NOT NULL DEFAULT 72,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (wilaya_id)
      )
    `);
    for (const [column, defaultHours] of [["suspendu_hours", 72], ["retour_hours", 72]] as const) {
      const [existingColumn] = await conn.execute(
        `SHOW COLUMNS FROM ecotrack_delay_thresholds LIKE '${column}'`,
      ) as any;
      if (!existingColumn.length) {
        await conn.execute(
          `ALTER TABLE ecotrack_delay_thresholds ADD COLUMN ${column} INT NOT NULL DEFAULT ${defaultHours}`,
        );
      }
    }
    const thresholdRows = Array.from({ length: 58 }, (_, index) => `(${index + 1},48,72,72,72)`).join(",");
    await conn.execute(`
      INSERT IGNORE INTO ecotrack_delay_thresholds (wilaya_id, vers_wilaya_hours, en_livraison_hours, suspendu_hours, retour_hours)
      VALUES ${thresholdRows}
    `);
    const [errorColumn] = await conn.execute(
      "SHOW COLUMNS FROM expediteur_ecotrack_sync_state LIKE 'last_error'",
    ) as any;
    if (!errorColumn.length) {
      await conn.execute(
        "ALTER TABLE expediteur_ecotrack_sync_state ADD COLUMN last_error TEXT NULL, ADD COLUMN last_error_at TIMESTAMP NULL DEFAULT NULL",
      );
    }
    logger.info("Ecotrack storage ready");
    await ensureEcotrackEventsStorage();
  } finally {
    conn.release();
  }
}

export type EcotrackSyncResult = {
  pagesFetched: number;
  nextPage: number;
  lastPage: number | null;
  complete: boolean;
  blocked?: boolean;
  retryAfter?: number;
};

function tracking(value: unknown) {
  const result = String(value ?? "").trim();
  return result.length > 0 && result.length <= 255 ? result : null;
}

function mysqlDateTime(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

function cachedOrderStatus(order: any) {
  const status = canonicalOrderStatus(order?.status ?? order?.process_state_id ?? null);
  const normalized = String(status ?? "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
  const paymentId = order?.payment_id;
  const hasPaymentBatch = paymentId !== undefined && paymentId !== null && paymentId !== "" && paymentId !== "null";
  return normalized === "encaisse_non_paye" && hasPaymentBatch ? "paiements_prets" : status;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withEcotrackAccountLock<T>(
  expediteurId: number,
  operation: () => Promise<T>,
): Promise<T> {
  const lockName = `weasy:ecotrack:${expediteurId}`;
  const lockConnection = await pool.getConnection();
  let acquired = false;
  try {
    const [[row]] = await lockConnection.execute(
      "SELECT GET_LOCK(?, 60) AS acquired",
      [lockName],
    ) as any;
    acquired = Number(row?.acquired) === 1;
    if (!acquired) throw new Error("Ecotrack account is busy");
    return await operation();
  } finally {
    if (acquired) {
      await lockConnection.execute("SELECT RELEASE_LOCK(?)", [lockName]).catch(() => undefined);
    }
    lockConnection.release();
  }
}

export async function cacheOrders(expediteurId: number, orders: any[], sourceToken?: string) {
  if (!orders.length) return;
  const rows = orders.flatMap((order) => {
    const id = tracking(order?.tracking);
    if (!id) return [];
    return [[
      expediteurId, id, order.reference ?? null, order.client ?? null, order.phone ?? null,
      cachedOrderStatus(order), order.montant ?? null,
      order.tarif_prestation ?? null, order.tarif_retour ?? null, mysqlDateTime(order.created_at),
      mysqlDateTime(order.last_updated_at), JSON.stringify(order),
    ]];
  });
  if (!rows.length) return;
  const conn = await pool.getConnection();
  try {
    // Keep statements small for shared-hosting packet and placeholder limits.
    for (let offset = 0; offset < rows.length; offset += 25) {
      const batch = rows.slice(offset, offset + 25);
      const trackings = batch.map((row) => row[1]);
      const [existingRows] = await conn.execute(
        `SELECT tracking, status_value FROM expediteur_ecotrack_order_cache
         WHERE expediteur_id=? AND tracking IN (${trackings.map(() => "?").join(",")})`,
        [expediteurId, ...trackings],
      ) as any;
      const existingStatuses = new Map(existingRows.map((row: any) => [String(row.tracking), String(row.status_value ?? "")]));
      const suspensionEvents: Array<{ tracking: string; occurredAt: string }> = [];
      const historyRows = batch.flatMap((row) => {
        const currentStatus = String(row[5] ?? "");
        if (!currentStatus || existingStatuses.get(String(row[1])) === currentStatus) return [];
        const occurredAt = row[10] ?? row[9] ?? mysqlDateTime(new Date());
        if (["suspendu", "suspendus"].includes(currentStatus.toLocaleLowerCase())) {
          suspensionEvents.push({ tracking: String(row[1]), occurredAt: String(occurredAt) });
        }
        return [[expediteurId, row[1], currentStatus, occurredAt]];
      });
      if (historyRows.length) {
        await conn.execute(
          `INSERT IGNORE INTO expediteur_ecotrack_status_history
           (expediteur_id, tracking, status_value, occurred_at)
           VALUES ${historyRows.map(() => "(?,?,?,?)").join(",")}`,
          historyRows.flat(),
        );
      }
      const placeholders = batch.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())").join(",");
      await conn.execute(
        `INSERT INTO expediteur_ecotrack_order_cache
         (expediteur_id, tracking, reference_value, client_name, phone, status_value, montant, tarif_prestation, tarif_retour, created_at_remote, last_updated_at_remote, raw_order, fetched_at)
         VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE reference_value=VALUES(reference_value), client_name=VALUES(client_name), phone=VALUES(phone),
          status_value=VALUES(status_value), montant=VALUES(montant), tarif_prestation=VALUES(tarif_prestation), tarif_retour=VALUES(tarif_retour), created_at_remote=VALUES(created_at_remote),
          last_updated_at_remote=VALUES(last_updated_at_remote), raw_order=VALUES(raw_order), fetched_at=NOW()`,
        batch.flat(),
      );
      for (const event of suspensionEvents) {
        if (sourceToken) await recordSuspension({ expediteurId, ...event, sourceToken });
      }
    }
  } finally {
    conn.release();
  }
}

async function syncChunk(
  expediteurId: number,
  token: string,
  dateRange: { startDate: string; endDate: string },
): Promise<EcotrackSyncResult> {
  const conn = await pool.getConnection();
  let state: any;
  try {
    const [[row]] = await conn.execute(
      "SELECT next_page, last_page, blocked_until FROM expediteur_ecotrack_sync_state WHERE expediteur_id=?",
      [expediteurId],
    ) as any;
    state = row ?? { next_page: 1, last_page: null, blocked_until: null };
  } finally {
    conn.release();
  }

  if (state.blocked_until && new Date(state.blocked_until).getTime() > Date.now()) {
    const retryAfter = Math.ceil((new Date(state.blocked_until).getTime() - Date.now()) / 1000);
    return {
      pagesFetched: 0,
      nextPage: Math.max(1, Number(state.next_page) || 1),
      lastPage: Number(state.last_page) || null,
      complete: false,
      blocked: true,
      retryAfter,
    };
  }

  let page = Math.max(1, Number(state.next_page) || 1);
  let fetched = 0;
  let lastPage = Number(state.last_page) || null;
  if (page === 1 && !cycleStartedAt.has(expediteurId)) {
    cycleStartedAt.set(expediteurId, new Date(Math.floor(Date.now() / 1000) * 1000));
  }

  for (; fetched < MAX_SYNC_PAGES; fetched++) {
    let result;
    try {
      result = await ecotrackRequest(token, "/api/v1/get/orders", {
        params: {
          page,
          start_date: dateRange.startDate,
          end_date: dateRange.endDate,
        },
      });
    } catch (error) {
      if (error instanceof EcotrackError && error.status === 429) {
        const wait = error.retryAfter ?? 60;
        const db = await pool.getConnection();
        try {
          await db.execute(
            `INSERT INTO expediteur_ecotrack_sync_state (expediteur_id,next_page,last_page,blocked_until)
             VALUES (?,?,?,DATE_ADD(NOW(), INTERVAL ? SECOND))
             ON DUPLICATE KEY UPDATE next_page=VALUES(next_page),last_page=VALUES(last_page),blocked_until=VALUES(blocked_until)`,
            [expediteurId, page, lastPage, wait],
          );
        } finally {
          db.release();
        }
        return {
          pagesFetched: fetched,
          nextPage: page,
          lastPage,
          complete: false,
          blocked: true,
          retryAfter: wait,
        };
      }
      throw error;
    }
    const body = result.body ?? {};
    await cacheOrders(expediteurId, Array.isArray(body.data) ? body.data : [], token);
    lastPage = Number(body.last_page) || page;
    page = page >= lastPage ? 1 : page + 1;
    if (page === 1) {
      fetched++;
      break;
    }
    await delay(REQUEST_PACING_MS);
  }

  const db = await pool.getConnection();
  try {
    await db.execute(
      `INSERT INTO expediteur_ecotrack_sync_state (expediteur_id,next_page,last_page,last_synced_at,blocked_until,last_error,last_error_at)
       VALUES (?,?,?,NOW(),NULL,NULL,NULL)
       ON DUPLICATE KEY UPDATE next_page=VALUES(next_page),last_page=VALUES(last_page),last_synced_at=NOW(),blocked_until=NULL,last_error=NULL,last_error_at=NULL`,
      [expediteurId, page, lastPage],
    );
    if (page === 1) {
      const startedAt = cycleStartedAt.get(expediteurId);
      if (startedAt) {
        await db.execute(
          "DELETE FROM expediteur_ecotrack_order_cache WHERE expediteur_id=? AND fetched_at < ?",
          [expediteurId, startedAt],
        );
      }
      cycleStartedAt.delete(expediteurId);
    }
  } finally {
    db.release();
  }

  return { pagesFetched: fetched, nextPage: page, lastPage, complete: page === 1 };
}

export function syncEcotrackAccount(
  expediteurId: number,
  token: string,
  options: { fullCycle?: boolean; recentOnly?: boolean } = {},
): Promise<EcotrackSyncResult> {
  const existing = accountSyncs.get(expediteurId);
  if (existing) return existing;

  const task = withEcotrackAccountLock(expediteurId, async () => {
    let totalPages = 0;
    let chunks = 0;
    const dateRange = {
      startDate: "2020-01-01",
      endDate: new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10),
    };
    if (options.recentOnly) {
      let lastPage: number | null = null;
      let pagesFetched = 0;
      for (let page = 1; page <= 2; page++) {
        const result = await ecotrackRequest(token, "/api/v1/get/orders", {
          params: { page, start_date: dateRange.startDate, end_date: dateRange.endDate },
        });
        const body = result.body ?? {};
        await cacheOrders(expediteurId, Array.isArray(body.data) ? body.data : [], token);
        lastPage = Number(body.last_page) || page;
        pagesFetched++;
        if (page >= lastPage) break;
        await delay(REQUEST_PACING_MS);
      }
      const db = await pool.getConnection();
      try {
        await db.execute(
          `UPDATE expediteur_ecotrack_sync_state
           SET next_page=1,last_synced_at=NOW(),blocked_until=NULL,last_error=NULL,last_error_at=NULL
           WHERE expediteur_id=?`,
          [expediteurId],
        );
      } finally {
        db.release();
      }
      return { pagesFetched, nextPage: 1, lastPage, complete: true };
    }
    let result: EcotrackSyncResult;
    do {
      result = await syncChunk(expediteurId, token, dateRange);
      totalPages += result.pagesFetched;
      chunks++;
      if (result.blocked) {
        if (!options.fullCycle || !result.retryAfter || result.retryAfter > 60) break;
        await delay((result.retryAfter + 1) * 1_000);
        continue;
      }
    } while (options.fullCycle && !result.complete && chunks < 100);
    if (options.fullCycle && !result.complete && !result.blocked && chunks >= 100) {
      logger.warn({ expediteurId, totalPages }, "Ecotrack full sync safety limit reached");
    }
    return { ...result, pagesFetched: totalPages };
  }).catch(async (error) => {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "Ecotrack synchronization failed";
    const conn = await pool.getConnection();
    try {
      await conn.execute(
        `INSERT INTO expediteur_ecotrack_sync_state (expediteur_id,next_page,last_error,last_error_at)
         VALUES (?,1,?,NOW())
         ON DUPLICATE KEY UPDATE last_error=VALUES(last_error),last_error_at=NOW()`,
        [expediteurId, message],
      );
    } finally {
      conn.release();
    }
    throw error;
  }).finally(() => {
    accountSyncs.delete(expediteurId);
  });
  accountSyncs.set(expediteurId, task);
  return task;
}

export function queueEcotrackFullSync(expediteurId: number, token: string) {
  void (async () => {
    const active = accountSyncs.get(expediteurId);
    if (active) await active.catch(() => undefined);
    await syncEcotrackAccount(expediteurId, token, { fullCycle: true });
  })().catch((error) => {
      logger.warn({ err: error, expediteurId }, "Ecotrack automatic full sync failed");
    });
}

async function runLiveSync(fullCycle = false) {
  const conn = await pool.getConnection();
  let credentials: any[];
  try {
    const [rows] = await conn.execute(
      `SELECT expediteur_id, token_ciphertext, token_iv, token_auth_tag
       FROM expediteur_ecotrack_credentials WHERE connection_status='connected'`,
    ) as any;
    credentials = rows;
  } finally {
    conn.release();
  }

  for (const credential of credentials) {
    try {
      const expediteurId = Number(credential.expediteur_id);
      const token = ecotrackToken(
        credential.token_ciphertext,
        credential.token_iv,
        credential.token_auth_tag,
      );
      const result = await syncEcotrackAccount(
        expediteurId,
        token,
        fullCycle ? { fullCycle: true } : { recentOnly: true },
      );
      if (result.pagesFetched > 0) {
        logger.info(
          { expediteurId, pagesFetched: result.pagesFetched, nextPage: result.nextPage },
          "Ecotrack live sync completed",
        );
      }
    } catch (error) {
      logger.warn({ err: error, expediteurId: Number(credential.expediteur_id) }, "Ecotrack account sync failed");
    }
  }
}

export function startEcotrackLiveSync() {
  const run = (fullCycle = false) => {
    void runLiveSync(fullCycle).catch((error) => {
      logger.warn({ err: error }, "Ecotrack live sync cycle failed");
    });
  };
  const initialTimer = setTimeout(() => run(true), 3_000);
  const interval = setInterval(() => run(false), LIVE_SYNC_INTERVAL_MS);
  initialTimer.unref();
  interval.unref();
  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}