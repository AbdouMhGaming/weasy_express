import { Router } from "express";
import multer from "multer";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Ligature normalisation ───────────────────────────────────────────────────
function normaliseLigatures(text: string): string {
  return text
    .replace(/ﬀ/g, "ff").replace(/ﬁ/g, "fi").replace(/ﬂ/g, "fl")
    .replace(/ﬃ/g, "ffi").replace(/ﬄ/g, "ffl").replace(/ﬅ/g, "st").replace(/ﬆ/g, "st");
}

// ─── Report type detection ────────────────────────────────────────────────────
function detectReportType(text: string): "delivery_receipt" | "route_sheet" | "returns_list" | "unknown" {
  if (text.includes("Décharge de paiement") || text.includes("Caisse expéditeur") || text.includes("Liste des envois livrés"))
    return "delivery_receipt";
  if (text.includes("Feuille de route") || text.includes("feuille de route") || text.includes("Création feuille") || text.includes("Archive feuille"))
    return "route_sheet";
  if (text.includes("Liste des retours") || text.includes("retours à dispatcher"))
    return "returns_list";
  return "unknown";
}

// ─── Date ─────────────────────────────────────────────────────────────────────
function extractDate(text: string): string {
  const frMatch = text.match(/le\s+(\d{2})-(\d{2})-(\d{4})/);
  if (frMatch) return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : new Date().toISOString().split("T")[0];
}

// ─── Tracking numbers ─────────────────────────────────────────────────────────
// EC codes always end with a digit sequence. We strip:
//   - Reference field suffixes like "CX..." that immediately follow the code
//   - Trailing uppercase letters that bleed from recipient/sender names
function extractTrackingNumbers(text: string): string[] {
  const raw = text.match(/EC[A-Z0-9]{10,18}/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (let n of raw) {
    n = n.replace(/CX\w*$/, "");          // strip reference field (CX2930...)
    n = n.replace(/[A-Z]+$/, "");        // strip trailing uppercase from names
    if (n.length < 12) continue;
    if (!seen.has(n)) { seen.add(n); result.push(n); }
  }
  return result;
}

// ─── Recipient extraction — delivery_receipt ──────────────────────────────────
// Strips phone number contamination; handles multi-line names (Mohamed\nghelam).
function extractRecipientNames(text: string, trackingNums: string[]): string {
  if (trackingNums.length === 0) return "";
  const recipients: string[] = [];
  for (const code of trackingNums) {
    const idx = text.indexOf(code);
    if (idx === -1) { recipients.push(""); continue; }
    const after = text.slice(idx + code.length, idx + code.length + 400);
    const rawLines = after.split("\n").map(l => l.trim()).filter(l => l.length > 0);

    const nameParts: string[] = [];
    for (const line of rawLines.slice(0, 6)) {
      // Strip Algerian phone number (0 + 9 digits) and everything after
      const stripped = line.replace(/\s*0\d{8,9}.*$/, "").trim();
      if (!stripped || stripped.length < 2) break;
      if (!/^\d+[\.,]?\d*$/.test(stripped) && !/^\d{8,}$/.test(stripped) && !/^[\d\s\.,]+$/.test(stripped)) {
        if (/[A-Za-z\u00C0-\u017E]{2,}/.test(stripped) || /[\u0600-\u06FF]{2,}/.test(stripped)) {
          nameParts.push(stripped);
          if (nameParts.join(" ").length >= 4) break;
        } else {
          break;
        }
      } else {
        break;
      }
    }
    recipients.push(nameParts.join(" ").trim().slice(0, 100));
  }
  return recipients.join("|");
}

// ─── Recipient extraction — returns_list ──────────────────────────────────────
// Returns_list format has Arabic recipient names. Two layouts:
//   Single-line: EC... REF Livraison SENDER RECIPIENT_ARABIC PHONE WILAYA...
//   Multi-line:  EC... Livraison\nSenderLine(s)\nRecipient_ARABIC phone wilaya...
function extractReturnsRecipientNames(text: string, trackingNums: string[]): string {
  if (trackingNums.length === 0) return "";
  const recipients: string[] = [];
  for (const code of trackingNums) {
    const idx = text.indexOf(code);
    if (idx === -1) { recipients.push(""); continue; }
    const after = text.slice(idx + code.length, idx + code.length + 500);

    // Single-line: Arabic text immediately before a 10-digit phone number
    const arabicBeforePhone = after.match(/([\u0600-\u06FF][\u0600-\u06FF\s]{1,50}?)(?=\s*\d{10})/);
    if (arabicBeforePhone) {
      recipients.push(arabicBeforePhone[1].trim().slice(0, 100));
      continue;
    }
    // Multi-line: first line that contains Arabic characters
    const lines = after.split("\n").map(s => s.trim()).filter(Boolean);
    let found = "";
    for (const line of lines.slice(0, 10)) {
      if (/[\u0600-\u06FF]{2,}/.test(line)) {
        // Strip phone number and trailing content
        found = line.replace(/\s*\d{10}.*$/, "").trim().slice(0, 100);
        break;
      }
    }
    recipients.push(found);
  }
  return recipients.join("|");
}

// ─── Parcel count ─────────────────────────────────────────────────────────────
function extractParcels(text: string, type: string, trackingCount: number): number {
  if (type === "delivery_receipt") {
    const m = text.match(/#\d+\d{4}-\d{2}-\d{2}\n(\d+)\n/);
    if (m) return parseInt(m[1], 10);
  }
  if (type === "route_sheet") {
    const mNew = text.match(/\d{10}\n(\d+)\n\d{4,}\s*\nDA\n/);
    if (mNew) return parseInt(mNew[1], 10);
    const mOld = text.match(/\d{10}\n(\d{1,3}?)\d{4,}\s*DA\n/);
    if (mOld) return parseInt(mOld[1], 10);
    if (trackingCount > 0) return trackingCount;
  }
  if (type === "returns_list") {
    const m = text.match(/\d{4}-\d{2}-\d{2}\n(\d+)\n\d+\.\d/);
    if (m) return parseInt(m[1], 10);
    const m2 = text.match(/DateNombre de ColisStation\n[\d-]+\n(\d+)\n/);
    if (m2) return parseInt(m2[1], 10);
  }
  return trackingCount;
}

// ─── DECHARGE amounts ─────────────────────────────────────────────────────────
function extractDeliveryAmounts(text: string): { total: number; net: number; frais: number } {
  const netM = text.match(/\n(\d+)\s*DA[A-Za-z\u00C0-\u017E\u0600-\u06FF]/);
  const net = netM ? parseInt(netM[1], 10) : 0;

  const rowAmounts: number[] = [];
  let frais = 0;
  for (const m of text.matchAll(/\d+\.\d{2}(\d+)(\d{3})\.000\.000\.00/g)) {
    const montant = parseInt(m[1], 10);
    const tarifLiv = parseInt(m[2], 10);
    if (montant > 0 && montant < 1_000_000) rowAmounts.push(montant);
    if (tarifLiv >= 100 && tarifLiv <= 999) frais += tarifLiv;
  }
  const total = rowAmounts.length > 0 ? rowAmounts.reduce((a, b) => a + b, 0) : net;
  return { total, net, frais };
}

// ─── FDR total amount ─────────────────────────────────────────────────────────
function extractRouteTotal(text: string): number {
  const mNew = text.match(/\d{10}\n(\d+)\n(\d{4,})\s*\nDA\n/);
  if (mNew) return parseInt(mNew[2], 10);
  const mOld = text.match(/\d{10}\n\d{1,4}(\d{4,})\s*DA\n/);
  if (mOld) return parseInt(mOld[1], 10);
  const vals = [...text.matchAll(/(\d{4,})\s*DA(?:\n|\b)/g)]
    .map(m => parseInt(m[1], 10)).filter(n => n < 100_000_000);
  return vals.length > 0 ? Math.max(...vals) : 0;
}

// ─── LISTE-RETOUR amounts ─────────────────────────────────────────────────────
function extractReturnAmounts(text: string): number {
  const refM = text.match(/#(\d{4})\b/);
  if (!refM) return 0;
  const ref = refM[1];
  let total = 0;
  const pattern = new RegExp(`(\\d{3,5})${ref}`, "g");
  for (const m of text.matchAll(pattern)) {
    const n = parseInt(m[1], 10);
    if (n >= 200 && n <= 500_000) total += n;
  }
  return total;
}

// ─── Sender extraction — delivery_receipt ─────────────────────────────────────
function extractDeliverySender(text: string): string {
  const m = text.match(/\n\d+\s*DA([A-Za-z\u00C0-\u017E\u0600-\u06FF][^\n]{1,120})/);
  if (m) return m[1].trim().slice(0, 255);
  return "";
}

// ─── Sender extraction — FDR (route_sheet) ───────────────────────────────────
function extractFDRSenders(text: string): string[] {
  const senders = new Set<string>();
  for (const m of text.matchAll(/EC[A-Z0-9]{10,22}\n((?:[^\n]+\n){1,3}?)\d{10}\n/g)) {
    const raw = m[1].replace(/\n/g, " ").trim().replace(/^\d+$/, "");
    if (raw.length > 0 && raw.length < 120) senders.add(raw);
  }
  return [...senders];
}

// ─── Sender extraction — returns_list ────────────────────────────────────────
// Supports two layouts:
//   Multi-line: Livraison\nSenderLine1\nSenderLine2\nARABIC_RECIPIENT
//   Single-line: LivraisonSENDERARABIC_RECIPIENT or LivraisonSENDER0PHONE...
function extractReturnSender(text: string): string {
  // Multi-line: Livraison/Echange on its own, then Latin sender line(s)
  const multiMatch = text.match(/(?:Livraison|Echange)\n((?:[A-Za-z\u00C0-\u017E][^\n]{0,80}\n){1,3})/);
  if (multiMatch) {
    const lines = multiMatch[1].split("\n").map(s => s.trim()).filter(s =>
      s.length > 0 && /[A-Za-z]/.test(s) && !/[\u0600-\u06FF]/.test(s) && !/\d{8,}/.test(s)
    );
    if (lines.length > 0) return lines.join(" ").trim().slice(0, 255);
  }
  // Single-line: Livraison immediately followed by Latin sender, then Arabic or phone
  const singleMatch = text.match(/(?:Livraison|Echange)([A-Za-z\u00C0-\u017E][A-Za-z\u00C0-\u017E\s]{0,60}?)(?=[\u0600-\u06FF]|\d{7,}|$)/m);
  if (singleMatch) return singleMatch[1].trim().slice(0, 255);
  return "";
}

// ─── Station ──────────────────────────────────────────────────────────────────
function extractStation(text: string): string {
  const norm = text.replace(/\n/g, " ");
  const m = norm.match(/(\d+\.\d+\s+Agence[^,]+?)(?=\s+(?:Weasy|Tracking|\d{10}))/);
  if (m) return m[1].trim().replace(/\s+/g, " ").slice(0, 100);
  const m2 = text.match(/(\d+\.\d+\s+Agence[^\n,]{1,80})/);
  if (m2) return m2[1].trim().slice(0, 100);
  return "";
}

// ─── Wilayas ──────────────────────────────────────────────────────────────────
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

function stripFooter(text: string): string {
  return text
    .replace(/RS\s*:.*?(?:\n|$)/g, " ")
    .replace(/Ce document a été créé.*?(?:\n|$)/g, " ")
    .replace(/Tous droits réservés.*?(?:\n|$)/g, " ");
}

function extractWilayaCounts(text: string): Record<string, number> {
  const clean = stripFooter(text);
  const segments = clean.split(/EC[A-Z0-9]{10,22}/);
  const parcelSegments = segments.slice(1);
  const counts: Record<string, number> = {};
  if (parcelSegments.length > 0) {
    for (const seg of parcelSegments) {
      const norm = seg.replace(/\n/g, " ");
      for (const w of KNOWN_WILAYAS) {
        if (norm.includes(w)) { counts[w] = (counts[w] ?? 0) + 1; break; }
      }
    }
  } else {
    const norm = clean.replace(/\n/g, " ");
    for (const w of KNOWN_WILAYAS) {
      if (norm.includes(w)) counts[w] = 1;
    }
  }
  return counts;
}

function serialiseWilayaCounts(counts: Record<string, number>): string {
  return Object.entries(counts).filter(([, n]) => n > 0).map(([w, n]) => `${w}:${n}`).join(",");
}

// ─── Per-order wilaya extraction ──────────────────────────────────────────────
// Returns a wilaya name for each tracking number (pipe-separated, aligned with tracking_numbers).
function extractPerOrderWilayas(text: string, trackingNums: string[]): string[] {
  if (trackingNums.length === 0) return [];
  const result: string[] = [];
  for (let i = 0; i < trackingNums.length; i++) {
    const code = trackingNums[i];
    const idx = text.indexOf(code);
    if (idx === -1) { result.push(""); continue; }
    const nextCode = i + 1 < trackingNums.length ? trackingNums[i + 1] : null;
    const nextIdx = nextCode ? text.indexOf(nextCode, idx + code.length) : -1;
    const segEnd = nextIdx > idx ? nextIdx : Math.min(idx + 500, text.length);
    const segment = text.slice(idx + code.length, segEnd).replace(/\n/g, " ");
    let found = "";
    for (const w of KNOWN_WILAYAS) {
      if (segment.includes(w)) { found = w; break; }
    }
    result.push(found);
  }
  return result;
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
    const text = normaliseLigatures(pdfData.text);

    const reportType   = detectReportType(text);
    const reportDate   = extractDate(text);
    const trackingNums = extractTrackingNumbers(text);
    const wilayaCounts = extractWilayaCounts(text);
    const totalParcels = extractParcels(text, reportType, trackingNums.length);
    const station      = extractStation(text);

    // Per-order wilaya (pipe-separated, aligned with tracking_numbers)
    const orderWilayasArr = extractPerOrderWilayas(text, trackingNums);
    const orderWilayasStr = orderWilayasArr.some(Boolean) ? orderWilayasArr.join("|") : null;

    // Recipient names — use specialised extractor for returns_list
    const recipientNamesStr = reportType === "returns_list"
      ? extractReturnsRecipientNames(text, trackingNums)
      : extractRecipientNames(text, trackingNums);

    let totalAmount    = 0;
    let netAmount      = 0;
    let fraisLivraison = 0;
    let senderName     = "";

    if (reportType === "delivery_receipt") {
      const { total, net, frais } = extractDeliveryAmounts(text);
      totalAmount    = total;
      netAmount      = net;
      fraisLivraison = frais;
      senderName     = extractDeliverySender(text);
    } else if (reportType === "route_sheet") {
      totalAmount = extractRouteTotal(text);
      senderName  = extractFDRSenders(text).join("|").slice(0, 255);
    } else if (reportType === "returns_list") {
      totalAmount = extractReturnAmounts(text);
      senderName  = extractReturnSender(text);
    }

    const wilayasStr = serialiseWilayaCounts(wilayaCounts);
    const wilayas    = Object.keys(wilayaCounts);

    const conn = await pool.getConnection();
    try {
      await conn.execute(
        `INSERT INTO office_reports
           (report_type, file_name, report_date, total_parcels,
            total_amount_dzd, net_amount_dzd, frais_livraison_dzd,
            station, sender_name, tracking_numbers, recipient_names, wilayas,
            uploaded_by, file_data, order_wilayas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reportType, file.originalname.slice(0, 255), reportDate, totalParcels,
          totalAmount, netAmount, fraisLivraison, station, senderName,
          trackingNums.join(","), recipientNamesStr || null, wilayasStr,
          authReq.adminUsername ?? "",
          file.buffer,          // store PDF binary for later download
          orderWilayasStr,
        ],
      );
    } finally { conn.release(); }

    res.json({
      ok: true, reportType, reportDate, totalParcels, totalAmount, netAmount,
      fraisLivraison, trackingCount: trackingNums.length, wilayas, station, senderName,
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
      // Exclude file_data (binary) from list — use /file endpoint to download
      const [rows] = await conn.execute(
        `SELECT id, report_type, file_name, report_date, total_parcels,
                total_amount_dzd, net_amount_dzd, frais_livraison_dzd,
                station, sender_name, tracking_numbers, recipient_names,
                wilayas, order_wilayas, uploaded_by, created_at
         FROM office_reports ORDER BY created_at DESC LIMIT 100`,
      );
      res.json({ ok: true, reports: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch reports");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ─── Download PDF ─────────────────────────────────────────────────────────────
router.get("/office/reports/:id/file", adminAuth, async (req, res) => {
  const authReq = req as AuthedRequest;
  if (!["admin", "office"].includes(authReq.adminRole ?? "")) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  const id = parseInt((req.params as { id: string }).id, 10);
  if (isNaN(id)) { res.status(400).json({ ok: false, error: "invalid_id" }); return; }
  try {
    const conn = await pool.getConnection();
    try {
      const [rows] = await conn.execute(
        "SELECT file_name, file_data FROM office_reports WHERE id = ?", [id],
      );
      const row = (rows as Array<{ file_name: string; file_data: Buffer | null }>)[0];
      if (!row || !row.file_data) {
        res.status(404).json({ ok: false, error: "file_not_stored" }); return;
      }
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${row.file_name}"`);
      res.send(row.file_data);
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to serve PDF");
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
          COUNT(*)                                                                             AS total_reports,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_parcels   ELSE 0 END)    AS total_delivered,
          SUM(CASE WHEN report_type = 'route_sheet'      THEN total_parcels   ELSE 0 END)    AS total_dispatched,
          SUM(CASE WHEN report_type = 'returns_list'     THEN total_parcels   ELSE 0 END)    AS total_returns,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN net_amount_dzd     ELSE 0 END) AS total_net_dzd,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN total_amount_dzd   ELSE 0 END) AS total_cod_dzd,
          SUM(CASE WHEN report_type = 'delivery_receipt' THEN frais_livraison_dzd ELSE 0 END) AS total_frais_dzd,
          SUM(CASE WHEN report_type = 'route_sheet'      THEN total_amount_dzd   ELSE 0 END) AS total_dispatched_dzd
        FROM office_reports
      `);

      const [senders] = await conn.execute(`
        SELECT sender_name, COUNT(*) AS report_count, SUM(total_parcels) AS total_parcels, SUM(net_amount_dzd) AS net_dzd
        FROM office_reports
        WHERE report_type = 'delivery_receipt' AND sender_name IS NOT NULL AND sender_name != ''
        GROUP BY sender_name ORDER BY total_parcels DESC LIMIT 8
      `);

      const [recent] = await conn.execute(
        `SELECT id, report_type, file_name, report_date, total_parcels,
                total_amount_dzd, net_amount_dzd, frais_livraison_dzd,
                station, sender_name, tracking_numbers, recipient_names,
                wilayas, order_wilayas, uploaded_by, created_at
         FROM office_reports ORDER BY created_at DESC LIMIT 10`,
      );

      const s = (summary as Array<Record<string, unknown>>)[0] ?? {};
      const totalFrais = Number(s.total_frais_dzd ?? 0);
      const fraisLivraison = totalFrais > 0
        ? totalFrais
        : Number(s.total_cod_dzd ?? 0) - Number(s.total_net_dzd ?? 0);

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
          fraisLivraison,
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
