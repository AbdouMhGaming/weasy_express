import webpush from "web-push";
import { pool } from "@workspace/db";

const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    "mailto:contact@48hrdz.com",
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  );
}

// ── Low-level send ────────────────────────────────────────────────────────────
// Does NOT receive a DB connection — it acquires its own only when cleanup
// is needed. This avoids holding a connection open during slow HTTP calls.

async function doSendPush(
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string,
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      payload,
      {
        TTL: 3600,       // retain for 1 hour so offline/sleeping devices get it on wake
        urgency: "high", // request immediate delivery from the push service
      },
    );
  } catch (err: any) {
    const status: number = err.statusCode ?? err.status ?? 0;
    // Log every failure so we can diagnose in server logs
    console.error(
      `[push] send failed endpoint=${endpoint.slice(0, 50)} status=${status} msg=${err.message ?? "unknown"}`,
    );
    // Expired / gone endpoint — delete it so it stops clogging the table
    if (status === 410 || status === 404) {
      const conn = await pool.getConnection();
      try {
        await conn.execute(
          "DELETE FROM push_subscriptions WHERE endpoint = ?",
          [endpoint],
        );
        console.log(`[push] removed stale subscription: ${endpoint.slice(0, 50)}`);
      } catch (dbErr) {
        console.error("[push] failed to remove stale subscription:", dbErr);
      } finally {
        conn.release();
      }
    }
  }
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Send a push to all subscriptions registered for a username.
 * The DB connection is released BEFORE making any HTTP calls so we never hold
 * a pool slot during slow/timeout network operations.
 */
export async function sendPushToUser(
  username: string,
  title: string,
  body: string,
  url: string,
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  // 1. Fetch subscriptions then immediately release the connection
  let rows: { endpoint: string; p256dh: string; auth: string }[] = [];
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.execute(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE username = ?",
      [username],
    ) as any;
    rows = result as typeof rows;
  } finally {
    conn.release(); // released BEFORE any HTTP work
  }

  if (!rows.length) return;

  const payload = JSON.stringify({ title, body, url });
  // 2. Send all pushes in parallel — no DB connection held during this
  await Promise.all(rows.map(r => doSendPush(r.endpoint, r.p256dh, r.auth, payload)));
}

/**
 * Send a push to all subscribed users with the given role.
 * Skips `excludeUsername` (used to avoid notifying the ticket creator about
 * their own action).
 */
export async function sendPushToRole(
  role: string,
  title: string,
  body: string,
  url: string,
  excludeUsername?: string,
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  // Query admins only — no JOIN avoids the collation mismatch between the
  // admins and push_subscriptions tables. sendPushToUser does its own
  // single-table lookup which is collation-safe.
  let usernames: string[] = [];
  const conn = await pool.getConnection();
  try {
    const [users] = await conn.execute(
      `SELECT username FROM admins WHERE role = ?`,
      [role],
    ) as any;
    usernames = (users as any[]).map((u: any) => u.username);
  } finally {
    conn.release();
  }

  if (excludeUsername) {
    usernames = usernames.filter(u => u !== excludeUsername);
  }

  await Promise.all(usernames.map(u => sendPushToUser(u, title, body, url)));
}

/**
 * Send a push to all subscribed office users in a given hub.
 * Skips `excludeUsername` when provided.
 */
export async function sendPushToOfficeHub(
  hub: string,
  title: string,
  body: string,
  url: string,
  excludeUsername?: string,
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  // Query admins only — no JOIN avoids the collation mismatch.
  let usernames: string[] = [];
  const conn = await pool.getConnection();
  try {
    const [users] = await conn.execute(
      `SELECT username FROM admins WHERE role = 'office' AND office_hub = ?`,
      [hub],
    ) as any;
    usernames = (users as any[]).map((u: any) => u.username);
  } finally {
    conn.release();
  }

  if (excludeUsername) {
    usernames = usernames.filter(u => u !== excludeUsername);
  }

  await Promise.all(usernames.map(u => sendPushToUser(u, title, body, url)));
}
