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
const DAY_MS = 24 * 60 * 60 * 1000;
const TOKEN_TTL = DAY_MS;
const REMEMBERED_TOKEN_TTL = 30 * DAY_MS;

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

// dataUsername is the parent's username for team sub-accounts; equals username for root accounts.
export function generateToken(username: string, role: string, dataUsername?: string, rememberMe = false): string {
  const data = dataUsername && dataUsername !== username ? dataUsername : "";
  const ttl = rememberMe ? REMEMBERED_TOKEN_TTL : TOKEN_TTL;
  // Use ";" as field separator — dots are valid in usernames and would break parsing
  const payload = `${Date.now()};${username};${role};${data};${ttl}`;
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
  dataUsername?: string;
} {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const pipeIdx = decoded.lastIndexOf("|");
    if (pipeIdx === -1) return { valid: false };
    const payload = decoded.slice(0, pipeIdx);
    const sig = decoded.slice(pipeIdx + 1);
    // Support both ";" (new) and "." (legacy) separators so tokens issued before
    // this fix continue to work during the 24-hour TTL window.
    const sep = payload.includes(";") ? ";" : ".";
    const parts = payload.split(sep);
    if (parts.length < 3) return { valid: false };
    const ts = Number(parts[0]);
    const username = parts[1];
    const role = parts[2];
    const dataUsername = parts[3] || undefined; // empty string → undefined (root account)
    // Tokens issued before Remember me was added have no embedded TTL and retain
    // the original 24-hour lifetime.
    const embeddedTtl = Number(parts[4]);
    const ttl = embeddedTtl === REMEMBERED_TOKEN_TTL ? REMEMBERED_TOKEN_TTL : TOKEN_TTL;
    const age = Date.now() - ts;
    if (isNaN(age) || age > ttl || age < 0) return { valid: false };
    const expected = crypto
      .createHmac("sha256", ADMIN_SECRET)
      .update(payload)
      .digest("hex");
    if (sig.length !== expected.length) return { valid: false };
    const ok = crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex"),
    );
    return ok ? { valid: true, username, role, dataUsername } : { valid: false };
  } catch {
    return { valid: false };
  }
}

export type AuthedRequest = Request & {
  adminUsername?: string;   // the logged-in account's own username
  adminRole?: string;
  adminDataUsername?: string; // parent's username for team accounts (= adminUsername for root)
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
  (req as AuthedRequest).adminUsername     = result.username;
  (req as AuthedRequest).adminRole         = result.role;
  // If a dataUsername was embedded (team member), use it; otherwise fall back to own username.
  (req as AuthedRequest).adminDataUsername = result.dataUsername ?? result.username;
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

export function financeOrAdminOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = (req as AuthedRequest).adminRole;
  if (role !== "admin" && role !== "finance") {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  next();
}

export function commercialOrAdminOnly(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const role = (req as AuthedRequest).adminRole;
  if (role !== "admin" && role !== "commercial") {
    res.status(403).json({ ok: false, error: "forbidden" });
    return;
  }
  next();
}
