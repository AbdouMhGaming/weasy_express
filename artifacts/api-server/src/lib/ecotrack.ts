import crypto from "node:crypto";

const ECOTRACK_BASE_URL = "https://wasseliexpress.ecotrack.dz";
const TOKEN_CONTEXT = "weasy-express:ecotrack-token:v1";

function encryptionKey(): Buffer {
  const source = process.env.SESSION_SECRET;
  if (!source || source.length < 16) {
    throw new Error("SESSION_SECRET must be configured to encrypt Ecotrack tokens");
  }
  return Buffer.from(crypto.hkdfSync("sha256", source, "weasy-express", TOKEN_CONTEXT, 32));
}

export function encryptEcotrackToken(token: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
  hint: string;
} {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(TOKEN_CONTEXT));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    hint: token.length >= 4 ? token.slice(-4) : "",
  };
}

export function decryptEcotrackToken(ciphertext: string, iv: string, authTag: string): string {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64"),
  );
  decipher.setAAD(Buffer.from(TOKEN_CONTEXT));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function normalizeEcotrackToken(input: unknown): string {
  let value = String(input ?? "").trim();
  value = value.replace(/^Bearer\s+/i, "").trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  try {
    const parsed = new URL(value);
    value = parsed.searchParams.get("api_token")?.trim() || value;
  } catch {
    const match = value.match(/(?:^|[?&])api_token=([^&\s]+)/i);
    if (match) {
      try { value = decodeURIComponent(match[1]).trim(); } catch { value = match[1].trim(); }
    }
  }
  return value.replace(/^Bearer\s+/i, "").trim();
}

export async function validateEcotrackToken(token: string): Promise<{
  valid: boolean;
  reason?: "invalid" | "not_allowed" | "unavailable";
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const url = new URL("/api/v1/validate/token", ECOTRACK_BASE_URL);
    url.searchParams.set("api_token", token);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null) as
      | { success?: boolean; message?: string }
      | null;
    if (response.ok && body?.success === true && body.message === "VALID_TOKEN") {
      return { valid: true };
    }
    if (body?.message === "TOKEN_NOT_ALLOWED") return { valid: false, reason: "not_allowed" };
    if (
      body?.message === "INVALID_TOKEN" ||
      body?.message === "Unauthenticated." ||
      response.status === 401
    ) {
      return { valid: false, reason: "invalid" };
    }
    return { valid: false, reason: "unavailable" };
  } catch {
    return { valid: false, reason: "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}

export { ECOTRACK_BASE_URL };