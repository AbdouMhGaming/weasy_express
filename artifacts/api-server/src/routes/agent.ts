import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { sendMail, escapeHtml } from "../lib/mailer";

const router: IRouter = Router();
const VALID_START_DATES = new Set(["immediately", "after_week", "after_month"]);

function text(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

router.post("/agent-applications", async (req, res) => {
  const body = req.body ?? {};
  const fullName = text(body.fullName, 150);
  const wilayaCode = text(body.wilayaCode, 10).toUpperCase();
  const wilayaName = text(body.wilayaName, 100);
  const commune = text(body.commune, 100);
  const phone = text(body.phone, 50);
  const email = text(body.email, 200).toLowerCase();
  const previousExperience = body.previousExperience === true;
  const experienceYears = previousExperience ? Number(body.experienceYears) : null;
  const hasCommercialSpace = body.hasCommercialSpace === true;
  const startAvailability = text(body.startAvailability, 20);
  const errors: string[] = [];

  if (!fullName) errors.push("fullName");
  if (!/^DZ(?:0[1-9]|[1-4][0-9]|5[0-8])$/.test(wilayaCode) || !wilayaName) errors.push("wilaya");
  if (!commune) errors.push("commune");
  if (!phone) errors.push("phone");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if (previousExperience && (experienceYears === null || !Number.isInteger(experienceYears) || experienceYears < 0 || experienceYears > 80)) errors.push("experienceYears");
  if (!VALID_START_DATES.has(startAvailability)) errors.push("startAvailability");
  if (errors.length) {
    res.status(400).json({ ok: false, error: "invalid_fields", fields: errors });
    return;
  }

  try {
    const [existing] = await pool.execute(
      "SELECT id FROM agent_applications WHERE email=? OR phone=? LIMIT 1",
      [email, phone],
    ) as any;
    if (existing.length) {
      res.status(409).json({ ok: false, error: "duplicate_application" });
      return;
    }
    const [result] = await pool.execute(
      `INSERT INTO agent_applications
       (full_name, wilaya_code, wilaya_name, commune, phone, email, previous_experience,
        experience_years, has_commercial_space, start_availability)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        fullName, wilayaCode, wilayaName, commune, phone, email,
        previousExperience ? 1 : 0, experienceYears, hasCommercialSpace ? 1 : 0, startAvailability,
      ],
    ) as any;

    const html = `
      <div style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;">
        <div style="background:linear-gradient(135deg,#E10600,#B80500);padding:24px;border-radius:12px 12px 0 0;color:#fff;">
          <h2 style="margin:0;font-size:20px;">Nouvelle demande d'agent</h2>
          <p style="margin:6px 0 0;opacity:.9;">${escapeHtml(fullName)}</p>
        </div>
        <div style="padding:24px;border:1px solid #eee;border-top:0;">
          <p><strong>Wilaya :</strong> ${escapeHtml(wilayaName)}</p>
          <p><strong>Commune :</strong> ${escapeHtml(commune)}</p>
          <p><strong>Téléphone :</strong> ${escapeHtml(phone)}</p>
          <p><strong>Email :</strong> ${escapeHtml(email)}</p>
          <p><strong>Expérience :</strong> ${previousExperience ? `Oui (${experienceYears} ans)` : "Non"}</p>
          <p><strong>Local commercial :</strong> ${hasCommercialSpace ? "Oui" : "Non"}</p>
          <p><strong>Disponibilité :</strong> ${escapeHtml(startAvailability)}</p>
        </div>
      </div>
    `;
    await Promise.allSettled([
      sendMail({
        subject: `[Weasy Express] Nouvelle demande d'agent - ${fullName}`,
        html,
        text: `Nouvelle demande d'agent\n\nNom: ${fullName}\nWilaya: ${wilayaName}\nCommune: ${commune}\nTéléphone: ${phone}\nEmail: ${email}`,
        replyTo: email,
      }),
    ]);
    res.status(201).json({ ok: true, id: Number(result.insertId) });
  } catch (err) {
    req.log.error({ err }, "Failed to save agent application");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

export default router;