import { Router, type IRouter } from "express";
import { logger } from "../lib/logger";
import { escapeHtml, sendMail } from "../lib/mailer";

const router: IRouter = Router();

const SUBJECT_LABELS: Record<string, string> = {
  info: "Demande d'information",
  claim: "Réclamation",
  partner: "Partenariat",
  other: "Autre",
};

interface ContactBody {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  subject?: unknown;
  message?: unknown;
}

function asString(value: unknown, max = 5000): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

router.post("/contact", async (req, res) => {
  const body = (req.body ?? {}) as ContactBody;

  const name = asString(body.name, 200);
  const email = asString(body.email, 200);
  const phone = asString(body.phone, 50);
  const subject = asString(body.subject, 50);
  const message = asString(body.message, 10000);

  const errors: string[] = [];
  if (!name) errors.push("name");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if (!subject) errors.push("subject");
  if (!message) errors.push("message");

  if (errors.length > 0) {
    res.status(400).json({ ok: false, error: "invalid_fields", fields: errors });
    return;
  }

  const subjectLabel = SUBJECT_LABELS[subject] ?? subject;
  const emailSubject = `[Weasy Express] Contact - ${subjectLabel} - ${name}`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#E10600,#B80500);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
        <h2 style="margin:0;font-size:20px;">Nouveau message - Formulaire de contact</h2>
        <p style="margin:6px 0 0;opacity:.9;">Sujet : ${escapeHtml(subjectLabel)}</p>
      </div>
      <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:120px;">Nom complet</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(email)}</td></tr>
          ${phone ? `<tr><td style="padding:6px 0;color:#666;">Téléphone</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(phone)}</td></tr>` : ""}
          <tr><td style="padding:6px 0;color:#666;">Sujet</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(subjectLabel)}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #eee;margin:16px 0;" />
        <h3 style="margin:0 0 8px;font-size:15px;color:#E10600;">Message</h3>
        <div style="white-space:pre-wrap;line-height:1.5;background:#f8f8f8;padding:12px;border-radius:8px;">${escapeHtml(message)}</div>
      </div>
    </div>
  `;

  const text =
    `Nouveau message - Formulaire de contact\n\n` +
    `Nom: ${name}\nEmail: ${email}\n` +
    (phone ? `Téléphone: ${phone}\n` : "") +
    `Sujet: ${subjectLabel}\n\nMessage:\n${message}\n`;

  try {
    await sendMail({ subject: emailSubject, html, text, replyTo: email });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to send contact email");
    res.status(502).json({ ok: false, error: "send_failed" });
  }
});

export default router;
