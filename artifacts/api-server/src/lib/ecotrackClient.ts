import { decryptEcotrackToken, ECOTRACK_BASE_URL } from "./ecotrack";

export class EcotrackError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
    public readonly retryAfter: number | null = null,
    public readonly credentialError = false,
  ) { super(message); }
}

export function ecotrackToken(ciphertext: string, iv: string, authTag: string): string {
  return decryptEcotrackToken(ciphertext, iv, authTag);
}

export async function ecotrackRequest(
  token: string,
  path: string,
  options: { method?: string; params?: Record<string, unknown>; body?: unknown; accept?: string } = {},
): Promise<{ response: Response; body: any; retryAfter: number | null }> {
  const url = new URL(path, ECOTRACK_BASE_URL);
  url.searchParams.set("api_token", token); // Ecotrack production requires this as well as Bearer.
  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: options.accept ?? "application/json",
        ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
    const retry = response.headers.get("retry-after");
    const retryAfter = retry && Number.isFinite(Number(retry)) ? Math.max(0, Number(retry)) : null;
    const body: any = await response.json().catch(() => null);
    const credentialError: boolean = response.status === 401 ||
      (body && (body.message === "INVALID_TOKEN" || body.message === "Unauthenticated."));
    if (!response.ok || body?.success === false) {
      throw new EcotrackError(
        String(body?.message ?? `Ecotrack request failed (${response.status})`),
        response.status || 502, body, retryAfter, credentialError,
      );
    }
    return { response, body, retryAfter };
  } catch (error) {
    if (error instanceof EcotrackError) throw error;
    throw new EcotrackError("Ecotrack is unavailable", 502, null);
  } finally {
    clearTimeout(timeout);
  }
}

/** PDF requests deliberately do not parse or buffer the upstream document. */
export async function ecotrackPdf(token: string, path: string, params: Record<string, unknown>): Promise<Response> {
  const url = new URL(path, ECOTRACK_BASE_URL);
  url.searchParams.set("api_token", token);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" }, signal: controller.signal });
    if (!response.ok) throw new EcotrackError("Unable to retrieve label", response.status, null, null, response.status === 401);
    return response;
  } catch (error) {
    if (error instanceof EcotrackError) throw error;
    throw new EcotrackError("Ecotrack is unavailable", 502, null);
  } finally { clearTimeout(timeout); }
}