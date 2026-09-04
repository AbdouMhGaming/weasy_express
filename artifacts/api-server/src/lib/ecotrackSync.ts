import { pool } from "@workspace/db";
import { EcotrackError, ecotrackRequest, ecotrackToken } from "./ecotrackClient";
import { logger } from "./logger";

const MAX_SYNC_PAGES = 10;
const LIVE_SYNC_INTERVAL_MS = 60_000;
const REQUEST_PACING_MS = 1_100;
const accountSyncs = new Map<number, Promise<EcotrackSyncResult>>();
const cycleStartedAt = new Map<number, Date>();

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

async function cacheOrders(expediteurId: number, orders: any[]) {
  if (!orders.length) return;
  const rows = orders.flatMap((order) => {
    const id = tracking(order?.tracking);
    if (!id) return [];
    return [[
      expediteurId, id, order.reference ?? null, order.client ?? null, order.phone ?? null,
      order.status ?? order.process_state_id ?? null, order.montant ?? null,
      order.tarif_prestation ?? null, order.tarif_retour ?? null, order.created_at ?? null,
      order.last_updated_at ?? null, JSON.stringify(order),
    ]];
  });
  if (!rows.length) return;
  const placeholders = rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())").join(",");
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO expediteur_ecotrack_order_cache
       (expediteur_id, tracking, reference_value, client_name, phone, status_value, montant, tarif_prestation, tarif_retour, created_at_remote, last_updated_at_remote, raw_order, fetched_at)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE reference_value=VALUES(reference_value), client_name=VALUES(client_name), phone=VALUES(phone),
        status_value=VALUES(status_value), montant=VALUES(montant), tarif_prestation=VALUES(tarif_prestation), tarif_retour=VALUES(tarif_retour), created_at_remote=VALUES(created_at_remote),
        last_updated_at_remote=VALUES(last_updated_at_remote), raw_order=VALUES(raw_order), fetched_at=NOW()`,
      rows.flat(),
    );
  } finally {
    conn.release();
  }
}

async function syncChunk(expediteurId: number, token: string): Promise<EcotrackSyncResult> {
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
      result = await ecotrackRequest(token, "/api/v1/get/orders", { params: { page } });
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
    await cacheOrders(expediteurId, Array.isArray(body.data) ? body.data : []);
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
      `INSERT INTO expediteur_ecotrack_sync_state (expediteur_id,next_page,last_page,last_synced_at,blocked_until)
       VALUES (?,?,?,NOW(),NULL)
       ON DUPLICATE KEY UPDATE next_page=VALUES(next_page),last_page=VALUES(last_page),last_synced_at=NOW(),blocked_until=NULL`,
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
  options: { fullCycle?: boolean } = {},
): Promise<EcotrackSyncResult> {
  const existing = accountSyncs.get(expediteurId);
  if (existing) return existing;

  const task = withEcotrackAccountLock(expediteurId, async () => {
    let totalPages = 0;
    let chunks = 0;
    let result: EcotrackSyncResult;
    do {
      result = await syncChunk(expediteurId, token);
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
      const result = await syncEcotrackAccount(expediteurId, token, { fullCycle });
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
  const interval = setInterval(() => run(true), LIVE_SYNC_INTERVAL_MS);
  initialTimer.unref();
  interval.unref();
  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
}