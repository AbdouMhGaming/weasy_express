import webpush from "web-push";
import { pool } from "@workspace/db";

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    "mailto:contact@48hrdz.com",
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

async function doSendPush(
  conn: any,
  endpoint: string,
  p256dh: string,
  auth: string,
  payload: string
): Promise<void> {
  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      payload
    );
  } catch (err: any) {
    // 410 Gone / 404 Not Found = subscription expired — clean it up
    if (err.statusCode === 410 || err.statusCode === 404) {
      await conn.execute(
        "DELETE FROM push_subscriptions WHERE endpoint = ?",
        [endpoint]
      );
    }
    // Other errors (network, push service down) are silently ignored
    // so they never block the main ticket operations
  }
}

/**
 * Send a push notification to all subscriptions registered for a username.
 */
export async function sendPushToUser(
  username: string,
  title: string,
  body: string,
  url: string
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.execute(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE username = ?",
      [username]
    ) as any;
    if (!rows.length) return;
    const payload = JSON.stringify({ title, body, url });
    await Promise.all(
      (rows as any[]).map((r: any) =>
        doSendPush(conn, r.endpoint, r.p256dh, r.auth, payload)
      )
    );
  } finally {
    conn.release();
  }
}

/**
 * Send a push notification to all users with a given role.
 * Releases the DB connection before sending so it isn't held across network calls.
 */
export async function sendPushToRole(
  role: string,
  title: string,
  body: string,
  url: string
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const conn = await pool.getConnection();
  let usernames: string[] = [];
  try {
    const [users] = await conn.execute(
      `SELECT DISTINCT a.username
       FROM admins a
       INNER JOIN push_subscriptions ps ON ps.username = a.username
       WHERE a.role = ?`,
      [role]
    ) as any;
    usernames = (users as any[]).map((u: any) => u.username);
  } finally {
    conn.release();
  }
  await Promise.all(usernames.map((u) => sendPushToUser(u, title, body, url)));
}

/**
 * Send a push notification to all office users in a given hub.
 * Releases the DB connection before sending so it isn't held across network calls.
 */
export async function sendPushToOfficeHub(
  hub: string,
  title: string,
  body: string,
  url: string
): Promise<void> {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  const conn = await pool.getConnection();
  let usernames: string[] = [];
  try {
    const [users] = await conn.execute(
      `SELECT DISTINCT a.username
       FROM admins a
       INNER JOIN push_subscriptions ps ON ps.username = a.username
       WHERE a.role = 'office' AND a.office_hub = ?`,
      [hub]
    ) as any;
    usernames = (users as any[]).map((u: any) => u.username);
  } finally {
    conn.release();
  }
  await Promise.all(usernames.map((u) => sendPushToUser(u, title, body, url)));
}
