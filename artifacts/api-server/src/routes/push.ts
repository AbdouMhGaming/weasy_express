import { Router } from "express";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";

const router = Router();

// ── GET /api/push/vapid-public-key ─────────────────────────────────────────
// Returns the VAPID public key so the frontend can subscribe to push.

router.get("/push/vapid-public-key", adminAuth, (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  res.json({ ok: true, key });
});

// ── POST /api/push/subscribe ───────────────────────────────────────────────
// Save a push subscription for the authenticated user.
// Body: { endpoint, keys: { p256dh, auth } }

router.post("/push/subscribe", adminAuth, async (req: AuthedRequest, res) => {
  const username = req.adminDataUsername ?? req.adminUsername!;
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({ ok: false, error: "Invalid subscription object" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT INTO push_subscriptions (username, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         username = VALUES(username),
         p256dh   = VALUES(p256dh),
         auth     = VALUES(auth)`,
      [username, endpoint, keys.p256dh, keys.auth]
    );
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

// ── DELETE /api/push/unsubscribe ──────────────────────────────────────────
// Remove a push subscription by endpoint.
// Body: { endpoint }

router.delete("/push/unsubscribe", adminAuth, async (req: AuthedRequest, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ ok: false, error: "Missing endpoint" });

  // Scope deletion to the authenticated user to prevent cross-user tampering
  const username = req.adminDataUsername ?? req.adminUsername!;
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      "DELETE FROM push_subscriptions WHERE endpoint = ? AND username = ?",
      [endpoint, username]
    );
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

export default router;
