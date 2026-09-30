import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { pool } from "@workspace/db";
import { adminAuth, suiviAuth, type AuthedRequest, verifyToken } from "../lib/adminAuth";

const router = Router();

/**
 * Push preferences are available to every authenticated portal. Keep Suivi's
 * isolated audience on its dedicated guard and use the existing admin guard
 * for all other accepted roles.
 */
function pushAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const identity = verifyToken(token);
  if (!identity.valid) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }

  if (identity.role === "suivi" && identity.audience === "suivi") {
    suiviAuth(req, res, next);
    return;
  }
  adminAuth(req, res, next);
}

function authenticatedUsername(req: AuthedRequest, res: Response): string | null {
  const username = req.adminUsername?.trim();
  if (!username) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return null;
  }
  return username;
}

// ── GET /api/push/vapid-public-key ─────────────────────────────────────────
// Returns the VAPID public key so the frontend can subscribe to push.

router.get("/push/vapid-public-key", pushAuth, (_req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY ?? "";
  res.json({ ok: true, key });
});

// ── POST /api/push/subscribe ───────────────────────────────────────────────
// Save a push subscription for the authenticated user.
// Body: { endpoint, keys: { p256dh, auth } }

router.post("/push/subscribe", pushAuth, async (req: AuthedRequest, res) => {
  const username = authenticatedUsername(req, res);
  if (!username) return;
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

router.delete("/push/unsubscribe", pushAuth, async (req: AuthedRequest, res) => {
  const { endpoint } = req.body as { endpoint?: string };
  if (!endpoint) return res.status(400).json({ ok: false, error: "Missing endpoint" });

  // Scope deletion to the authenticated user to prevent cross-user tampering
  const username = authenticatedUsername(req, res);
  if (!username) return;
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.execute(
      "DELETE FROM push_subscriptions WHERE endpoint = ? AND username = ?",
      [endpoint, username]
    ) as [{ affectedRows?: number }, unknown];
    res.json({ ok: true, deleted: (result?.affectedRows ?? 0) > 0 });
  } finally {
    conn.release();
  }
});

export default router;
