import crypto from "node:crypto";
import { promisify } from "node:util";
import type { Request, Response, NextFunction } from "express";
import { db, adminsTable, eq } from "@workspace/db";

const scryptAsync = promisify<
  crypto.BinaryLike,
  crypto.BinaryLike,
  number,
  Buffer
>(crypto.scrypt as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  callback: (err: Error | null, derivedKey: Buffer) => void,
) => void);

const ADMIN_SECRET =
  process.env.ADMIN_SECRET ?? "weasy-admin-default-secret-change-me";
const TOKEN_TTL = 24 * 60 * 60 * 1000;

// ── Password hashing ──────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scryptAsync(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const sep = stored.indexOf(":");
  if (sep === -1) return false;
  const salt = stored.slice(0, sep);
  const storedHash = stored.slice(sep + 1);
  const derived = await scryptAsync(password, salt, 64);
  const storedBuf = Buffer.from(storedHash, "hex");
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

// ── DB lookup ────────────────────────────────────────────────────────────────

export async function findAdmin(username: string) {
  const rows = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.username, username))
    .limit(1);
  return rows[0] ?? null;
}

export async function verifyAdminCredentials(
  username: string,
  password: string,
): Promise<{ valid: boolean; role?: string }> {
  const admin = await findAdmin(username);
  if (!admin) return { valid: false };
  const ok = await verifyPassword(password, admin.passwordHash);
  return ok ? { valid: true, role: admin.role } : { valid: false };
}

export async function updateAdminPassword(
  username: string,
  newPasswordHash: string,
): Promise<void> {
  await db
    .update(adminsTable)
    .set({ passwordHash: newPasswordHash })
    .where(eq(adminsTable.username, username));
}

// ── HMAC session tokens ───────────────────────────────────────────────────────

export function generateToken(username: string, role: string): string {
  const payload = `${Date.now()}.${username}.${role}`;
  const sig = crypto
    .createHmac("sha256", ADMIN_SECRET)
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}|${sig}`).toString("base64url");
}

export function verifyToken(token: string): {
  valid: boolean;
  username?: string;
  role?: string;
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return { valid: false };
    const payload = decoded.slice(0, pipeIdx);
    const sig = decoded.slice(pipeIdx + 1);
    const parts = payload.split(".");
    if (parts.length < 3) return { valid: false };
    const ts = Number(parts[0]);
    const username = parts[1];
    const role = parts.slice(2).join(".");
    const age = Date.now() - ts;
    if (isNaN(age) || age > TOKEN_TTL || age < 0) return { valid: false };
    const expected = crypto
      .createHmac("sha256", ADMIN_SECRET)
      .update(payload)
      .digest("hex");
    if (sig.length !== expected.length) return { valid: false };
    const ok = crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex"),
    );
    return ok ? { valid: true, username, role } : { valid: false };
  } catch {
    return { valid: false };
  }
}

export type AuthedRequest = Request & {
  adminUsername?: string;
  adminRole?: string;
};

export function adminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = (req.headers["authorization"] as string) ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const result = verifyToken(token);
  if (!token || !result.valid) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  (req as AuthedRequest).adminUsername = result.username;
  (req as AuthedRequest).adminRole = result.role;
  next();
}

export function superAdminOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if ((req as AuthedRequest).adminRole !== "admin") {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  next();
}
