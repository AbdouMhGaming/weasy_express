import { Router } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Detection ────────────────────────────────────────────────────────────────

function detectReportType(text: string): "delivery_receipt" | "route_sheet" | "returns_list" | "unknown" {
  if (
    text.includes("Décharge de paiement") ||
    text.includes("Caisse expéditeur") ||
    text.includes("Liste des envois livrés")
  ) return "delivery_receipt";
  if (
    text.includes("Feuille de route") ||
    text.includes("feuille de route") ||
    text.includes("Création feuille")
  ) return "route_sheet";
  if (
    text.includes("Liste des retours") ||
    text.includes("retours à dispatcher") ||
    text.includes("LISTE-RETOUR")
  ) return "returns_list";
  return "unknown";
}

// ─── Date ─────────────────────────────────────────────────────────────────────

function extractDate(text: string): string {
  // "le DD-MM-YYYY" format used in Ecotrack PDFs
  const frMatch = text.match(/le\s+(\d{2})-(\d{2})-(\d{4})/);
  if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
  // ISO YYYY-MM-DD embedded in reference line or elsewhere
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : new Date().toISOString().split("T")[0];
}

// ─── Tracking numbers ─────────────────────────────────────────────────────────

function extractTrackingNumbers(text: string): string[] {
  return [...new Set(text.match(/EC[A-Z0-9]{10,22}/g) ?? [])];
}

// ─── Parcel count ─────────────────────────────────────────────────────────────

function extractParcels(text: string, type: string, trackingCount: number): number {
  if (type === "delivery_receipt") {
    // Format in PDF: "#REFDATE\nCOUNT\nAMOUNT DA..."
    // e.g. "#59952026-05-23\n3\n26800 DAspotlight-store"
    const m = text.match(/#\d+\d{4}-\d{2}-\d{2}\n(\d+)\n/);
    if (m) return parseInt(m[1], 10);
  }

  if (type === "route_sheet") {
    // Count EC tracking codes — one per parcel, most reliable for FDR
    if (trackingCount > 0) return trackingCount;
    // Fallback: extract from concatenated "{N}{AMOUNT} DA" line after 10-digit phone
    const m = text.match(/\d{10}\n(\d{1,3})\d{4,}\s*DA/);
    if (m) return parseInt(m[1], 10);
  }

  if (type === "returns_list") {
    // Format: "DateNombre de ColisStation\n2026-05-23\n2\n48.1 Agence..."
    // Station line starts with digits like "48.1"
    const m = text.match(/\d{4}-\d{2}-\d{2}\n(\d+)\n\d+\.\d/);
    if (m) return parseInt(m[1], 10);
    // Fallback: explicit column header
    const m2 = text.match(/DateNombre de ColisStation\n[\d-]+\n(\d+)\n/);
    if (m2) return parseInt(m2[1], 10);
  }

  return trackingCount;
}

// ─── Amounts ──────────────────────────────────────────────────────────────────

interface Amounts { total: number; net: number }

function extractAmounts(text: string, type: string, wilayas: string[]): Amounts {
  if (type === "delivery_receipt") {
    // Net = standalone number just before the page timestamp
    // e.g. "\n26800\n2026-05-23 13:25:54"
    const netM = text.match(/\n(\d{4,})\n\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/);
    const net = netM ? parseInt(netM[1], 10) : 0;

    // Gross = sum of individual Montant fields in tracking rows
    // Row format: "...0.00{MONTANT}800.00..." (weight | montant | tarif livraison=800)
    const rowAmounts: number[] = [];
    for (const m of text.matchAll(/0\.00(\d+)800\.00/g)) {
      const n = parseInt(m[1], 10);
      if (n > 0) rowAmounts.push(n);
    }
    const total = rowAmounts.length > 0
      ? rowAmounts.reduce((a, b) => a + b, 0)
      : net;

    return { total, net };
  }

  if (type === "route_sheet") {
    // FDR tracking rows end with: 10-digit-phone + AMOUNT + Wilaya (capital letter)
    // e.g. "066662510119800TébessaBir El Ater"
    // → phone=0666625101, amount=19800, next char='T' (Tébessa)
    const amounts: number[] = [];
    for (const m of text.matchAll(/\d{10}(\d{3,6})[A-ZÀÂÉÈÊËÎÏ]/g)) {
      const n = parseInt(m[1], 10);
      if (n >= 100 && n <= 500000) amounts.push(n);
    }
    if (amounts.length > 0) return { total: amounts.reduce((a, b) => a + b, 0), net: 0 };
    return { total: 0, net: 0 };
  }

  if (type === "returns_list") {
    // Returns don't involve cash collection but we track declared values.
    // Amounts appear on wilaya-commune lines, e.g.:
    //   "TlemcenFellaoucene30002308"  → amount=3000, ref=2308
    //   "KhenchelaKhenchela3100"      → amount=3100
    let total = 0;
    const lines = text.split("\n");
    for (const line of lines) {
      const hasWilaya = wilayas.some((w) => line.includes(w));
      if (!hasWilaya) continue;
      const nums = [...line.matchAll(/(\d+)/g)]
        .map((m) => parseInt(m[1], 10))
        .filter((n) => n >= 200 && n < 100000 && n.toString().length < 10);
      if (nums.length === 0) continue;
      const last = nums[nums.length - 1];
      const secondLast = nums[nums.length - 2];
      // If last number is a short 4-digit ref (< 5000) and there's a larger amount before it
      if (secondLast !== undefined && last < 5000 && secondLast >= 500) {
        total += secondLast;
      } else {
        total += last;
      }
    }
    return { total, net: 0 };
  }

  return { total: 0, net: 0 };
}

// ─── Sender ───────────────────────────────────────────────────────────────────

function extractSender(text: string, type: string): string {
  if (type === "delivery_receipt") {
    // "26800 DAspotlight-store" — sender name follows directly after "DA"
    const m = text.match(/\d+\s*DA([a-zA-Z][a-zA-Z0-9\-_. ]{1,80})/);
    if (m) return m[1].trim().slice(0, 255);
  }

  if (type === "route_sheet") {
    // FDR row: "EC...\nSOFIA STORE\n0774545021\n..."
    const m = text.match(/EC[A-Z0-9]{10,22}\n([A-Z0-9][^\n]{1,60})\n\d{10}/);
    if (m) return m[1].trim().slice(0, 255);
    // Fallback: all-uppercase word(s) on the line after EC code
    const m2 = text.match(/EC[A-Z0-9]{10,22}\n([A-Z][A-Z ]+)\n/);
    if (m2) return m2[1].trim().slice(0, 255);
  }

  if (type === "returns_list") {
    // "LivraisonBouchra Shop" or "Livraison\nBouchra\nShop\n..."
    // Capture lines after "Livraison" up to Arabic text
    const m = text.match(/Livraison\n([A-Za-z][^\u0600-\u06FF\n]+(?:\n[A-Za-z][^\u0600-\u06FF\n]+)?)/);
    if (m) {
      const parts = m[1].split("\n").slice(0, 2).join(" ").trim();
      return parts.slice(0, 255);
    }
    // Fallback: "LivraisonXXX" concatenated
    const m2 = text.match(/Livraison([A-Za-z][a-zA-Z ]{1,60})/);
    if (m2) return m2[1].trim().slice(0, 255);
  }

  return "";
}

// ─── Station ──────────────────────────────────────────────────────────────────

function extractStation(text: string): string {
  // "48.1 Agence Oued Rhiou" — standard Ecotrack agency format
  const m = text.match(/(\d+\.\d+\s+Agence[^\n,]{1,80})/);
  if (m) return m[1].trim().slice(0, 255);
  return "";
}

// ─── Wilayas ──────────────────────────────────────────────────────────────────

const KNOWN_WILAYAS = [
  "Adrar", "Chlef", "Laghouat", "Oum El Bouaghi", "Batna", "Béjaïa", "Biskra", "Béchar",
  "Blida", "Bouira", "Tamanrasset", "Tébessa", "Tlemcen", "Tiaret", "Tizi Ouzou", "Alger",
  "Djelfa", "Jijel", "Sétif", "Saïda", "Skikda", "Sidi Bel Abbès", "Annaba", "Guelma",
  "Constantine", "Médéa", "Mostaganem", "M'Sila", "Mascara", "Ouargla", "Oran", "El Bayadh",
  "Illizi", "Bordj Bou Arréridj", "Boumerdès", "El Tarf", "Tindouf", "Tissemsilt", "El Oued",
  "Khenchela", "Souk Ahras", "Tipaza", "Mila", "Ain Defla", "Naâma", "Ain Temouchent",
  "Ghardaïa", "Relizane", "Timimoun", "Bordj Badji Mokhtar", "Ouled Djellal", "Béni Abbès",
  "In Salah", "In Guezzam", "Touggourt", "Djanet", "El M'Ghair", "El Meniaa",
];

function extractWilayas(text: string): string[] {
  return [...new Set(KNOWN_WILAYAS.filter((w) => text.includes(w)))];
}

// ─── Upload route ─────────────────────────────────────────────────────────────

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

    const reportType    = detectReportType(text);
    const reportDate    = extractDate(text);
    const trackingNums  = extractTrackingNumbers(text);
    const wilayas       = extractWilayas(text);
    const totalParcels  = extractParcels(text, reportType, trackingNums.length);
    const { total, net } = extractAmounts(text, reportType, wilayas);
    const station       = extractStation(text);
    const senderName    = extractSender(text, reportType);

    const conn = await pool.getConnection();
    try {
      await conn.execute(
        `INSERT INTO office_reports
           (report_type, file_name, report_date, total_parcels,
            total_amount_dzd, net_amount_dzd, station, sender_name,
            tracking_numbers, wilayas, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reportType,
          file.originalname.slice(0, 255),
          reportDate,
          totalParcels,
          total,
          net,
          station,
          senderName,
          trackingNums.join(","),
          wilayas.join(","),
          authReq.adminUsername ?? "",
        ],
      );
    } finally { conn.release(); }

    res.json({
      ok: true,
      reportType,
      reportDate,
      totalParcels,
      totalAmount: total,
      netAmount: net,
      trackingCount: trackingNums.length,
      wilayas,
      station,
      senderName,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to process PDF");
    res.status(500).json({ ok: false, error: "pdf_error", detail: String(err) });
  }
});

// ─── List reports ─────────────────────────────────────────────────────────────

router.get("/office/reports", adminAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  if (!["admin", "office"].includes(authReq.adminRole ?? "")) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT * FROM office_reports ORDER BY created_at DESC LIMIT 100",
      );
      res.json({ ok: true, reports: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch reports");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ─── Stats ────────────────────────────────────────────────────────────────────

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
          COUNT(*)                                                                       AS total_reports,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_parcels  ELSE 0 END) AS total_delivered,
          SUM(CASE WHEN report_type = 'route_sheet'      THEN total_parcels  ELSE 0 END) AS total_dispatched,
          SUM(CASE WHEN report_type = 'returns_list'     THEN total_parcels  ELSE 0 END) AS total_returns,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN net_amount_dzd   ELSE 0 END) AS total_net_dzd,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_amount_dzd ELSE 0 END) AS total_cod_dzd,
          SUM(CASE WHEN report_type = 'route_sheet'      THEN total_amount_dzd ELSE 0 END) AS total_dispatched_dzd
        FROM office_reports
      `);

      const [senders] = await conn.execute(`
        SELECT sender_name,
               COUNT(*)           AS report_count,
               SUM(total_parcels) AS total_parcels,
               SUM(CASE WHEN report_type = 'delivery_receipt' THEN net_amount_dzd ELSE 0 END) AS net_dzd
        FROM office_reports
        WHERE sender_name IS NOT NULL AND sender_name != ''
        GROUP BY sender_name
        ORDER BY total_parcels DESC
        LIMIT 8
      `);

      const [recent] = await conn.execute(
        "SELECT * FROM office_reports ORDER BY created_at DESC LIMIT 10",
      );

      const s = (summary as Array<Record<string, unknown>>)[0] ?? {};
      res.json({
        ok: true,
        stats: {
          totalReports:       Number(s.total_reports      ?? 0),
          totalDelivered:     Number(s.total_delivered    ?? 0),
          totalDispatched:    Number(s.total_dispatched   ?? 0),
          totalReturns:       Number(s.total_returns      ?? 0),
          totalNetDzd:        Number(s.total_net_dzd      ?? 0),
          totalCodDzd:        Number(s.total_cod_dzd      ?? 0),
          totalDispatchedDzd: Number(s.total_dispatched_dzd ?? 0),
          fraisLivraison:     Number(s.total_cod_dzd ?? 0) - Number(s.total_net_dzd ?? 0),
        },
        topSenders: senders,
        recentReports: recent,
      });
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch office stats");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ─── Delete ───────────────────────────────────────────────────────────────────

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
