import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env["RESEND_API_KEY"];

if (!apiKey) {
  logger.warn(
    "RESEND_API_KEY is not set. Email sending will fail until it is configured.",
  );
}

const resend = apiKey ? new Resend(apiKey) : null;

export const MAIL_FROM =
  process.env["MAIL_FROM"] ?? "Weasy Express <onboarding@resend.dev>";

const MAIL_TO_RAW = process.env["MAIL_TO"] ?? "contact@weasyexpress.com";

export const MAIL_TO: string[] = MAIL_TO_RAW.split(",")
  .map((addr) => addr.trim())
  .filter((addr) => addr.length > 0);

export interface SendMailInput {
  subject: string;
  html: string;
  replyTo?: string;
  text?: string;
}

const STRICT_EMAIL_RE =
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

function sanitizeReplyTo(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return STRICT_EMAIL_RE.test(trimmed) ? trimmed : undefined;
}

export async function sendMail(input: SendMailInput): Promise<void> {
  if (!resend) {
    throw new Error("RESEND_API_KEY is not configured on the server.");
  }

  const replyTo = sanitizeReplyTo(input.replyTo);

  const { error } = await resend.emails.send({
    from: MAIL_FROM,
    to: MAIL_TO,
    subject: input.subject,
    html: input.html,
    text: input.text,
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    throw new Error(
      typeof error === "string"
        ? error
        : error.message || "Failed to send email via Resend.",
    );
  }
}

export function escapeHtml(value: string | null | undefined): string {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
