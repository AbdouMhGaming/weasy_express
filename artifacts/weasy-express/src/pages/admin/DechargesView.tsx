import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

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
    const resp = await fetch("/logo-white.png");
    if (resp.ok) {
      const blob = await resp.blob();
      logoDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch { /* skip logo if unavailable */ }

  let y = 14;

  // ── Header ───────────────────────────────────────────────────────────────────
  const headerH = 34;
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

  // Logo top-right inside header — bigger and white version
  if (logoDataUrl) {
    const logoW = 52;
    const logoH = 26;
    doc.addImage(logoDataUrl, "PNG", W - 12 - logoW, 4, logoW, logoH);
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

export default function DechargesView() {
  const { t } = useTranslation();

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

  const montantNet = (parseFloat(salaireFixe) || 0) + (parseFloat(primes) || 0);
  const selWorker = workers.find(w => String(w.id) === selWorkerId) ?? null;

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const role = localStorage.getItem("admin_role") ?? "";

  const filteredDecharges = decharges.filter(d => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      `${d.worker_first_name} ${d.worker_last_name}`.toLowerCase().includes(q) ||
      d.recu_number.toLowerCase().includes(q) ||
      (d.period_label ?? "").toLowerCase().includes(q) ||
      (d.worker_position ?? "").toLowerCase().includes(q) ||
      (d.worker_hub ?? "").toLowerCase().includes(q)
    );
  });

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

  useEffect(() => { fetchDecharges(); fetchWorkers(); }, [fetchDecharges, fetchWorkers]);

  function openCreate() {
    setSelWorkerId(workers[0] ? String(workers[0].id) : "");
    setSalaireFixe(""); setPrimes("");
    const now = new Date();
    setPeriodLabel(`${now.toLocaleString("fr-DZ", { month: "long" })} ${now.getFullYear()}`);
    setFormError("");
    setShowModal(true);
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
        // Auto-download PDF for the newly created decharge
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

  async function handleDownload(d: Decharge) {
    setGenPdfId(d.id);
    await generatePDF(d);
    setGenPdfId(null);
  }

  async function handleDelete(id: number) {
    try {
      await fetch(`${API_BASE}/api/admin/decharges/${id}`, { method: "DELETE", headers: adminHeaders() });
      setConfirmDeleteId(null);
      fetchDecharges();
    } catch {}
  }

  return (
    <div className="p-6 lg:p-8 min-h-screen bg-gray-50/50">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.decharges.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.decharges.subtitle")}</p>
        </div>
        <button onClick={openCreate} disabled={workers.length === 0}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          {t("admin.decharges.create")}
        </button>
      </div>

      {/* Search bar */}
      {decharges.length > 0 && (
        <div className="mb-5">
          <div className="relative max-w-sm">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("admin.decharges.searchPlaceholder")}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-colors shadow-sm"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            )}
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
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
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
                {filteredDecharges.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-sm text-gray-400">
                      {t("admin.decharges.noResults", { query: searchQuery })}
                    </td>
                  </tr>
                ) : filteredDecharges.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs font-bold text-[#E10600] bg-red-50 px-2.5 py-1 rounded-lg border border-red-100">{d.recu_number}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#E10600] to-[#B80500] flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {d.worker_first_name[0]}{d.worker_last_name[0]}
                        </div>
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
                    <td className="px-4 py-3.5 text-gray-400 text-xs hidden lg:table-cell">
                      {new Date(d.created_at).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => handleDownload(d)} disabled={genPdfId === d.id}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-[#E10600] hover:bg-red-50 transition-colors disabled:opacity-50"
                          title={t("admin.decharges.download")}>
                          {genPdfId === d.id ? <Spinner /> : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          )}
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
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl mx-4 overflow-hidden">
            <div className="bg-gradient-to-r from-[#E10600] to-[#B80500] px-6 pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{t("admin.decharges.createTitle")}</h3>
                    <p className="text-white/70 text-xs">{t("admin.decharges.createSubtitle")}</p>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-xl">×</button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {formError}
                </div>
              )}

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

              {/* Net auto-calc */}
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-[#E10600]">{t("admin.decharges.fields.net")}</span>
                <span className="text-lg font-black text-[#E10600]">{Math.round(montantNet).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} DA</span>
              </div>
            </div>

            <div className="px-6 pb-5 flex gap-2.5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.decharges.cancel")}</button>
              <button onClick={saveDecharge} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><Spinner />{t("admin.decharges.saving")}</> : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>{t("admin.decharges.saveAndPdf")}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl mx-4 w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <p className="font-bold text-gray-900 mb-1">{t("admin.decharges.deleteConfirm")}</p>
            <p className="text-sm text-gray-400 mb-5">{t("admin.decharges.deleteHint")}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">{t("admin.decharges.cancel")}</button>
              <button onClick={() => handleDelete(confirmDeleteId)} className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">{t("admin.decharges.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
