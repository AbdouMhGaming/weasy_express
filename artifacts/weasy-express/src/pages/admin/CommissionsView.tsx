import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

interface CommissionUpload {
  id: number;
  uploaded_by: string;
  file_name: string;
  period_label: string;
  results_json: string | null;
  total_commissions: number;
  xlsx_file: string | null;
  created_at: string;
}

interface ParsedResult {
  office: string;
  wilaya: string;
  delivered: number;
  rate?: number;
  commission: number;
}

interface Office {
  id: number;
  wilaya: string;
  wilayaNumber: string | number;
  commune: string | null;
}

const fmtN = (n: number) => Math.round(n).toLocaleString("fr-DZ");
const fmtDZ = (n: number) => `${fmtN(n)} DZD`;

const MONTHS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 4 }, (_, i) => THIS_YEAR - i);

const ALL_WILAYAS: { num: string; name: string }[] = [
  { num: "01", name: "Adrar" }, { num: "02", name: "Chlef" }, { num: "03", name: "Laghouat" },
  { num: "04", name: "Oum El Bouaghi" }, { num: "05", name: "Batna" }, { num: "06", name: "Béjaïa" },
  { num: "07", name: "Biskra" }, { num: "08", name: "Béchar" }, { num: "09", name: "Blida" },
  { num: "10", name: "Bouira" }, { num: "11", name: "Tamanrasset" }, { num: "12", name: "Tébessa" },
  { num: "13", name: "Tlemcen" }, { num: "14", name: "Tiaret" }, { num: "15", name: "Tizi Ouzou" },
  { num: "16", name: "Alger" }, { num: "17", name: "Djelfa" }, { num: "18", name: "Jijel" },
  { num: "19", name: "Sétif" }, { num: "20", name: "Saïda" }, { num: "21", name: "Skikda" },
  { num: "22", name: "Sidi Bel Abbès" }, { num: "23", name: "Annaba" }, { num: "24", name: "Guelma" },
  { num: "25", name: "Constantine" }, { num: "26", name: "Médéa" }, { num: "27", name: "Mostaganem" },
  { num: "28", name: "M'Sila" }, { num: "29", name: "Mascara" }, { num: "30", name: "Ouargla" },
  { num: "31", name: "Oran" }, { num: "32", name: "El Bayadh" }, { num: "33", name: "Illizi" },
  { num: "34", name: "Bordj Bou Arréridj" }, { num: "35", name: "Boumerdès" }, { num: "36", name: "El Tarf" },
  { num: "37", name: "Tindouf" }, { num: "38", name: "Tissemsilt" }, { num: "39", name: "El Oued" },
  { num: "40", name: "Khenchela" }, { num: "41", name: "Souk Ahras" }, { num: "42", name: "Tipaza" },
  { num: "43", name: "Mila" }, { num: "44", name: "Aïn Defla" }, { num: "45", name: "Naâma" },
  { num: "46", name: "Aïn Témouchent" }, { num: "47", name: "Ghardaïa" }, { num: "48", name: "Relizane" },
  { num: "49", name: "Timimoun" }, { num: "50", name: "Bordj Badji Mokhtar" }, { num: "51", name: "Ouled Djellal" },
  { num: "52", name: "Béni Abbès" }, { num: "53", name: "In Salah" }, { num: "54", name: "In Guezzam" },
  { num: "55", name: "Touggourt" }, { num: "56", name: "Djanet" }, { num: "57", name: "El M'Ghair" },
  { num: "58", name: "El Menia" },
];

function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-6 h-6" : "w-4 h-4";
  return (
    <svg className={`animate-spin ${cls}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

type Tab = "offices" | "rates";

function fullOfficeName(o: Office): string {
  return `${o.wilaya}${o.commune ? " \u2014 " + o.commune : ""}`;
}

function wilayaBadge(wilayaNumber: string | number): string {
  const s = String(wilayaNumber);
  return s.includes(".") ? s : s.padStart(2, "0");
}

export default function CommissionsView() {
  const { t } = useTranslation();
  const role = useMemo(() => localStorage.getItem("admin_role") ?? "", []);

  const [tab, setTab] = useState<Tab>("offices");

  const [offices, setOffices] = useState<Office[]>([]);
  const [officesLoading, setOfficesLoading] = useState(true);
  const [history, setHistory] = useState<CommissionUpload[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [showAllTime, setShowAllTime] = useState(false);

  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);
  const [expandedBreakId, setExpandedBreakId] = useState<number | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addOffice, setAddOffice] = useState("");
  const [addFileName, setAddFileName] = useState("");
  const [addUploading, setAddUploading] = useState(false);
  const [addError, setAddError] = useState("");
  const addFileRef = useRef<HTMLInputElement>(null);

  const [addRateType, setAddRateType] = useState("classic_stop_desk");

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Per-office rates tab state
  const [expandedRateOffice, setExpandedRateOffice] = useState<string | null>(null);
  const [officeRateInputs, setOfficeRateInputs] = useState<Record<string, { csd: string; cd: string; esd: string; ed: string }>>({});
  const [officeRateLoading, setOfficeRateLoading] = useState(false);
  const [officeRateSaving, setOfficeRateSaving] = useState(false);
  const [officeRateSaved, setOfficeRateSaved] = useState(false);
  const [officeRateError, setOfficeRateError] = useState("");

  const fetchOffices = useCallback(async () => {
    setOfficesLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/offices`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setOffices(d.offices ?? []);
    } catch {} finally { setOfficesLoading(false); }
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (!showAllTime) {
        const y = filterYear, m = filterMonth;
        params.set("from", `${y}-${String(m).padStart(2,"0")}-01`);
        params.set("to", `${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`);
      }
      const r = await fetch(`${API_BASE}/api/admin/commissions/history?${params}`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setHistory(d.history ?? []);
    } catch {} finally { setHistoryLoading(false); }
  }, [showAllTime, filterYear, filterMonth]);

  useEffect(() => { fetchOffices(); }, [fetchOffices]);
  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const officeUploads = useCallback(
    (name: string) => history.filter(h => h.period_label === name),
    [history]
  );

  const periodTotal = history.reduce((s, h) => s + Number(h.total_commissions), 0);
  const activeOfficeCount = new Set(history.map(h => h.period_label)).size;
  const totalDelivered = history.reduce((s, h) => {
    try {
      const rows: ParsedResult[] = JSON.parse(h.results_json ?? "[]");
      return s + rows.reduce((rs, r) => rs + (r.delivered ?? 0), 0);
    } catch { return s; }
  }, 0);

  const periodLabel = showAllTime
    ? t("admin.commissions.showAll")
    : `${MONTHS[filterMonth - 1]} ${filterYear}`;

  function openAdd(officeName: string) {
    setAddOffice(officeName);
    setAddFileName("");
    setAddError("");
    setAddRateType("classic_stop_desk");
    if (addFileRef.current) addFileRef.current.value = "";
    setShowAddModal(true);
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = addFileRef.current?.files?.[0];
    if (!file) { setAddError(t("admin.commissions.add.noFile")); return; }
    setAddUploading(true); setAddError("");
    try {
      const fd = new FormData();
      fd.append("officeName", addOffice);
      fd.append("rateType", addRateType);
      fd.append("xlsx", file);
      const r = await fetch(`${API_BASE}/api/admin/commissions/add`, {
        method: "POST",
        headers: { Authorization: adminHeaders().Authorization },
        body: fd,
      });
      const d = await r.json();
      if (d.ok) {
        setShowAddModal(false);
        setExpandedOffice(addOffice);
        await fetchHistory();
      } else {
        setAddError(d.detail ?? d.error ?? "Erreur lors du traitement.");
      }
    } catch { setAddError(t("admin.commissions.add.connError")); } finally { setAddUploading(false); }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await fetch(`${API_BASE}/api/admin/commissions/${confirmDeleteId}`, {
        method: "DELETE", headers: adminHeaders(),
      });
      setConfirmDeleteId(null);
      await fetchHistory();
    } catch {} finally { setDeleting(false); }
  }

  async function downloadFile(id: number, fileName: string) {
    try {
      const res = await fetch(`${API_BASE}/api/admin/commissions/${id}/file`, { headers: adminHeaders() });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  async function loadOfficeRates(officeName: string) {
    setOfficeRateLoading(true); setOfficeRateError("");
    try {
      const r = await fetch(`${API_BASE}/api/admin/office-commission-rates?office=${encodeURIComponent(officeName)}`, { headers: adminHeaders() });
      const d = await r.json();
      const fetched: Record<string, { csd: number; cd: number; esd: number; ed: number }> = {};
      if (d.ok && Array.isArray(d.rates)) {
        for (const row of d.rates) {
          fetched[row.wilaya_name] = {
            csd: Number(row.classic_stop_desk_dzd ?? 0),
            cd:  Number(row.classic_domicile_dzd ?? 0),
            esd: Number(row.ecommerce_stop_desk_dzd ?? 0),
            ed:  Number(row.ecommerce_domicile_dzd ?? 0),
          };
        }
      }
      const inputs: Record<string, { csd: string; cd: string; esd: string; ed: string }> = {};
      for (const w of ALL_WILAYAS) {
        const f = fetched[w.name];
        inputs[w.name] = { csd: String(f?.csd ?? 0), cd: String(f?.cd ?? 0), esd: String(f?.esd ?? 0), ed: String(f?.ed ?? 0) };
      }
      setOfficeRateInputs(inputs);
    } catch {} finally { setOfficeRateLoading(false); }
  }

  async function saveOfficeRates(officeName: string) {
    setOfficeRateSaving(true); setOfficeRateError(""); setOfficeRateSaved(false);
    try {
      const rates = ALL_WILAYAS.map(w => ({
        wilaya_name: w.name, wilaya_number: w.num,
        classic_stop_desk_dzd:   parseFloat(officeRateInputs[w.name]?.csd ?? "0") || 0,
        classic_domicile_dzd:    parseFloat(officeRateInputs[w.name]?.cd ?? "0") || 0,
        ecommerce_stop_desk_dzd: parseFloat(officeRateInputs[w.name]?.esd ?? "0") || 0,
        ecommerce_domicile_dzd:  parseFloat(officeRateInputs[w.name]?.ed ?? "0") || 0,
      }));
      const r = await fetch(`${API_BASE}/api/admin/office-commission-rates/bulk`, {
        method: "PUT", headers: adminHeaders(), body: JSON.stringify({ office_name: officeName, rates }),
      });
      const d = await r.json();
      if (d.ok) { setOfficeRateSaved(true); setTimeout(() => setOfficeRateSaved(false), 2500); }
      else setOfficeRateError(d.error ?? "error");
    } catch { setOfficeRateError("connection error"); } finally { setOfficeRateSaving(false); }
  }

  function toggleRateOffice(officeName: string) {
    if (expandedRateOffice === officeName) {
      setExpandedRateOffice(null);
    } else {
      setExpandedRateOffice(officeName);
      setOfficeRateSaved(false);
      loadOfficeRates(officeName);
    }
  }

  function downloadCSV() {
    const rows = [[
      t("admin.commissions.add.bureau"), "Date",
      t("admin.commissions.office.parcels"), `${t("admin.commissions.kpi.total")} (DZD)`
    ]];
    for (const h of history) {
      let delivered = 0;
      try { delivered = (JSON.parse(h.results_json ?? "[]") as ParsedResult[]).reduce((s, r) => s + (r.delivered ?? 0), 0); } catch {}
      rows.push([h.period_label, new Date(h.created_at).toLocaleDateString("fr-DZ"), String(delivered), String(Math.round(Number(h.total_commissions)))]);
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `commissions_${showAllTime ? "all" : `${filterYear}-${String(filterMonth).padStart(2,"0")}`}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 lg:p-8 min-h-screen bg-gray-50/50">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.commissions.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.commissions.subtitle")} · {periodLabel}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setTab("offices")}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${tab === "offices" ? "bg-[#E10600] text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"}`}
          >
            {t("admin.commissions.tabs.offices")}
          </button>
          <button
            onClick={() => setTab("rates")}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${tab === "rates" ? "bg-[#E10600] text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"}`}
          >
            {t("admin.commissions.tabs.rates")}
          </button>
        </div>
      </div>

      {/* ── Offices Tab ── */}
      {tab === "offices" && (
        <div className="space-y-6">

          {/* Period filter */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 flex items-center gap-3 flex-wrap">
            <svg className="w-4 h-4 text-[#E10600] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-semibold text-gray-700 shrink-0">{t("admin.commissions.period")} :</span>

            <button
              onClick={() => setShowAllTime(v => !v)}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${showAllTime ? "bg-[#E10600] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
            >
              {t("admin.commissions.showAll")}
            </button>

            {!showAllTime && (
              <>
                <select
                  value={filterMonth}
                  onChange={e => setFilterMonth(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white"
                >
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select
                  value={filterYear}
                  onChange={e => setFilterYear(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white"
                >
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            )}

            <div className="flex-1" />

            {history.length > 0 && (
              <button
                onClick={downloadCSV}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-[#E10600] border border-[#E10600]/30 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t("admin.commissions.exportCsv")}
              </button>
            )}
          </div>

          {/* KPI Summary */}
          {!historyLoading && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t("admin.commissions.kpi.total")}</p>
                <p className="text-2xl font-black text-[#E10600]">{fmtDZ(periodTotal)}</p>
                <p className="text-xs text-gray-400 mt-1">{periodLabel}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t("admin.commissions.kpi.activeOffices")}</p>
                <p className="text-2xl font-black text-gray-800">{activeOfficeCount}</p>
                <p className="text-xs text-gray-400 mt-1">{t("admin.commissions.kpi.of")} {offices.length} {t("admin.commissions.kpi.bureaux")}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t("admin.commissions.kpi.delivered")}</p>
                <p className="text-2xl font-black text-gray-800">{fmtN(totalDelivered)}</p>
                <p className="text-xs text-gray-400 mt-1">{history.length} {history.length !== 1 ? t("admin.commissions.kpi.uploadsPlural") : t("admin.commissions.kpi.uploads")}</p>
              </div>
            </div>
          )}

          {/* Offices Grid */}
          {officesLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Spinner size="md" /><span className="text-sm">{t("admin.commissions.office.loadingOffices")}</span>
            </div>
          ) : offices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
              <p className="text-gray-400">{t("admin.commissions.office.noOffices")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offices.map(office => {
                const name = fullOfficeName(office);
                const uploads = officeUploads(name);
                const total = uploads.reduce((s, h) => s + Number(h.total_commissions), 0);
                const isExpanded = expandedOffice === name;
                const hasData = uploads.length > 0;
                const badge = wilayaBadge(office.wilayaNumber);

                return (
                  <div key={office.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    {/* Office row */}
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
                        style={{ background: hasData ? "#E10600" : "#f3f4f6", color: hasData ? "#fff" : "#9ca3af" }}
                      >
                        {badge}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 leading-tight">
                          {office.wilaya}
                          {office.commune && <span className="font-normal text-gray-400 text-sm"> &mdash; {office.commune}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {uploads.length > 0
                            ? `${uploads.length} ${uploads.length !== 1 ? t("admin.commissions.kpi.uploadsPlural") : t("admin.commissions.kpi.uploads")} · ${periodLabel}`
                            : `${t("admin.commissions.office.noData")} · ${periodLabel}`}
                        </p>
                      </div>

                      {/* Commission total */}
                      <div className="text-right shrink-0 mr-2">
                        {hasData ? (
                          <>
                            <p className="text-lg font-black text-[#E10600]">{fmtDZ(total)}</p>
                            <p className="text-xs text-gray-400">
                              {fmtN(uploads.reduce((s, h) => {
                                try { return s + (JSON.parse(h.results_json ?? "[]") as ParsedResult[]).reduce((rs, r) => rs + (r.delivered ?? 0), 0); }
                                catch { return s; }
                              }, 0))} {t("admin.commissions.office.parcels")}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-300 font-semibold">— DZD</p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        {hasData && (
                          <button
                            onClick={() => setExpandedOffice(isExpanded ? null : name)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border ${isExpanded ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"}`}
                          >
                            {isExpanded ? t("admin.commissions.office.hide") : t("admin.commissions.office.details")}
                          </button>
                        )}
                        <button
                          onClick={() => openAdd(name)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-[#E10600] hover:bg-[#B80500] text-white rounded-lg transition-colors shadow-sm"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                          </svg>
                          {t("admin.commissions.office.add")}
                        </button>
                      </div>
                    </div>

                    {/* Expanded: upload history for this office */}
                    {isExpanded && uploads.length > 0 && (
                      <div className="border-t border-gray-100 bg-gray-50/60">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-2.5">Date</th>
                              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5 hidden sm:table-cell">Fichier</th>
                              <th className="text-right text-xs font-semibold text-gray-400 px-4 py-2.5">{t("admin.commissions.kpi.delivered")}</th>
                              <th className="text-right text-xs font-semibold text-gray-400 px-4 py-2.5">Commission</th>
                              <th className="px-4 py-2.5 w-28"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {uploads.map(u => {
                              let delivered = 0;
                              let breakdown: ParsedResult[] = [];
                              try { breakdown = JSON.parse(u.results_json ?? "[]"); delivered = breakdown.reduce((s, r) => s + (r.delivered ?? 0), 0); } catch {}
                              const isBreakExpanded = expandedBreakId === u.id;

                              return (
                                <>
                                  <tr key={u.id} className="hover:bg-white/70 transition-colors">
                                    <td className="px-5 py-3 text-gray-700 font-medium whitespace-nowrap">
                                      {new Date(u.created_at).toLocaleDateString("fr-DZ", { day:"2-digit", month:"short", year:"numeric" })}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate hidden sm:table-cell" title={u.file_name}>
                                      {u.file_name}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-700 font-semibold">{fmtN(delivered)}</td>
                                    <td className="px-4 py-3 text-right font-bold text-[#E10600]">{fmtDZ(Number(u.total_commissions))}</td>
                                    <td className="px-4 py-3">
                                      <div className="flex items-center justify-end gap-1.5">
                                        {breakdown.length > 0 && (
                                          <button
                                            onClick={() => setExpandedBreakId(isBreakExpanded ? null : u.id)}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white transition-colors"
                                            title="Détail par wilaya"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={isBreakExpanded ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
                                            </svg>
                                          </button>
                                        )}
                                        {role === "admin" && u.xlsx_file && (
                                          <button
                                            onClick={() => downloadFile(u.id, u.file_name)}
                                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                            title={t("admin.commissions.download")}
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                          </button>
                                        )}
                                        {role === "admin" && (
                                          <button
                                            onClick={() => setConfirmDeleteId(u.id)}
                                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                            title="Supprimer"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                  </tr>

                                  {/* Per-wilaya breakdown */}
                                  {isBreakExpanded && breakdown.length > 0 && (
                                    <tr key={`break-${u.id}`}>
                                      <td colSpan={5} className="px-5 py-3 bg-white">
                                        <div className="rounded-xl border border-gray-100 overflow-hidden">
                                          <table className="w-full text-xs">
                                            <thead>
                                              <tr className="bg-gray-50 border-b border-gray-100">
                                                <th className="text-left font-semibold text-gray-500 px-4 py-2">{t("admin.commissions.ratesPerOffice.wilaya")}</th>
                                                <th className="text-right font-semibold text-gray-500 px-3 py-2">{t("admin.commissions.ratesPerOffice.delivered")}</th>
                                                <th className="text-right font-semibold text-gray-500 px-3 py-2">Taux</th>
                                                <th className="text-right font-semibold text-gray-500 px-4 py-2">Commission</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                              {breakdown.map((b, bi) => (
                                                <tr key={bi}>
                                                  <td className="px-4 py-1.5 font-medium text-gray-700">{b.wilaya}</td>
                                                  <td className="px-3 py-1.5 text-right text-gray-600">{fmtN(b.delivered)}</td>
                                                  <td className="px-3 py-1.5 text-right text-gray-400">{b.rate !== undefined ? fmtDZ(b.rate) : "—"}</td>
                                                  <td className="px-4 py-1.5 text-right font-bold text-[#E10600]">{fmtDZ(b.commission)}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </>
                              );
                            })}
                          </tbody>

                          {/* Office total row */}
                          <tfoot>
                            <tr className="bg-red-50 border-t-2 border-[#E10600]/20">
                              <td colSpan={3} className="px-5 py-2.5 font-bold text-gray-900 text-xs uppercase tracking-wide">{t("admin.commissions.office.totalLabel")} {office.wilaya}</td>
                              <td className="px-4 py-2.5 text-right font-black text-[#E10600]">{fmtDZ(total)}</td>
                              <td className="px-4" />
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading overlay */}
          {historyLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
              <Spinner /><span>{t("admin.commissions.office.loadingData")}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Rates Tab (per-office) ── */}
      {tab === "rates" && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4">
            <h2 className="font-bold text-gray-900">{t("admin.commissions.ratesPerOffice.title")}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t("admin.commissions.ratesPerOffice.subtitle")}</p>
          </div>

          {officesLoading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
              <Spinner size="md" /><span className="text-sm">{t("admin.commissions.ratesPerOffice.loading")}</span>
            </div>
          ) : offices.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
              <p className="text-gray-400">{t("admin.commissions.ratesPerOffice.noOffices")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {offices.map(office => {
                const name = fullOfficeName(office);
                const badge = wilayaBadge(office.wilayaNumber);
                const isExpanded = expandedRateOffice === name;

                return (
                  <div key={office.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm shrink-0 bg-gray-100 text-gray-500">
                        {badge}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-gray-900 leading-tight">
                          {office.wilaya}
                          {office.commune && <span className="font-normal text-gray-400 text-sm"> &mdash; {office.commune}</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{t("admin.commissions.ratesPerOffice.rate")}</p>
                      </div>
                      <button
                        onClick={() => toggleRateOffice(name)}
                        className={`px-4 py-2 text-xs font-bold rounded-xl border transition-colors ${isExpanded ? "bg-gray-100 text-gray-700 border-gray-200" : "bg-gray-50 text-[#E10600] border-[#E10600]/30 hover:bg-red-50"}`}
                      >
                        {isExpanded ? t("admin.commissions.ratesPerOffice.collapse") : t("admin.commissions.ratesPerOffice.expand")}
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-gray-100">
                        {officeRateLoading ? (
                          <div className="py-10 flex items-center justify-center gap-2 text-gray-400 text-sm">
                            <Spinner />{t("admin.commissions.ratesPerOffice.loading")}
                          </div>
                        ) : (
                          <>
                            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                              <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-white z-10">
                                  <tr className="border-b border-gray-100 bg-gray-50/80">
                                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 w-12">#</th>
                                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Wilaya</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 px-2 py-3 w-28">Classic SD</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 px-2 py-3 w-28">Classic Dom</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 px-2 py-3 w-28">Ecom SD</th>
                                    <th className="text-center text-xs font-semibold text-gray-500 px-2 py-3 w-28">Ecom Dom</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                  {ALL_WILAYAS.map(w => {
                                    const vals = officeRateInputs[w.name] ?? { csd: "0", cd: "0", esd: "0", ed: "0" };
                                    const isDirty = [vals.csd, vals.cd, vals.esd, vals.ed].some(v => parseFloat(v) !== 0);
                                    const inputCls = "w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right font-semibold text-[#E10600] focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white";
                                    return (
                                      <tr key={w.num} className="hover:bg-gray-50/60 transition-colors">
                                        <td className="px-5 py-2 text-xs font-bold text-gray-400">{w.num}</td>
                                        <td className="px-4 py-2 font-semibold text-gray-800 text-sm">
                                          {isDirty && <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#E10600]/60 mr-1.5 align-middle" />}
                                          {w.name}
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          <input type="number" min="0" step="0.5" value={vals.csd}
                                            onChange={e => setOfficeRateInputs(prev => ({ ...prev, [w.name]: { ...prev[w.name] ?? { csd:"0", cd:"0", esd:"0", ed:"0" }, csd: e.target.value } }))}
                                            className={inputCls} />
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          <input type="number" min="0" step="0.5" value={vals.cd}
                                            onChange={e => setOfficeRateInputs(prev => ({ ...prev, [w.name]: { ...prev[w.name] ?? { csd:"0", cd:"0", esd:"0", ed:"0" }, cd: e.target.value } }))}
                                            className={inputCls} />
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          <input type="number" min="0" step="0.5" value={vals.esd}
                                            onChange={e => setOfficeRateInputs(prev => ({ ...prev, [w.name]: { ...prev[w.name] ?? { csd:"0", cd:"0", esd:"0", ed:"0" }, esd: e.target.value } }))}
                                            className={inputCls} />
                                        </td>
                                        <td className="px-2 py-1.5 text-center">
                                          <input type="number" min="0" step="0.5" value={vals.ed}
                                            onChange={e => setOfficeRateInputs(prev => ({ ...prev, [w.name]: { ...prev[w.name] ?? { csd:"0", cd:"0", esd:"0", ed:"0" }, ed: e.target.value } }))}
                                            className={inputCls} />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {officeRateError && (
                              <p className="px-6 py-2 text-xs text-red-500 bg-red-50 border-t border-red-100">{officeRateError}</p>
                            )}
                            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                              {officeRateSaved && (
                                <span className="text-sm text-green-600 font-semibold flex items-center gap-1.5">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                  {t("admin.commissions.ratesPerOffice.saved")}
                                </span>
                              )}
                              <button
                                onClick={() => saveOfficeRates(name)}
                                disabled={officeRateSaving}
                                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-[#E10600] hover:bg-[#B80500] text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors"
                              >
                                {officeRateSaving ? <Spinner /> : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                                )}
                                {officeRateSaving ? t("admin.commissions.ratesPerOffice.saving") : t("admin.commissions.ratesPerOffice.save")}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Add Commission Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-[#E10600] px-6 py-5 text-white">
              <h3 className="font-bold text-lg">{t("admin.commissions.add.title")}</h3>
              <p className="text-sm text-white/80 mt-0.5">{t("admin.commissions.add.bureau")} : <span className="font-bold">{addOffice}</span></p>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catégorie de tarif</label>
                <select
                  value={addRateType}
                  onChange={e => setAddRateType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                >
                  <option value="classic_stop_desk">Classique — Stop Desk</option>
                  <option value="classic_domicile">Classique — À Domicile</option>
                  <option value="ecommerce_stop_desk">E-commerce — Stop Desk</option>
                  <option value="ecommerce_domicile">E-commerce — À Domicile</option>
                </select>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-xs text-gray-500 leading-relaxed">{t("admin.commissions.add.hint")}</p>
                <label className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-gray-900 hover:bg-gray-700 text-white rounded-xl cursor-pointer transition-colors w-fit">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  {t("admin.commissions.add.chooseFile")}
                  <input
                    ref={addFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="sr-only"
                    onChange={e => setAddFileName(e.target.files?.[0]?.name ?? "")}
                  />
                </label>
                {addFileName ? (
                  <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                    <svg className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="font-medium truncate">{addFileName}</span>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">{t("admin.commissions.add.formats")}</p>
                )}
              </div>

              {addError && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600 flex gap-2 items-start">
                  <svg className="w-4 h-4 text-red-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{addError}</span>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                  {t("admin.commissions.add.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={addUploading || !addFileName}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-[#E10600] hover:bg-[#B80500] text-white rounded-xl shadow-sm disabled:opacity-50 transition-colors"
                >
                  {addUploading ? <><Spinner />{t("admin.commissions.add.computing")}</> : t("admin.commissions.add.submit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[#E10600]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h3 className="font-bold text-gray-900 mb-2">{t("admin.commissions.delete.title")}</h3>
            <p className="text-sm text-gray-500 mb-6">{t("admin.commissions.delete.body")}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 text-sm font-medium border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600">
                {t("admin.commissions.delete.cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2.5 text-sm font-bold bg-[#E10600] text-white rounded-xl hover:bg-[#B80500] disabled:opacity-60 transition-colors"
              >
                {deleting ? <Spinner /> : t("admin.commissions.delete.confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
