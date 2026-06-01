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
// Ecotrack tracking codes are exactly: EC + 4 alphanumeric chars + 11 digits = 17 chars.
// Using a precise pattern prevents greedily capturing reference numbers or phone digits
// that immediately follow the code in the concatenated pdf-parse output.
function extractTrackingNumbers(text: string): string[] {
  const raw = text.match(/EC[A-Z0-9]{4}\d{11}/g) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const n of raw) {
    if (!seen.has(n)) { seen.add(n); result.push(n); }
  }
  return result;
}

// ─── Helper: get extraction window bounded by next tracking number ────────────
function getBoundedWindow(text: string, fromIdx: number, maxLen = 500): string {
  const slice = text.slice(fromIdx, fromIdx + maxLen + 30);
  const nextMatch = slice.match(/EC[A-Z0-9]{4}\d{11}/);
  const end = nextMatch && nextMatch.index! > 0 ? Math.min(nextMatch.index!, maxLen) : maxLen;
  return slice.slice(0, end);
}

// ─── Recipient extraction — delivery_receipt ──────────────────────────────────
// The pdf-parse output concatenates table columns without separators, causing:
//   - Reference numbers (2-3 digits) or type suffixes (-EXCH) to appear right after tracking
//   - Phone numbers to appear before the name (when Reference column holds a phone)
//   - Recipient phone to appear right after the name on the same line
// Strategy:
//   1. Strip type suffix like "-EXCH" at the start
//   2. Locate all Algerian phone numbers (0[5-7] + 8 digits) in the window
//   3. If letters exist before the first phone → name is before first phone
//   4. If first phone is at start (no letters before it) → name is between first and second phone
//   5. Strip leading digits (reference number remnants) from each name line
function extractRecipientNames(text: string, trackingNums: string[]): string {
  if (trackingNums.length === 0) return "";
  const PHONE_RE = /0[5-7]\d{8}/g;

  const recipients: string[] = [];
  for (const code of trackingNums) {
    const idx = text.indexOf(code);
    if (idx === -1) { recipients.push(""); continue; }

    const after = getBoundedWindow(text, idx + code.length, 500);

    // 1. Strip type suffix at the very start (e.g. "-EXCH", "-EXC")
    const afterClean = after.replace(/^[\s\-]*[A-Z]{2,8}(?=\d)/, "");

    // 2. Find all Algerian phone positions
    const phones: number[] = [];
    PHONE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PHONE_RE.exec(afterClean)) !== null) phones.push(m.index);

    let nameRaw = "";
    if (phones.length === 0) {
      nameRaw = afterClean.slice(0, 200);
    } else {
      const textBeforeFirst = afterClean.slice(0, phones[0]);
      const hasLetters = /[A-Za-z\u00C0-\u017E]{2,}/.test(textBeforeFirst);
      if (hasLetters) {
        // Normal layout: name comes before the first phone
        nameRaw = textBeforeFirst;
      } else if (phones.length >= 2) {
        // Reference/other phone is first; name is between first and second phone
        nameRaw = afterClean.slice(phones[0] + 10, phones[1]);
      } else {
        // Only one phone and nothing before it; take text after the phone
        nameRaw = afterClean.slice(phones[0] + 10, phones[0] + 210);
      }
    }

    // 3. Parse: split by newline, strip leading digits, keep lines with letters
    const parts = nameRaw
      .split("\n")
      .map(l => l.replace(/^\d+/, "").trim())
      .filter(l => l.length >= 2 && /[A-Za-z\u00C0-\u017E]{2,}/.test(l));

    recipients.push(parts.join(" ").trim().slice(0, 100));
  }
  return recipients.join("|");
}

// ─── Recipient extraction — returns_list ──────────────────────────────────────
// RETOUR PDF column layout (all merged by pdf-parse on one line, or spilling to next lines):
//   EC[tracking][CX-ref?][Livraison|Echange|Retour][Sender][Recipient][Phone][Wilaya]...
// The sender name is CONSISTENT across all rows in a single RETOUR report.
// Strategy:
//   1. For each row, extract the text between the type keyword and the first phone → "middle"
//   2. Find the longest common prefix across all "middle" strings → that's the sender
//   3. Strip the sender prefix from each middle → recipient name remains
function extractReturnsRecipientNames(text: string, trackingNums: string[]): string {
  if (trackingNums.length === 0) return "";

  const TYPE_RE = /Livraison|Echange|Retour/i;
  const PHONE_RE = /0[5-7]\d{8}/;

  // First pass: build (code → middle) where middle = flat text after TYPE keyword up to first phone
  const rows: { code: string; middle: string }[] = [];
  for (const code of trackingNums) {
    const codeIdx = text.indexOf(code);
    if (codeIdx === -1) continue;
    const win = text.slice(codeIdx + code.length, codeIdx + code.length + 500);
    // Bound to next tracking code to avoid bleeding into the next row
    const nextEC = win.match(/EC[A-Z0-9]{4}\d{11}/);
    const rowText = (nextEC && nextEC.index! > 0) ? win.slice(0, nextEC.index!) : win.slice(0, 300);
    // Remove optional CX-ref (hex digits only, e.g. "CX2930353e2e1"); must stop before type keyword
    const noRef = rowText.replace(/^CX[a-f0-9]{8,16}/i, "");
    // Find type keyword
    const typeMatch = TYPE_RE.exec(noRef);
    if (!typeMatch) continue;
    // Flatten newlines → spaces so multi-line names are handled uniformly
    const flat = noRef.slice(typeMatch.index + typeMatch[0].length).replace(/\n/g, " ");
    const phoneMatch = PHONE_RE.exec(flat);
    if (!phoneMatch) continue;
    rows.push({ code, middle: flat.slice(0, phoneMatch.index) });
  }

  // Second pass: find sender prefix length (longest prefix common to ALL rows)
  let senderLen = 0;
  if (rows.length >= 2) {
    const first = rows[0].middle;
    for (let i = 0; i < first.length; i++) {
      if (rows.every(r => i < r.middle.length && r.middle[i] === first[i])) {
        senderLen = i + 1;
      } else {
        break;
      }
    }
  }

  // Third pass: recipient = everything after the sender prefix, trimmed
  const recipientMap = new Map<string, string>();
  for (const { code, middle } of rows) {
    recipientMap.set(code, middle.slice(senderLen).trim().slice(0, 100));
  }

  return trackingNums.map(code => recipientMap.get(code) ?? "").join("|");
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
// Pattern: "291300 DACP Station Oued Rhiou" — digits + DA + sender name (no space between DA and name).
// m[1] captures the sender name (the part after DA).
function extractDeliverySender(text: string): string {
  const m = text.match(/\n\d[\d\s]*\s*DA([A-Za-z\u00C0-\u017E0-9][^\n]{1,120})/);
  if (m) return m[1].trim().slice(0, 255);
  return "";
}

// ─── Sender extraction — FDR (route_sheet) ───────────────────────────────────
// FDR format per row: EC... \n sender_line1 \n [sender_line2...] \n sender_phone \n recipient...
// Sender name can span 1-4 lines (e.g. "48.1 CP Wasseli\nStation\nRelizane (Oued\nRhiou)").
// Increased {1,6}? from {1,3}? to handle 4-line station names.
function extractFDRSenders(text: string): string[] {
  const senders = new Set<string>();
  for (const m of text.matchAll(/EC[A-Z0-9]{4}\d{11}\n((?:[^\n]+\n){1,6}?)\d{10}\n/g)) {
    const raw = m[1].replace(/\n/g, " ").trim().replace(/^\d+$/, "");
    if (raw.length > 0 && raw.length < 120) senders.add(raw);
  }
  return [...senders];
}

// ─── Per-order sender extraction — FDR (route_sheet) ─────────────────────────
// For each tracking number, extract only that order's sender (1-6 lines before the sender phone).
// Returns a pipe-separated string aligned with trackingNums (same index = same order).
// This is separate from extractFDRSenders which returns unique senders for the report header.
function extractFDRSenderNames(text: string, trackingNums: string[]): string {
  if (trackingNums.length === 0) return "";
  const senders: string[] = [];
  for (const code of trackingNums) {
    const idx = text.indexOf(code);
    if (idx === -1) { senders.push(""); continue; }
    // Slice just past the tracking code; strip leading newline (FDR tracking codes are on their own line)
    const after = text.slice(idx + code.length, idx + code.length + 400).replace(/^\n/, "");
    // Match 1-6 sender lines followed by a 10-digit phone
    const m = after.match(/^((?:[^\n]+\n){1,6}?)\d{10}\n/);
    if (m) {
      const raw = m[1]
        .replace(/\n/g, " ")
        .trim()
        .replace(/^\d+\s*/, ""); // strip leading ref number if present
      senders.push(raw.length > 0 && raw.length < 120 ? raw : "");
    } else {
      senders.push("");
    }
  }
  return senders.join("|");
}

// ─── Recipient extraction — FDR (route_sheet) ────────────────────────────────
// FDR format: EC... \n senderName(1-4 lines) \n senderPhone \n recipientName[addressMarker,City] \n ...
// After the sender phone the recipient name appears, followed by an address marker (Sd, SD, DM, etc.)
// and a comma. We take text between sender phone and address marker, stripping the marker itself.
// ADDR_MARKER_RE uses /i so "Sd,", "SD,", "sd," and all case variants are matched correctly.
function extractFDRRecipientNames(text: string, trackingNums: string[]): string {
  if (trackingNums.length === 0) return "";
  const SENDER_PHONE_RE = /0[5-9]\d{8}/g;
  // Common Ecotrack address-type markers that appear right after the recipient name.
  // Case-insensitive (/i) so "Sd,", "SD,", "sd," etc. are all matched.
  const ADDR_MARKER_RE = /(?:NOEST\s+express|BR\s+NOEST|SD?|DM|AD|BR|Domicile|Centre|Noest|centre)\s*,/i;

  const recipients: string[] = [];
  for (const code of trackingNums) {
    const idx = text.indexOf(code);
    if (idx === -1) { recipients.push(""); continue; }

    const after = getBoundedWindow(text, idx + code.length, 600);

    // Find sender phone (first Algerian mobile)
    SENDER_PHONE_RE.lastIndex = 0;
    const phoneMatch = SENDER_PHONE_RE.exec(after);
    if (!phoneMatch) { recipients.push(""); continue; }


    // Recipient area starts right after the sender's 10-digit phone
    const recipientArea = after.slice(phoneMatch.index + 10).replace(/^\n/, "");

    // Find address marker (separates name from address)
    const addrMatch = ADDR_MARKER_RE.exec(recipientArea);
    // Find next phone number (backup boundary)
    const nextPhoneMatch = /0[5-9]\d{8}/.exec(recipientArea);

    let nameRaw = "";
    const addrIdx = addrMatch?.index ?? Infinity;
    const phoneIdx = nextPhoneMatch?.index ?? Infinity;
    const boundary = Math.min(addrIdx, phoneIdx, 200);

    if (boundary === addrIdx && addrMatch) {
      // Take everything before the address marker; strip trailing marker word
      const beforeAddr = recipientArea.slice(0, addrMatch.index);
      nameRaw = beforeAddr.replace(
        /\s*(?:NOEST\s+express|BR\s+NOEST|SD?|sd|S\.d|DM|dm|AD|ad|BR|br|Domicile|Centre|Noest|noest|centre)\s*$/i,
        ""
      );
    } else {
      nameRaw = recipientArea.slice(0, boundary);
      // No addr marker found: address may still be embedded (e.g. "بلواضح امينAin Arnat ,عين ارنات").
      // For Arabic-starting names, stop at the first Latin character (city names are Latin).
      // For Latin-starting names, stop at the first comma (address separator).
      const trimmed = nameRaw.trim();
      if (/^[\u0600-\u06FF]/.test(trimmed)) {
        const arabicOnly = trimmed.match(/^[\u0600-\u06FF][^\u0021-\u007E\u00C0-\u017E]*/);
        if (arabicOnly) nameRaw = arabicOnly[0];
      } else {
        nameRaw = trimmed.replace(/[,،].*$/, "").trim();
      }
    }

    // Clean up multi-line names and filter out pure numeric lines
    const parts = nameRaw
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.length >= 1 && !/^\d+$/.test(l))
      .slice(0, 3);

    recipients.push(parts.join(" ").trim().slice(0, 100));
  }
  return recipients.join("|");
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

    // Recipient names — use specialised extractors per report type
    const recipientNamesStr =
      reportType === "returns_list"  ? extractReturnsRecipientNames(text, trackingNums) :
      reportType === "route_sheet"   ? extractFDRRecipientNames(text, trackingNums) :
                                       extractRecipientNames(text, trackingNums);

    let totalAmount    = 0;
    let netAmount      = 0;
    let fraisLivraison = 0;
    let senderName     = "";
    let perOrderSendersStr: string | null = null;

    if (reportType === "delivery_receipt") {
      const { total, net, frais } = extractDeliveryAmounts(text);
      totalAmount    = total;
      netAmount      = net;
      fraisLivraison = frais;
      senderName     = extractDeliverySender(text);
    } else if (reportType === "route_sheet") {
      totalAmount = extractRouteTotal(text);
      // Compact list of unique senders for report-level display
      senderName  = extractFDRSenders(text).join("|").slice(0, 255);
      // Per-order senders aligned with tracking numbers (used for individual order rows)
      const perOrderSenders = extractFDRSenderNames(text, trackingNums);
      perOrderSendersStr = perOrderSenders || null;
    } else if (reportType === "returns_list") {
      totalAmount = extractReturnAmounts(text);
      senderName  = extractReturnSender(text);
    }

    const wilayasStr = serialiseWilayaCounts(wilayaCounts);
    const wilayas    = Object.keys(wilayaCounts);

    const conn = await pool.getConnection();
    try {
      // ── Duplicate PDF check ───────────────────────────────────────────────
      const [existing] = await conn.execute(
        "SELECT id FROM office_reports WHERE file_name = ? AND uploaded_by = ? LIMIT 1",
        [file.originalname.slice(0, 255), authReq.adminUsername ?? ""],
      ) as [Array<{ id: number }>, unknown];
      if ((existing as Array<{ id: number }>).length > 0) {
        conn.release();
        res.status(409).json({ ok: false, error: "duplicate_file", detail: "Ce fichier PDF a déjà été importé." });
        return;
      }

      await conn.execute(
        `INSERT INTO office_reports
           (report_type, file_name, report_date, total_parcels,
            total_amount_dzd, net_amount_dzd, frais_livraison_dzd,
            station, sender_name, tracking_numbers, recipient_names, wilayas,
            uploaded_by, file_data, order_wilayas, per_order_senders)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          reportType, file.originalname.slice(0, 255), reportDate, totalParcels,
          totalAmount, netAmount, fraisLivraison, station, senderName,
          trackingNums.join(","), recipientNamesStr || null, wilayasStr,
          authReq.adminUsername ?? "",
          file.buffer,          // store PDF binary for later download
          orderWilayasStr,
          perOrderSendersStr,
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
  const role = authReq.adminRole ?? "";
  if (!["admin", "office"].includes(role)) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      // Exclude file_data (binary) from list — use /file endpoint to download
      // Office agents only see their own uploads; admins see all
      const isOffice = role === "office";
      const params: unknown[] = isOffice ? [authReq.adminUsername ?? ""] : [];
      const whereClause = isOffice ? "WHERE uploaded_by = ?" : "";
      const [rows] = await conn.execute(
        `SELECT id, report_type, file_name, report_date, total_parcels,
                total_amount_dzd, net_amount_dzd, frais_livraison_dzd,
                station, sender_name, tracking_numbers, recipient_names,
                wilayas, order_wilayas, uploaded_by, created_at
         FROM office_reports ${whereClause} ORDER BY created_at DESC LIMIT 200`,
        params,
      );
      res.json({ ok: true, reports: rows });
    } finally { conn.release(); }
  } catch (err) {
    req.log?.error({ err }, "Failed to fetch reports");
    res.status(500).json({ ok: false, error: "db_error" });
  }
});

// ─── Download PDF ─────────────────────────────────────────────────────────────
// Browser navigation (<a target="_blank">) cannot set Authorization headers, so we also
// accept the token as a ?token= query parameter for this read-only file endpoint.
router.get("/office/reports/:id/file", async (req, res, next) => {
  const qToken = (req.query as Record<string, string>).token;
  if (qToken) {
    // Inject as Authorization header so the adminAuth middleware sees it
    req.headers["authorization"] = `Bearer ${qToken}`;
  }
  next();
}, adminAuth, async (req, res) => {
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
  const role = authReq.adminRole ?? "";
  if (!["admin", "office"].includes(role)) {
    res.status(403).json({ ok: false, error: "forbidden" }); return;
  }
  try {
    const conn = await pool.getConnection();
    try {
      // Office agents only see their own data; admins see all
      const isOffice = role === "office";
      const ownerWhere = isOffice ? "WHERE uploaded_by = ?" : "WHERE 1=1";
      const ownerParams: unknown[] = isOffice ? [authReq.adminUsername ?? ""] : [];

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
        FROM office_reports ${ownerWhere}
      `, ownerParams);

      const [senders] = await conn.execute(`
        SELECT sender_name, COUNT(*) AS report_count, SUM(total_parcels) AS total_parcels, SUM(net_amount_dzd) AS net_dzd
        FROM office_reports
        WHERE report_type = 'delivery_receipt' AND sender_name IS NOT NULL AND sender_name != ''
          ${isOffice ? "AND uploaded_by = ?" : ""}
        GROUP BY sender_name ORDER BY total_parcels DESC LIMIT 8
      `, ownerParams);

      const [recent] = await conn.execute(
        `SELECT id, report_type, file_name, report_date, total_parcels,
                total_amount_dzd, net_amount_dzd, frais_livraison_dzd,
                station, sender_name, tracking_numbers, recipient_names,
                wilayas, order_wilayas, uploaded_by, created_at
         FROM office_reports ${ownerWhere} ORDER BY created_at DESC LIMIT 10`,
        ownerParams,
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
