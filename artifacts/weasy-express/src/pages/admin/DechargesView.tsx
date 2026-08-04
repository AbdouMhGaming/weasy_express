import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";
import { usePagination, PaginationBar } from "@/components/Pagination";

interface Worker {
  id: number;
  first_name: string;
  last_name: string;
  worker_id: string;
  phone: string;
  nin: string;
  position: string;
  hub: string;
}

interface Decharge {
  id: number;
  worker_db_id: number;
  worker_first_name: string;
  worker_last_name: string;
  worker_position: string;
  worker_id_card: string;
  worker_phone: string;
  worker_nin: string;
  worker_hub: string;
  recu_number: string;
  salaire_fixe: number;
  primes: number;
  montant_net: number;
  period_label: string;
  created_by: string;
  created_at: string;
}

interface Office {
  id: number;
  wilaya: string;
  commune: string | null;
  phone: string | null;
}

interface StationCommission {
  id: number;
  hub_name: string;
  hub_phone: string;
  agent_name: string;
  recu_number: string;
  nb_colis: number;
  bonus_retour: number;
  montant_net: number;
  period_label: string;
  created_by: string;
  created_at: string;
}

function officeLabel(o: Office) {
  return `${o.wilaya}${o.commune ? " — " + o.commune : ""}`;
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const fmtDZ = (n: number) => `${Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} DA`;
const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-colors bg-white";
const LABEL_CLS = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5";

const pdfFmtNum = (n: number) => Math.round(Number(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

async function generatePDF(d: Decharge) {
  const { jsPDF } = await import("jspdf");
  const JsBarcode = (await import("jsbarcode")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;

  // ── Fonts & colors ──────────────────────────────────────────────────────────
  const RED = [225, 6, 0] as [number, number, number];
  const DARK = [30, 30, 30] as [number, number, number];
  const GRAY = [100, 100, 100] as [number, number, number];
  const LGRAY = [200, 200, 200] as [number, number, number];

  // ── Barcode ──────────────────────────────────────────────────────────────────
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, d.recu_number, { format: "CODE128", displayValue: false, width: 1.8, height: 40, margin: 0 });
  const barcodeDataUrl = canvas.toDataURL("image/png");

  // ── Logo ─────────────────────────────────────────────────────────────────────
  let logoDataUrl: string | null = null;
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = "anonymous";
    logoImg.src = "/logo-white.png";
    await new Promise<void>((resolve) => {
      logoImg.onload = () => resolve();
      logoImg.onerror = () => resolve();
      setTimeout(resolve, 2000);
    });
    if (logoImg.naturalWidth > 0) {
      const lc = document.createElement("canvas");
      lc.width = logoImg.naturalWidth;
      lc.height = logoImg.naturalHeight;
      const ctx = lc.getContext("2d")!;
      ctx.drawImage(logoImg, 0, 0);
      logoDataUrl = lc.toDataURL("image/png");
    }
  } catch { /* skip logo if unavailable */ }

  let y = 14;

  // ── Header ───────────────────────────────────────────────────────────────────
  const headerH = 36;
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, headerH, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("ENTREPRISE Weasydel Express", 14, 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Direction Générale  ·  Service Finance", 14, 19);
  doc.text("Rue BEN KAHLA MENAOUER 03 OUED RHIOU  ·  weasyexpress.com", 14, 25);

  // Logo aligned right, shifted 5mm upward from previous y=1
  if (logoDataUrl) {
    const logoW = 52;
    const logoH = 52;
    doc.addImage(logoDataUrl, "PNG", W - 12 - logoW, -9, logoW, logoH);
  }

  y = headerH + 8;

  // ── Title ────────────────────────────────────────────────────────────────────
  doc.setTextColor(...DARK);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Reçu de Paiement de Salaire", W / 2, y, { align: "center" });
  y += 3;

  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(60, y, W - 60, y);
  y += 8;

  // ── Barcode + Reçu N° ────────────────────────────────────────────────────────
  const barcodeW = 55;
  const barcodeH = 14;
  const barcodeX = W - 14 - barcodeW;
  doc.addImage(barcodeDataUrl, "PNG", barcodeX, y, barcodeW, barcodeH);
  y += barcodeH + 5;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RED);
  doc.text(`Reçu N° :  ${d.recu_number}`, barcodeX + barcodeW / 2, y, { align: "center" });
  y += 8;

  // ── Info row ─────────────────────────────────────────────────────────────────
  const dateStr = new Date(d.created_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "long", year: "numeric" });

  doc.setTextColor(...DARK);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("Hub :", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(d.worker_hub || "—", 26, y);

  doc.setFont("helvetica", "bold");
  doc.text("Date :", W - 50, y);
  doc.setFont("helvetica", "normal");
  doc.text(dateStr, W - 40, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Employé :", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${d.worker_first_name} ${d.worker_last_name}`, 30, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("ID :", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(d.worker_id_card || "—", 22, y);
  y += 6;

  doc.setFont("helvetica", "bold");
  doc.text("Téléphone :", 14, y);
  doc.setFont("helvetica", "normal");
  doc.text(d.worker_phone || "—", 34, y);
  y += 8;

  // ── Divider ──────────────────────────────────────────────────────────────────
  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.3);
  doc.line(14, y, W - 14, y);
  y += 7;

  // ── Declaration block ────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GRAY);
  doc.text("Je soussigné(e) :", 14, y);
  y += 7;

  // Two-column layout
  const col1x = 14;
  const col2x = W / 2 + 5;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Nom et Prénom :", col1x, y);
  doc.setFont("helvetica", "normal");
  doc.text(`${d.worker_first_name} ${d.worker_last_name}`, col1x + 32, y);

  doc.setFont("helvetica", "bold");
  doc.text("Salaire Fixe :", col2x, y);
  doc.setFont("helvetica", "normal");
  const dotLine1 = ".".repeat(20);
  doc.text(`${dotLine1} ${pdfFmtNum(d.salaire_fixe)} DA`, col2x + 24, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("Fonction :", col1x, y);
  doc.setFont("helvetica", "normal");
  doc.text(d.worker_position || "—", col1x + 20, y);

  doc.setFont("helvetica", "bold");
  doc.text("Primes :", col2x, y);
  doc.setFont("helvetica", "normal");
  const dotLine2 = ".".repeat(26);
  doc.text(`${dotLine2} ${pdfFmtNum(d.primes)} DA`, col2x + 16, y);
  y += 7;

  doc.setFont("helvetica", "bold");
  doc.text("N° de CNI :", col1x, y);
  doc.setFont("helvetica", "normal");
  doc.text(d.worker_nin || "—", col1x + 22, y);
  y += 10;

  // ── Montant Net ──────────────────────────────────────────────────────────────
  doc.setFillColor(253, 232, 232);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.roundedRect(14, y - 5, W - 28, 14, 3, 3, "FD");

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...RED);
  doc.text("Montant Net perçu :", W / 2, y + 3, { align: "center" });

  const netStr = `${pdfFmtNum(d.montant_net)} DA`;
  doc.setFontSize(13);
  doc.text(`  ${netStr}`, W / 2 + 28, y + 3);
  y += 18;

  // ── Legal text ───────────────────────────────────────────────────────────────
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  const legal = "En foi de quoi, je signe le présent reçu pour valoir ce que de droit, libérant ainsi l'entreprise de tous mes droits financiers pour la période mentionnée ci-dessus.";
  const legalLines = doc.splitTextToSize(legal, W - 28);
  doc.text(legalLines, 14, y);
  y += legalLines.length * 4.5 + 10;

  // ── Signatures ───────────────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Signature Employé :", 30, y, { align: "center" });
  doc.text("Service Finance :", W - 50, y, { align: "center" });
  y += 20;

  doc.setDrawColor(...LGRAY);
  doc.setLineWidth(0.3);
  doc.line(14, y, 80, y);
  doc.line(W - 80, y, W - 14, y);
  y += 10;

  // ── Footer ───────────────────────────────────────────────────────────────────
  doc.setFillColor(...RED);
  doc.rect(0, 282, W, 15, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("+213-(0) 654 970 662", 14, 290);
  doc.text("www.weasyexpress.com", W / 2, 290, { align: "center" });
  doc.text("contact@weasyexpress.com", W - 14, 290, { align: "right" });

  doc.setFontSize(7);
  doc.text("ENTREPRISE Weasydel Express", W / 2, 294, { align: "center" });

  doc.save(`Decharge_${d.recu_number}_${d.worker_last_name}.pdf`);
}

async function generateStationCommissionPDF(c: StationCommission) {
  const { jsPDF } = await import("jspdf");
  const JsBarcode = (await import("jsbarcode")).default;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = 210;

  const RED = [225, 6, 0] as [number, number, number];
  const DARK = [30, 30, 30] as [number, number, number];
  const GRAY = [100, 100, 100] as [number, number, number];
  const LGRAY = [200, 200, 200] as [number, number, number];

  const canvas = document.createElement("canvas");
  JsBarcode(canvas, c.recu_number, { format: "CODE128", displayValue: false, width: 1.8, height: 40, margin: 0 });
  const barcodeDataUrl = canvas.toDataURL("image/png");

  let logoDataUrl: string | null = null;
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = "anonymous";
    logoImg.src = "/logo-white.png";
    await new Promise<void>((resolve) => {
      logoImg.onload = () => resolve();
      logoImg.onerror = () => resolve();
      setTimeout(resolve, 2000);
    });
    if (logoImg.naturalWidth > 0) {
      const lc = document.createElement("canvas");
      lc.width = logoImg.naturalWidth; lc.height = logoImg.naturalHeight;
      lc.getContext("2d")!.drawImage(logoImg, 0, 0);
      logoDataUrl = lc.toDataURL("image/png");
    }
  } catch {}

  let y = 14;
  const headerH = 36;
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, headerH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("ENTREPRISE Weasydel Express", 14, 12);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "normal");
  doc.text("Direction Générale  ·  Service Finance", 14, 19);
  doc.text("Rue BEN KAHLA MENAOUER 03 OUED RHIOU  ·  weasyexpress.com", 14, 25);
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", W - 12 - 52, -9, 52, 52);
  y = headerH + 8;

  doc.setTextColor(...DARK);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Reçu de Paiement de Commission (Station)", W / 2, y, { align: "center" });
  y += 3;
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.5);
  doc.line(40, y, W - 40, y);
  y += 8;

  const barcodeW = 55; const barcodeH = 14;
  const barcodeX = W - 14 - barcodeW;
  doc.addImage(barcodeDataUrl, "PNG", barcodeX, y, barcodeW, barcodeH);
  y += barcodeH + 5;
  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...RED);
  doc.text(`Reçu N° :  ${c.recu_number}`, barcodeX + barcodeW / 2, y, { align: "center" });
  y += 8;

  const dateStr = new Date(c.created_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "long", year: "numeric" });
  doc.setTextColor(...DARK); doc.setFontSize(9);
  doc.setFont("helvetica", "bold"); doc.text("Station :", 14, y);
  doc.setFont("helvetica", "normal"); doc.text(c.hub_name || "—", 28, y);
  doc.setFont("helvetica", "bold"); doc.text("Date :", W - 50, y);
  doc.setFont("helvetica", "normal"); doc.text(dateStr, W - 40, y);
  y += 6;
  doc.setFont("helvetica", "bold"); doc.text("Téléphone :", 14, y);
  doc.setFont("helvetica", "normal"); doc.text(c.hub_phone || "—", 34, y);
  y += 6;
  doc.setFont("helvetica", "bold"); doc.text("Agent :", 14, y);
  doc.setFont("helvetica", "normal"); doc.text(c.agent_name || "—", 26, y);
  y += 6;
  if (c.period_label) {
    doc.setFont("helvetica", "bold"); doc.text("Période :", 14, y);
    doc.setFont("helvetica", "normal"); doc.text(c.period_label, 28, y);
    y += 6;
  }
  y += 2;

  doc.setDrawColor(...LGRAY); doc.setLineWidth(0.3); doc.line(14, y, W - 14, y); y += 7;

  doc.setFontSize(9); doc.setFont("helvetica", "italic"); doc.setTextColor(...GRAY);
  doc.text("Détail du paiement :", 14, y); y += 7;

  const col1x = 14; const col2x = W / 2 + 5;
  doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK);
  doc.text("Nombre de colis :", col1x, y);
  doc.setFont("helvetica", "normal");
  doc.text(String(c.nb_colis), col1x + 35, y);
  doc.setFont("helvetica", "bold"); doc.text("Bonus retour :", col2x, y);
  doc.setFont("helvetica", "normal"); doc.text(`${pdfFmtNum(c.bonus_retour)} DA`, col2x + 28, y);
  y += 10;

  doc.setFillColor(253, 232, 232); doc.setDrawColor(...RED); doc.setLineWidth(0.5);
  doc.roundedRect(14, y - 5, W - 28, 14, 3, 3, "FD");
  doc.setFontSize(11); doc.setFont("helvetica", "bold"); doc.setTextColor(...RED);
  doc.text("Montant Net Commission :", W / 2, y + 3, { align: "center" });
  doc.setFontSize(13);
  doc.text(`  ${pdfFmtNum(c.montant_net)} DA`, W / 2 + 40, y + 3);
  y += 18;

  doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(...GRAY);
  const legal = "En foi de quoi, nous confirmons le paiement de la commission susmentionnée à la station, libérant ainsi l'entreprise de ses obligations financières pour la période mentionnée.";
  const legalLines = doc.splitTextToSize(legal, W - 28);
  doc.text(legalLines, 14, y); y += legalLines.length * 4.5 + 10;

  doc.setFontSize(9); doc.setFont("helvetica", "bold"); doc.setTextColor(...DARK);
  doc.text("Signature Station :", 30, y, { align: "center" });
  doc.text("Service Finance :", W - 50, y, { align: "center" });
  y += 20;
  doc.setDrawColor(...LGRAY); doc.setLineWidth(0.3);
  doc.line(14, y, 80, y); doc.line(W - 80, y, W - 14, y);

  doc.setFillColor(...RED); doc.rect(0, 282, W, 15, "F");
  doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont("helvetica", "normal");
  doc.text("+213-(0) 654 970 662", 14, 290);
  doc.text("www.weasyexpress.com", W / 2, 290, { align: "center" });
  doc.text("contact@weasyexpress.com", W - 14, 290, { align: "right" });
  doc.setFontSize(7); doc.text("ENTREPRISE Weasydel Express", W / 2, 294, { align: "center" });

  doc.save(`Commission_${c.recu_number}_${c.hub_name.replace(/\s/g, "_")}.pdf`);
}

type Tab = "salaire" | "commission";

export default function DechargesView() {
  const { t } = useTranslation();
  const role = localStorage.getItem("admin_role") ?? "";

  // Tab
  const [activeTab, setActiveTab] = useState<Tab>("salaire");

  // Salary décharges
  const [decharges, setDecharges] = useState<Decharge[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [genPdfId, setGenPdfId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [selWorkerId, setSelWorkerId] = useState("");
  const [salaireFixe, setSalaireFixe] = useState("");
  const [primes, setPrimes] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const montantNet = (parseFloat(salaireFixe) || 0) + (parseFloat(primes) || 0);
  const selWorker = workers.find(w => String(w.id) === selWorkerId) ?? null;

  // Commission
  const [offices, setOffices] = useState<Office[]>([]);
  const [commissions, setCommissions] = useState<StationCommission[]>([]);
  const [commLoading, setCommLoading] = useState(false);
  const [showCommModal, setShowCommModal] = useState(false);
  const [commOfficeId, setCommOfficeId] = useState("");
  const [commAgentName, setCommAgentName] = useState("");
  const [commNbColis, setCommNbColis] = useState("");
  const [commBonusRetour, setCommBonusRetour] = useState("");
  const [commMontantNet, setCommMontantNet] = useState("");
  const [commPeriod, setCommPeriod] = useState("");
  const [commSaving, setCommSaving] = useState(false);
  const [commError, setCommError] = useState("");
  const [commGenPdfId, setCommGenPdfId] = useState<number | null>(null);
  const [commDeleteId, setCommDeleteId] = useState<number | null>(null);
  const [commSearch, setCommSearch] = useState("");

  const selOffice = offices.find(o => String(o.id) === commOfficeId) ?? null;

  const filteredDecharges = useMemo(() => decharges.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${d.worker_first_name} ${d.worker_last_name}`.toLowerCase().includes(q) ||
      d.recu_number.toLowerCase().includes(q) ||
      (d.period_label ?? "").toLowerCase().includes(q) ||
      (d.worker_position ?? "").toLowerCase().includes(q) ||
      (d.worker_hub ?? "").toLowerCase().includes(q)
    );
  }), [decharges, searchQuery]);

  const filteredCommissions = useMemo(() => commissions.filter(c => {
    if (!commSearch.trim()) return true;
    const q = commSearch.toLowerCase();
    return (
      c.hub_name.toLowerCase().includes(q) ||
      c.recu_number.toLowerCase().includes(q) ||
      (c.agent_name ?? "").toLowerCase().includes(q) ||
      (c.period_label ?? "").toLowerCase().includes(q)
    );
  }), [commissions, commSearch]);

  const pagedDecharges = usePagination(filteredDecharges);
  const pagedCommissions = usePagination(filteredCommissions);

  const fetchDecharges = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/decharges`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setDecharges(d.decharges ?? []);
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchWorkers = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/workers`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setWorkers(d.workers ?? []);
    } catch {}
  }, []);

  const fetchOffices = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/offices`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setOffices(d.offices ?? []);
    } catch {}
  }, []);

  const fetchCommissions = useCallback(async () => {
    setCommLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/station-commissions`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setCommissions(d.commissions ?? []);
    } catch {} finally { setCommLoading(false); }
  }, []);

  useEffect(() => {
    fetchDecharges(); fetchWorkers(); fetchOffices(); fetchCommissions();
  }, [fetchDecharges, fetchWorkers, fetchOffices, fetchCommissions]);

  function openCreate() {
    setSelWorkerId(workers[0] ? String(workers[0].id) : "");
    setSalaireFixe(""); setPrimes("");
    const now = new Date();
    setPeriodLabel(`${now.toLocaleString("fr-DZ", { month: "long" })} ${now.getFullYear()}`);
    setFormError("");
    setShowModal(true);
  }

  function openCommCreate() {
    setCommOfficeId(offices[0] ? String(offices[0].id) : "");
    setCommAgentName(""); setCommNbColis(""); setCommBonusRetour(""); setCommMontantNet("");
    const now = new Date();
    setCommPeriod(`${now.toLocaleString("fr-DZ", { month: "long" })} ${now.getFullYear()}`);
    setCommError("");
    setShowCommModal(true);
  }

  async function saveDecharge() {
    if (!selWorkerId) { setFormError(t("admin.decharges.selectWorker")); return; }
    const sf = parseFloat(salaireFixe) || 0;
    if (sf <= 0) { setFormError(t("admin.decharges.formError")); return; }
    setSaving(true); setFormError("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/decharges`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ worker_id: parseInt(selWorkerId), salaire_fixe: sf, primes: parseFloat(primes) || 0, montant_net: montantNet, period_label: periodLabel }),
      });
      const d = await r.json();
      if (d.ok) {
        setShowModal(false);
        await fetchDecharges();
        const fresh = await fetch(`${API_BASE}/api/admin/decharges`, { headers: adminHeaders() });
        const fd = await fresh.json();
        if (fd.ok && fd.decharges?.length > 0) {
          const newest = fd.decharges[0] as Decharge;
          setGenPdfId(newest.id);
          await generatePDF(newest);
          setGenPdfId(null);
        }
      } else { setFormError(t("admin.decharges.saveError")); }
    } catch { setFormError(t("admin.decharges.saveError")); } finally { setSaving(false); }
  }

  async function saveCommission() {
    const hubName = selOffice ? officeLabel(selOffice) : "";
    const hubPhone = selOffice?.phone ?? "";
    if (!hubName) { setCommError("Choisir une station."); return; }
    const montant = parseFloat(commMontantNet) || 0;
    if (montant <= 0) { setCommError("Le montant net est requis."); return; }
    setCommSaving(true); setCommError("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/station-commissions`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({
          hub_name: hubName, hub_phone: hubPhone, agent_name: commAgentName,
          nb_colis: parseInt(commNbColis) || 0, bonus_retour: parseFloat(commBonusRetour) || 0,
          montant_net: montant, period_label: commPeriod,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setShowCommModal(false);
        await fetchCommissions();
        const fresh = await fetch(`${API_BASE}/api/admin/station-commissions`, { headers: adminHeaders() });
        const fd = await fresh.json();
        if (fd.ok && fd.commissions?.length > 0) {
          const newest = fd.commissions[0] as StationCommission;
          setCommGenPdfId(newest.id);
          await generateStationCommissionPDF(newest);
          setCommGenPdfId(null);
        }
      } else { setCommError("Erreur lors de la sauvegarde."); }
    } catch { setCommError("Erreur lors de la sauvegarde."); } finally { setCommSaving(false); }
  }

  async function handleDownload(d: Decharge) {
    setGenPdfId(d.id); await generatePDF(d); setGenPdfId(null);
  }

  async function handleDownloadComm(c: StationCommission) {
    setCommGenPdfId(c.id); await generateStationCommissionPDF(c); setCommGenPdfId(null);
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`${API_BASE}/api/admin/decharges/${id}`, { method: "DELETE", headers: adminHeaders() });
      setConfirmDeleteId(null); fetchDecharges();
    } catch {}
  }

  async function handleDeleteComm(id: number) {
    try {
      await fetch(`${API_BASE}/api/admin/station-commissions/${id}`, { method: "DELETE", headers: adminHeaders() });
      setCommDeleteId(null); fetchCommissions();
    } catch {}
  }

  const TabBtn = ({ tab, label }: { tab: Tab; label: string }) => (
    <button onClick={() => setActiveTab(tab)}
      className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition-all ${activeTab === tab ? "bg-[#E10600] text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"}`}>
      {label}
    </button>
  );

  return (
    <div className="p-3 sm:p-6 lg:p-8 min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.decharges.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.decharges.subtitle")}</p>
        </div>
        {activeTab === "salaire" ? (
          <button onClick={openCreate} disabled={workers.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {t("admin.decharges.create")}
          </button>
        ) : (
          <button onClick={openCommCreate} disabled={offices.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Nouvelle commission
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-gray-100/70 rounded-xl p-1 w-fit">
        <TabBtn tab="salaire" label="Reçus de Salaire" />
        <TabBtn tab="commission" label="Commissions (Station)" />
      </div>

      {/* ── SALARY TAB ── */}
      {activeTab === "salaire" && (
        <>
          {decharges.length > 0 && (
            <div className="mb-5">
              <div className="relative max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t("admin.decharges.searchPlaceholder")}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-colors shadow-sm" />
                {searchQuery && <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>}
              </div>
            </div>
          )}
          {workers.length === 0 && !loading && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-5 flex items-center gap-3 text-sm text-amber-800">
              <svg className="w-5 h-5 shrink-0 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              {t("admin.decharges.noWorkers")}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400"><Spinner /><span className="text-sm">{t("admin.decharges.loading")}</span></div>
          ) : decharges.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3"><svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
              <p className="text-gray-400 text-sm">{t("admin.decharges.empty")}</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-5 py-3">{t("admin.decharges.cols.recu")}</th>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">{t("admin.decharges.cols.worker")}</th>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">{t("admin.decharges.cols.period")}</th>
                      <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">{t("admin.decharges.cols.fixe")}</th>
                      <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">{t("admin.decharges.cols.primes")}</th>
                      <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">{t("admin.decharges.cols.net")}</th>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">{t("admin.decharges.cols.date")}</th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pagedDecharges.paged.length === 0 ? (
                      <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">{filteredDecharges.length === 0 ? t("admin.decharges.noResults", { query: searchQuery }) : ""}</td></tr>
                    ) : pagedDecharges.paged.map(d => (
                      <tr key={d.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-5 py-3.5"><span className="font-mono text-xs font-bold text-[#E10600] bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">{d.recu_number}</span></td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E10600] to-[#B80500] flex items-center justify-center text-white text-xs font-bold shrink-0">{d.worker_first_name[0]}{d.worker_last_name[0]}</div>
                            <div>
                              <p className="font-semibold text-gray-900 text-sm">{d.worker_first_name} {d.worker_last_name}</p>
                              <p className="text-xs text-gray-400">{d.worker_position}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-sm hidden md:table-cell">{d.period_label}</td>
                        <td className="px-4 py-3.5 text-right text-gray-600 text-sm hidden sm:table-cell">{fmtDZ(d.salaire_fixe)}</td>
                        <td className="px-4 py-3.5 text-right text-gray-600 text-sm hidden sm:table-cell">{fmtDZ(d.primes)}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-[#E10600]">{fmtDZ(d.montant_net)}</td>
                        <td className="px-4 py-3.5 text-gray-400 text-xs hidden lg:table-cell">{new Date(d.created_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => handleDownload(d)} disabled={genPdfId === d.id} className="p-1.5 rounded-lg text-gray-300 hover:text-[#E10600] hover:bg-red-50 transition-colors disabled:opacity-50" title={t("admin.decharges.download")}>
                              {genPdfId === d.id ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            </button>
                            {role === "admin" && (
                              <button onClick={() => setConfirmDeleteId(d.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar {...pagedDecharges} />
            </div>
          )}
        </>
      )}

      {/* ── COMMISSION TAB ── */}
      {activeTab === "commission" && (
        <>
          {commissions.length > 0 && (
            <div className="mb-5">
              <div className="relative max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" /></svg>
                <input type="text" value={commSearch} onChange={e => setCommSearch(e.target.value)} placeholder="Rechercher une commission..."
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-colors shadow-sm" />
                {commSearch && <button onClick={() => setCommSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>}
              </div>
            </div>
          )}
          {commLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400"><Spinner /><span className="text-sm">Chargement...</span></div>
          ) : commissions.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3"><svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
              <p className="text-gray-400 text-sm">Aucun reçu de commission</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-5 py-3">Reçu</th>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">Station</th>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Agent</th>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">Période</th>
                      <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">Colis</th>
                      <th className="text-right text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">Net</th>
                      <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">Date</th>
                      <th className="px-4 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pagedCommissions.paged.length === 0 ? (
                      <tr><td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">Aucun résultat</td></tr>
                    ) : pagedCommissions.paged.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50/40 transition-colors">
                        <td className="px-5 py-3.5"><span className="font-mono text-xs font-bold text-[#E10600] bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">{c.recu_number}</span></td>
                        <td className="px-4 py-3.5">
                          <p className="font-semibold text-gray-900 text-sm">{c.hub_name}</p>
                          {c.hub_phone && <p className="text-xs text-gray-400">{c.hub_phone}</p>}
                        </td>
                        <td className="px-4 py-3.5 text-gray-600 text-sm hidden md:table-cell">{c.agent_name || "—"}</td>
                        <td className="px-4 py-3.5 text-gray-500 text-sm hidden md:table-cell">{c.period_label || "—"}</td>
                        <td className="px-4 py-3.5 text-right text-gray-600 text-sm hidden sm:table-cell">{c.nb_colis}</td>
                        <td className="px-4 py-3.5 text-right font-bold text-[#E10600]">{fmtDZ(c.montant_net)}</td>
                        <td className="px-4 py-3.5 text-gray-400 text-xs hidden lg:table-cell">{new Date(c.created_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" })}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => handleDownloadComm(c)} disabled={commGenPdfId === c.id} className="p-1.5 rounded-lg text-gray-300 hover:text-[#E10600] hover:bg-red-50 transition-colors disabled:opacity-50">
                              {commGenPdfId === c.id ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
                            </button>
                            {role === "admin" && (
                              <button onClick={() => setCommDeleteId(c.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar {...pagedCommissions} />
            </div>
          )}
        </>
      )}

      {/* ── Salary Create Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-[#E10600] to-[#B80500] px-6 pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                  <div>
                    <h3 className="font-bold text-white text-base">{t("admin.decharges.createTitle")}</h3>
                    <p className="text-white/70 text-xs">{t("admin.decharges.createSubtitle")}</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-xl">×</button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2"><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{formError}</div>}
              <div>
                <label className={LABEL_CLS}>{t("admin.decharges.fields.worker")}</label>
                <select value={selWorkerId} onChange={e => setSelWorkerId(e.target.value)} className={INPUT_CLS}>
                  <option value="">— {t("admin.decharges.selectWorker")} —</option>
                  {workers.map(w => <option key={w.id} value={String(w.id)}>{w.first_name} {w.last_name} — {w.position}</option>)}
                </select>
              </div>
              {selWorker && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600 grid grid-cols-2 gap-1.5">
                  <span><b>Hub :</b> {selWorker.hub || "—"}</span>
                  <span><b>ID :</b> {selWorker.worker_id || "—"}</span>
                  <span><b>Tél :</b> {selWorker.phone || "—"}</span>
                  <span><b>NIN :</b> {selWorker.nin || "—"}</span>
                </div>
              )}
              <div>
                <label className={LABEL_CLS}>{t("admin.decharges.fields.period")}</label>
                <input value={periodLabel} onChange={e => setPeriodLabel(e.target.value)} className={INPUT_CLS} placeholder="ex: Juin 2026" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>{t("admin.decharges.fields.fixe")}</label>
                  <div className="relative">
                    <input type="number" min="0" step="100" value={salaireFixe} onChange={e => setSalaireFixe(e.target.value)} className={INPUT_CLS + " pr-12"} placeholder="0" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">DA</span>
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLS}>{t("admin.decharges.fields.primes")}</label>
                  <div className="relative">
                    <input type="number" min="0" step="100" value={primes} onChange={e => setPrimes(e.target.value)} className={INPUT_CLS + " pr-12"} placeholder="0" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">DA</span>
                  </div>
                </div>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-[#E10600]">{t("admin.decharges.fields.net")}</span>
                <span className="text-lg font-black text-[#E10600]">{Math.round(montantNet).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} DA</span>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-2.5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.decharges.cancel")}</button>
              <button onClick={saveDecharge} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><Spinner />{t("admin.decharges.saving")}</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>{t("admin.decharges.saveAndPdf")}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Commission Create Modal ── */}
      {showCommModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCommModal(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-[#E10600] to-[#B80500] px-6 pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg></div>
                  <div>
                    <h3 className="font-bold text-white text-base">Reçu de Commission (Station)</h3>
                    <p className="text-white/70 text-xs">Nouveau reçu de paiement de commission</p>
                  </div>
                </div>
                <button onClick={() => setShowCommModal(false)} className="text-white/70 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-xl">×</button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              {commError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2"><svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{commError}</div>}
              <div>
                <label className={LABEL_CLS}>Station / Hub</label>
                <select value={commOfficeId} onChange={e => setCommOfficeId(e.target.value)} className={INPUT_CLS}>
                  <option value="">— Choisir une station —</option>
                  {offices.map(o => <option key={o.id} value={String(o.id)}>{officeLabel(o)}{o.phone ? " · " + o.phone : ""}</option>)}
                </select>
              </div>
              {selOffice && (
                <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600 grid grid-cols-2 gap-1.5">
                  <span><b>Wilaya :</b> {selOffice.wilaya}</span>
                  {selOffice.phone && <span><b>Tél :</b> {selOffice.phone}</span>}
                </div>
              )}
              <div>
                <label className={LABEL_CLS}>Nom de l'agent</label>
                <input value={commAgentName} onChange={e => setCommAgentName(e.target.value)} className={INPUT_CLS} placeholder="Nom complet de l'agent" />
              </div>
              <div>
                <label className={LABEL_CLS}>Période</label>
                <input value={commPeriod} onChange={e => setCommPeriod(e.target.value)} className={INPUT_CLS} placeholder="ex: Juin 2026" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Nb de colis</label>
                  <input type="number" min="0" value={commNbColis} onChange={e => setCommNbColis(e.target.value)} className={INPUT_CLS} placeholder="0" />
                </div>
                <div>
                  <label className={LABEL_CLS}>Bonus retour (DA)</label>
                  <div className="relative">
                    <input type="number" min="0" step="100" value={commBonusRetour} onChange={e => setCommBonusRetour(e.target.value)} className={INPUT_CLS + " pr-12"} placeholder="0" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">DA</span>
                  </div>
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Montant net commission</label>
                <div className="relative">
                  <input type="number" min="0" step="100" value={commMontantNet} onChange={e => setCommMontantNet(e.target.value)} className={INPUT_CLS + " pr-12"} placeholder="0" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">DA</span>
                </div>
              </div>
              {commMontantNet && parseFloat(commMontantNet) > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-[#E10600]">Montant Net</span>
                  <span className="text-lg font-black text-[#E10600]">{Math.round(parseFloat(commMontantNet)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} DA</span>
                </div>
              )}
            </div>
            <div className="px-6 pb-5 flex gap-2.5">
              <button onClick={() => setShowCommModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50">Annuler</button>
              <button onClick={saveCommission} disabled={commSaving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60 flex items-center justify-center gap-2">
                {commSaving ? <><Spinner />Enregistrement...</> : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Enregistrer & PDF</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm (Salary) ── */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl mx-4 w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
            <p className="font-bold text-gray-900 mb-1">{t("admin.decharges.deleteConfirm")}</p>
            <p className="text-sm text-gray-400 mb-5">{t("admin.decharges.deleteHint")}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">{t("admin.decharges.cancel")}</button>
              <button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">{t("admin.decharges.delete")}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm (Commission) ── */}
      {commDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCommDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl mx-4 w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4"><svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
            <p className="font-bold text-gray-900 mb-1">Supprimer ce reçu de commission ?</p>
            <p className="text-sm text-gray-400 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button onClick={() => setCommDeleteId(null)} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">Annuler</button>
              <button onClick={() => handleDeleteComm(commDeleteId)} className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
