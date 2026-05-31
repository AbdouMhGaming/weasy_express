import { Router } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Report type detection ────────────────────────────────────────────────────

function detectReportType(text: string): "delivery_receipt" | "route_sheet" | "returns_list" | "unknown" {
  if (
    text.includes("Décharge de paiement") ||
    text.includes("Caisse expéditeur") ||
    text.includes("Liste des envois livrés")
  ) return "delivery_receipt";
  if (
    text.includes("Feuille de route") ||
    text.includes("feuille de route") ||
    text.includes("Création feuille") ||
    text.includes("Archive feuille")
  ) return "route_sheet";
  if (
    text.includes("Liste des retours") ||
    text.includes("retours à dispatcher")
  ) return "returns_list";
  return "unknown";
}

// ─── Date ─────────────────────────────────────────────────────────────────────

function extractDate(text: string): string {
  // "le DD-MM-YYYY" (Ecotrack standard header format)
  const frMatch = text.match(/le\s+(\d{2})-(\d{2})-(\d{4})/);
  if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
  // ISO YYYY-MM-DD embedded anywhere
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
    // Header: "#REFDATE\nCOUNT\nNET DA SENDER"
    // e.g. "#61122026-05-31\n16\n291300 DACP Station Oued Rhiou"
    const m = text.match(/#\d+\d{4}-\d{2}-\d{2}\n(\d+)\n/);
    if (m) return parseInt(m[1], 10);
  }
  if (type === "route_sheet") {
    // Tracking count is one-to-one with parcels in FDR
    if (trackingCount > 0) return trackingCount;
    // Fallback: try both header formats
    // New: phone\nPARCELS\nTOTAL\nDA\nDATE  → \d{10}\n(\d+)\n\d{4,}\nDA
    const mNew = text.match(/\d{10}\n(\d+)\n\d{4,}\s*\nDA\n/);
    if (mNew) return parseInt(mNew[1], 10);
    // Old: phone\n{PARCELS}{TOTAL} DA\nDATE  → non-greedy split
    const mOld = text.match(/\d{10}\n(\d{1,3}?)\d{4,}\s*DA\n/);
    if (mOld) return parseInt(mOld[1], 10);
  }
  if (type === "returns_list") {
    // "DateNombre de ColisStation\n2026-05-31\nCOUNT\n48.1 Agence..."
    const m = text.match(/\d{4}-\d{2}-\d{2}\n(\d+)\n\d+\.\d/);
    if (m) return parseInt(m[1], 10);
    const m2 = text.match(/DateNombre de ColisStation\n[\d-]+\n(\d+)\n/);
    if (m2) return parseInt(m2[1], 10);
  }
  return trackingCount;
}

// ─── DECHARGE amounts ─────────────────────────────────────────────────────────
// Row format (concatenated): {poids}.{2dp}{MONTANT}{3-digit-tarif}.000.000.00{...}
// Examples:
//   "0.001600600.000.000.000.001000"   → montant=1600, tarif=600
//   "6.5010650550.000.000.00100.0010000" → montant=10650, tarif=550
//   "18.8081250600.000.000.00700.0079950" → montant=81250, tarif=600
//
// The pattern captures montant only; tarif varies (500–999) so \d{3} covers it.

function extractDeliveryAmounts(text: string): { total: number; net: number } {
  // Net = shown in the reference header row: "\nNET DA SENDER"
  // e.g. "\n291300 DACP Station Oued Rhiou" or "\n26800 DAspotlight-store"
  const netM = text.match(/\n(\d+)\s*DA[A-Za-z\u00C0-\u017E]/);
  const net = netM ? parseInt(netM[1], 10) : 0;

  // Gross = sum of Montant column across all tracking rows
  // Pattern: poids(d+.dd) + MONTANT(digits) + tarif_3digits(.00) + surFact(0.00) + comm(0.00)
  const rowAmounts: number[] = [];
  for (const m of text.matchAll(/\d+\.\d{2}(\d+)\d{3}\.000\.000\.00/g)) {
    const n = parseInt(m[1], 10);
    if (n > 0 && n < 1_000_000) rowAmounts.push(n);
  }
  const total = rowAmounts.length > 0 ? rowAmounts.reduce((a, b) => a + b, 0) : net;
  return { total, net };
}

// ─── FDR total amount ─────────────────────────────────────────────────────────
// Route header contains the authoritative total in uppercase DA.
// New format: "1473920\nDA\n"  (separate lines)
// Old format: "119800 DA\n"    (space-separated)
// Row amounts use lowercase "Da" or none → won't match uppercase DA.

function extractRouteTotal(text: string): number {
  // All uppercase-DA occurrences: take the maximum (= route total)
  const vals = [...text.matchAll(/(\d{4,})\s*DA(?:\n|\b)/g)]
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n < 100_000_000);
  return vals.length > 0 ? Math.max(...vals) : 0;
}

// ─── LISTE-RETOUR amounts ─────────────────────────────────────────────────────
// Each tracking row ends with: MONTANT + REF_RETOUR (4 digits, same for all rows in this doc).
// Strategy: extract the return ref from "#NNNN" header, then match (\d{3,5}){ref} in text.
// Examples for ref=2322:
//   "AdrarReggane33002322" → amount=3300
//   "Tizi OuzouTadmait46002322" → amount=4600
//   "Sidi Bel\nAbbes\n6002322" → (on one line:) amount=600

function extractReturnAmounts(text: string): number {
  // 1. Find the return list reference number
  const refM = text.match(/#(\d{4})\b/);
  if (!refM) return 0;
  const ref = refM[1]; // e.g. "2322"

  // 2. Sum all amounts that appear just before the ref
  let total = 0;
  const pattern = new RegExp(`(\\d{3,5})${ref}`, "g");
  for (const m of text.matchAll(pattern)) {
    const n = parseInt(m[1], 10);
    if (n >= 200 && n <= 500_000) total += n;
  }
  return total;
}

// ─── Sender extraction ────────────────────────────────────────────────────────

function extractDeliverySender(text: string): string {
  // Header row: "#REFDATE\nCOUNT\nNET DA SENDER\n"
  // e.g. "291300 DACP Station Oued Rhiou" or "26800 DAspotlight-store"
  const m = text.match(/\n\d+\s*DA([A-Za-z\u00C0-\u017E][^\n]{1,120})/);
  if (m) return m[1].trim().slice(0, 255);
  return "";
}

function extractFDRSenders(text: string): string[] {
  // Each FDR tracking entry:
  //   EC{CODE}\n
  //   {SENDER_LINE1}\n
  //   [{SENDER_LINE2}\n]          (optional, e.g. "EMBALLAGE")
  //   [{SENDER_LINE3}\n]          (optional, e.g. "MAZOUNA")
  //   {PHONE_10DIGITS}\n
  //
  // Use non-greedy capture of 1–3 lines before the 10-digit phone.
  const senders = new Set<string>();
  for (const m of text.matchAll(/EC[A-Z0-9]{10,22}\n((?:[^\n]+\n){1,3}?)\d{10}\n/g)) {
    const raw = m[1]
      .replace(/\n/g, " ")
      .trim()
      // remove numeric-only "senders" (false positives)
      .replace(/^\d+$/, "");
    if (raw.length > 0 && raw.length < 120) senders.add(raw);
  }
  return [...senders];
}

function extractReturnSender(text: string): string {
  // FDR-style rows exist too; for returns the sender appears after "Livraison" or "Echange"
  // e.g. "LivraisonHIJABEبالحاج..." → captures "HIJABE" (stops at Arabic)
  // e.g. "Livraison\nBouchra\nShop\n..." → captures "Bouchra Shop"
  const m = text.match(/(?:Livraison|Echange)\n?([A-Za-z\u00C0-\u017E][^\n\u0600-\u06FF]{1,60})/);
  if (m) {
    // The match may span lines if sender is multi-word
    const parts = m[1].split("\n").slice(0, 2).join(" ").trim();
    return parts.slice(0, 255);
  }
  // Fallback: concatenated "LivraisonHIJABE..."
  const m2 = text.match(/(?:Livraison|Echange)([A-Za-z\u00C0-\u017E][^\u0600-\u06FF\n]{1,60})/);
  if (m2) return m2[1].trim().slice(0, 255);
  return "";
}

// ─── Station ──────────────────────────────────────────────────────────────────

function extractStation(text: string): string {
  // Station format: "48.1 Agence Oued Rhiou"
  // In FDR the station spans two lines: "48.1 Agence\nOued Rhiou\nWeasy\nExpress..."
  // In RETOUR it's on one line: "48.1 Agence Oued Rhiou\nTracking..."
  // Strategy: normalize newlines, then stop capture at "Weasy", "Tracking", or 10-digit phone
  const norm = text.replace(/\n/g, " ");
  const m = norm.match(/(\d+\.\d+\s+Agence[^,]+?)(?=\s+(?:Weasy|Tracking|\d{10}))/);
  if (m) return m[1].trim().replace(/\s+/g, " ").slice(0, 100);
  // Fallback: original text stops naturally at newline
  const m2 = text.match(/(\d+\.\d+\s+Agence[^\n,]{1,80})/);
  if (m2) return m2[1].trim().slice(0, 100);
  return "";
}

// ─── Wilayas ──────────────────────────────────────────────────────────────────

// Includes both accented and unaccented spellings found in Ecotrack PDFs
const KNOWN_WILAYAS = [
  "Adrar", "Chlef", "Laghouat", "Oum El Bouaghi", "Batna",
  "Béjaïa", "Biskra", "Béchar", "Blida", "Bouira",
  "Tamanrasset", "Tébessa", "Tlemcen", "Tiaret", "Tizi Ouzou",
  "Alger", "Djelfa", "Jijel", "Sétif", "Saïda", "Skikda",
  "Sidi Bel Abbès", "Annaba", "Guelma", "Constantine", "Médéa",
  "Mostaganem", "M'Sila", "Mascara", "Ouargla", "Oran",
  "El Bayadh", "Illizi",
  "Bordj Bou Arréridj", "Bordj Bou Arreridj",
  "Boumerdès", "El Tarf", "Tindouf", "Tissemsilt", "El Oued",
  "Khenchela", "Souk Ahras", "Tipaza", "Mila",
  "Aïn Defla", "Ain Defla", "Naâma",
  "Aïn Témouchent", "Ain Temouchent",
  "Ghardaïa", "Relizane",
  "Timimoun", "Bordj Badji Mokhtar", "Ouled Djellal",
  "Béni Abbès", "Beni Abbes",
  "In Salah", "In Guezzam", "Touggourt", "Djanet",
  "El M'Ghair", "El Meniaa",
];

function extractWilayas(text: string): string[] {
  // Normalize newlines to spaces so multi-word wilayas split across lines still match
  const norm = text.replace(/\n/g, " ");
  return [...new Set(KNOWN_WILAYAS.filter((w) => norm.includes(w)))];
}

// ─── Upload ───────────────────────────────────────────────────────────────────

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
    const station       = extractStation(text);

    let totalAmount = 0;
    let netAmount   = 0;
    let senderName  = "";

    if (reportType === "delivery_receipt") {
      const { total, net } = extractDeliveryAmounts(text);
      totalAmount = total;
      netAmount   = net;
      senderName  = extractDeliverySender(text);
    } else if (reportType === "route_sheet") {
      totalAmount = extractRouteTotal(text);
      // Store all unique senders (may be many for a large route sheet)
      const allSenders = extractFDRSenders(text);
      if (allSenders.length <= 3) {
        senderName = allSenders.join(", ");
      } else {
        senderName = `${allSenders.slice(0, 2).join(", ")} (+${allSenders.length - 2} autres)`;
      }
    } else if (reportType === "returns_list") {
      totalAmount = extractReturnAmounts(text);
      senderName  = extractReturnSender(text);
    }

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
          totalAmount,
          netAmount,
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
      totalAmount,
      netAmount,
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
          COUNT(*)                                                                          AS total_reports,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_parcels  ELSE 0 END)  AS total_delivered,
          SUM(CASE WHEN report_type = 'route_sheet'      THEN total_parcels  ELSE 0 END)  AS total_dispatched,
          SUM(CASE WHEN report_type = 'returns_list'     THEN total_parcels  ELSE 0 END)  AS total_returns,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN net_amount_dzd   ELSE 0 END) AS total_net_dzd,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_amount_dzd ELSE 0 END) AS total_cod_dzd,
          SUM(CASE WHEN report_type = 'route_sheet'      THEN total_amount_dzd ELSE 0 END) AS total_dispatched_dzd
        FROM office_reports
      `);

      // Top senders: only from delivery receipts (one sender per receipt → meaningful)
      const [senders] = await conn.execute(`
        SELECT
          sender_name,
          COUNT(*)           AS report_count,
          SUM(total_parcels) AS total_parcels,
          SUM(net_amount_dzd) AS net_dzd
        FROM office_reports
        WHERE report_type = 'delivery_receipt'
          AND sender_name IS NOT NULL AND sender_name != ''
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
        topSenders:    senders,
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
