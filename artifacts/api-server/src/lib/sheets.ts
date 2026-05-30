import { logger } from "./logger";

const WEBHOOK_URL = process.env["GOOGLE_SHEETS_WEBHOOK_URL"];
const WEBHOOK_SECRET = process.env["GOOGLE_SHEETS_WEBHOOK_SECRET"];

if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
  logger.warn(
    "GOOGLE_SHEETS_WEBHOOK_URL or GOOGLE_SHEETS_WEBHOOK_SECRET is not set. Partner submissions will not be appended to the sheet.",
  );
}

export interface PartnerRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  parcelsPerMonth: string;
}

export async function appendPartnerRow(row: PartnerRow): Promise<void> {
  if (!WEBHOOK_URL || !WEBHOOK_SECRET) {
    throw new Error("Google Sheets webhook is not configured.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: WEBHOOK_SECRET, ...row }),
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Sheets webhook responded with HTTP ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;

    if (!data || data.ok !== true) {
      throw new Error(
        `Sheets webhook returned an error: ${data?.error ?? "unknown"}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
