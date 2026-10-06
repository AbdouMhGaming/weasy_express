import crypto from "node:crypto";
import { pool } from "@workspace/db";

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export function otpHash(payoutId: number, salt: string, code: string) {
  return crypto.createHash("sha256").update(`${payoutId}:${salt}:${code}`).digest("hex");
}
export function matchesOtp(payoutId: number, salt: string, code: string, hash: string) {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/.test(hash)) return false;
  return crypto.timingSafeEqual(Buffer.from(otpHash(payoutId, salt, code), "hex"), Buffer.from(hash, "hex"));
}
let storageReady: Promise<void> | undefined;
export function ensurePayoutOtpStorage() {
  return storageReady ??= pool.execute(`
    CREATE TABLE IF NOT EXISTS payout_confirmation_otps (
      payout_id INT NOT NULL PRIMARY KEY,
      code_hash CHAR(64) NOT NULL,
      salt CHAR(32) NOT NULL,
      expires_at DATETIME NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      sent_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      window_started_at DATETIME NOT NULL,
      send_count INT NOT NULL DEFAULT 1
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `).then(() => {}).catch((error: unknown) => { storageReady = undefined; throw error; });
}
