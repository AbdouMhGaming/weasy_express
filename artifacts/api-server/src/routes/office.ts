import { Router } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function detectReportType(text: string): "delivery_receipt" | "route_sheet" | "returns_list" | "unknown" {
  if (text.includes("Décharge de paiement") || text.includes("Caisse expéditeur") || text.includes("Liste des envois livrés")) return "delivery_receipt";
  if (text.includes("Feuille de route") || text.includes("feuille de route") || text.includes("Création feuille")) return "route_sheet";
  if (text.includes("Liste des retours") || text.includes("retours à dispatcher") || text.includes("LISTE-RETOUR")) return "returns_list";
  return "unknown";
}

function extractDate(text: string): string {
  const match = text.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : new Date().toISOString().split("T")[0];
}

function extractNumberAfter(text: string, keyword: string): number {
  const idx = text.indexOf(keyword);
  if (idx === -1) return 0;
  const after = text.slice(idx + keyword.length, idx + keyword.length + 100);
  const match = after.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function extractTotalAmount(text: string): number {
  const matches = [...text.matchAll(/(\d[\d\s]{2,})\s*(?:DA|DZD)/g)];
  if (!matches.length) return 0;
  const amounts = matches
    .map(m => parseInt(m[1].replace(/\s/g, ""), 10))
    .filter(n => !isNaN(n) && n > 0);
  return amounts.length ? Math.max(...amounts) : 0;
}

function extractNetAmount(text: string): number {
  const summaryMatch = text.match(/(\d+)\s*\n\s*\n/g);
  if (summaryMatch && summaryMatch.length > 0) {
    const nums = summaryMatch.map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 1000);
    if (nums.length) return Math.min(...nums);
  }
  const netMatch = text.match(/Net\s*\n[\s\S]{0,200}?(\d{3,})\s*$/m);
  if (netMatch) return parseInt(netMatch[1], 10);
  return 0;
}

function extractTrackingNumbers(text: string): string[] {
  const matches = text.match(/EC[A-Z0-9]{10,22}/g) ?? [];
  return [...new Set(matches)];
}

function extractStation(text: string): string {
  const match = text.match(/(\d+\.\d+\s+Agence[^\n]{0,80})/);
  if (match) return match[1].trim().slice(0, 255);
  const match2 = text.match(/Station\s*:\s*([^\n]{1,80})/);
  return match2 ? match2[1].trim().slice(0, 255) : "";
}

function extractSenderName(text: string): string {
  const match = text.match(/Expéditeur\s*\n\s*([^\n]{1,100})/);
  return match ? match[1].trim().slice(0, 255) : "";
}

const KNOWN_WILAYAS = [
  "Adrar","Chlef","Laghouat","Oum El Bouaghi","Batna","Béjaïa","Biskra","Béchar",
  "Blida","Bouira","Tamanrasset","Tébessa","Tlemcen","Tiaret","Tizi Ouzou","Alger",
  "Djelfa","Jijel","Sétif","Saïda","Skikda","Sidi Bel Abbès","Annaba","Guelma",
  "Constantine","Médéa","Mostaganem","M'Sila","Mascara","Ouargla","Oran","El Bayadh",
  "Illizi","Bordj Bou Arréridj","Boumerdès","El Tarf","Tindouf","Tissemsilt","El Oued",
  "Khenchela","Souk Ahras","Tipaza","Mila","Ain Defla","Naâma","Ain Temouchent",
  "Ghardaïa","Relizane","Timimoun","Bordj Badji Mokhtar","Ouled Djellal","Béni Abbès",
  "In Salah","In Guezzam","Touggourt","Djanet","El M'Ghair","El Meniaa"
];

function extractWilayas(text: string): string[] {
  return [...new Set(KNOWN_WILAYAS.filter(w => text.includes(w)))];
}

router.post("/office/reports/upload", adminAuth, upload.single("pdf"), async (req, res) => {
  const authReq = req as AuthedRequest;
  const role = authReq.adminRole ?? "";
  if (!["admin", "office"].includes(role)) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  const file = req.file;
  if (!file) { res.status(400).json({ ok: false, error: "no_file" }); return; }

  try {
    const pdfParse = (await import("pdf-parse")).default;
    const pdfData = await pdfParse(file.buffer);
    const text = pdfData.text;

    const reportType = detectReportType(text);
    const reportDate = extractDate(text);
    const totalParcels = extractNumberAfter(text, "Nombre de Colis");
    const totalAmount = extractTotalAmount(text);
    const netAmount = reportType === "delivery_receipt" ? extractNetAmount(text) : 0;
    const trackingNumbers = extractTrackingNumbers(text);
    const station = extractStation(text);
    const senderName = extractSenderName(text);
    const wilayas = extractWilayas(text);
    const finalParcels = totalParcels > 0 ? totalParcels : trackingNumbers.length;

    const conn = await pool.getConnection();
    try {
      await conn.execute(
        `INSERT INTO office_reports (report_type, file_name, report_date, total_parcels, total_amount_dzd, net_amount_dzd, station, sender_name, tracking_numbers, wilayas, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reportType, file.originalname.slice(0, 255), reportDate, finalParcels,
         totalAmount, netAmount, station, senderName,
         trackingNumbers.join(","), wilayas.join(","), authReq.adminUsername ?? ""]
      );
    } finally { conn.release(); }

    res.json({
      ok: true, reportType, reportDate,
      totalParcels: finalParcels, totalAmount, netAmount,
      trackingCount: trackingNumbers.length, wilayas,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to process PDF");
    res.status(500).json({ ok: false, error: "pdf_error", detail: String(err) });
  }
});

router.get("/office/reports", adminAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  if (!["admin", "office"].includes(authReq.adminRole ?? "")) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute("SELECT * FROM office_reports ORDER BY created_at DESC LIMIT 100");
      res.json({ ok: true, reports: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch reports");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.get("/office/reports/stats", adminAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  if (!["admin", "office"].includes(authReq.adminRole ?? "")) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [summary] = await conn.execute(`
        SELECT
          COUNT(*) as total_reports,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_parcels ELSE 0 END) as total_delivered,
          SUM(CASE WHEN report_type = 'route_sheet' THEN total_parcels ELSE 0 END) as total_dispatched,
          SUM(CASE WHEN report_type = 'returns_list' THEN total_parcels ELSE 0 END) as total_returns,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN net_amount_dzd ELSE 0 END) as total_net_dzd,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_amount_dzd ELSE 0 END) as total_cod_dzd
        FROM office_reports
      `);
      const [recent] = await conn.execute(
        "SELECT * FROM office_reports ORDER BY created_at DESC LIMIT 10"
      );
      const stats = (summary as Array<Record<string, unknown>>)[0] ?? {};
      res.json({
        ok: true,
        stats: {
          totalReports: Number(stats.total_reports ?? 0),
          totalDelivered: Number(stats.total_delivered ?? 0),
          totalDispatched: Number(stats.total_dispatched ?? 0),
          totalReturns: Number(stats.total_returns ?? 0),
          totalNetDzd: Number(stats.total_net_dzd ?? 0),
          totalCodDzd: Number(stats.total_cod_dzd ?? 0),
        },
        recentReports: recent,
      });
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch office stats");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

router.delete("/office/reports/:id", adminAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  if (authReq.adminRole !== "admin") {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      await conn.execute("DELETE FROM office_reports WHERE id = ?", [id]);
      res.json({ ok: true });
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to delete report");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

export default router;
