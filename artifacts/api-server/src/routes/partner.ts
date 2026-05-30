import { Router, type IRouter } from "express";
import { db, partnersTable } from "@workspace/db";
import { escapeHtml, sendMail } from "../lib/mailer";

const router: IRouter = Router();

interface PartnerBody {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  password?: unknown;
  phone?: unknown;
  address?: unknown;
  city?: unknown;
  parcelsPerMonth?: unknown;
}

function asString(value: unknown, max = 500): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

router.post("/partner", async (req, res) => {
  const body = (req.body ?? {}) as PartnerBody;

  const firstName = asString(body.firstName, 100);
  const lastName = asString(body.lastName, 100);
  const email = asString(body.email, 200);
  const password = asString(body.password, 200);
  const phone = asString(body.phone, 50);
  const address = asString(body.address, 500);
  const city = asString(body.city, 100);
  const parcelsPerMonth = asString(body.parcelsPerMonth, 50);

  const errors: string[] = [];
  if (!firstName) errors.push("firstName");
  if (!lastName) errors.push("lastName");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if (!password || password.length < 6) errors.push("password");
  if (!phone) errors.push("phone");
  if (!address) errors.push("address");
  if (!city) errors.push("city");
  if (!parcelsPerMonth) errors.push("parcelsPerMonth");

  if (errors.length > 0) {
    res.status(400).json({ ok: false, error: "invalid_fields", fields: errors });
    return;
  }

  const fullName = `${firstName} ${lastName}`.trim();

  let dbSaved = false;
  try {
    await db.insert(partnersTable).values({
      firstName,
      lastName,
      email,
      password,
      phone,
      address,
      city,
      parcelsPerMonth,
    });
    dbSaved = true;
  } catch (err) {
    req.log.error({ err }, "Failed to save partner to database");
  }

  const emailSubject = `[Weasy Express] Nouvelle inscription Partenaire - ${fullName}`;

  const html = `
    <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;">
      <div style="background:linear-gradient(135deg,#E10600,#B80500);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
        <h2 style="margin:0;font-size:20px;">Nouvelle inscription Partenaire</h2>
        <p style="margin:6px 0 0;opacity:.9;">${escapeHtml(fullName)}</p>
      </div>
      <div style="background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 0;color:#666;width:160px;">Nom</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(lastName)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Prénom</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(firstName)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Téléphone</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(phone)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Adresse</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(address)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Ville (Wilaya)</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(city)}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Colis / mois</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(parcelsPerMonth)}</td></tr>
        </table>
        <div style="margin-top:16px;background:#FFF4E5;border:1px solid #F5C26B;border-radius:8px;padding:12px;">
          <p style="margin:0 0 6px;font-size:12px;color:#8A5A00;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Mot de passe choisi</p>
          <p style="margin:0;font-family:Menlo,Consolas,monospace;font-size:14px;font-weight:700;color:#1a1a1a;word-break:break-all;">${escapeHtml(password)}</p>
        </div>
      </div>
    </div>
  `;

  const text =
    `Nouvelle inscription Partenaire\n\n` +
    `Nom: ${lastName}\nPrénom: ${firstName}\nEmail: ${email}\nTéléphone: ${phone}\n` +
    `Adresse: ${address}\nVille: ${city}\nColis / mois: ${parcelsPerMonth}\n` +
    `\nMot de passe: ${password}\n`;

  const emailResult = await Promise.allSettled([
    sendMail({ subject: emailSubject, html, text, replyTo: email }),
  ]);

  if (emailResult[0].status === "rejected") {
    req.log.error({ err: emailResult[0].reason }, "Failed to send partner email");
  }

  if (!dbSaved) {
    res.status(502).json({ ok: false, error: "db_unavailable" });
    return;
  }

  res.json({
    ok: true,
    saved: dbSaved,
    emailSent: emailResult[0].status === "fulfilled",
  });
});

export default router;
