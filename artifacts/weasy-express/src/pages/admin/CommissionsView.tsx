import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

interface ParsedUpload {
  breakdown: ParsedResult[];
  rateType?: string;
}

interface Office {
  id: number;
  wilaya: string;
  wilayaNumber: string | number;
  commune: string | null;
}

interface ReturnEntry {
  id: number;
  office_name: string;
  return_count: number;
  deduction_dzd: number;
  return_date: string;
  uploaded_by: string;
  created_at: string;
}

interface SpEntry {
  id: number;
  office_name: string;
  sp_count: number;
  commission_dzd: number;
  sp_date: string;
  uploaded_by: string;
  created_at: string;
}

const fmtN = (n: number) => Math.round(n).toLocaleString("fr-DZ");
const fmtDZ = (n: number) => `${fmtN(n)} DZD`;

const MONTHS = [
  "Janvier","Février","Mars","Avril","Mai","Juin",
  "Juillet","Août","Septembre","Octobre","Novembre","Décembre"
];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 4 }, (_, i) => THIS_YEAR - i);

const RATE_TYPE_LABELS: Record<string, string> = {
  classic_stop_desk: "Classique — Stop Desk",
  classic_domicile: "Classique — À Domicile",
  ecommerce_stop_desk: "E-commerce — Stop Desk",
  ecommerce_domicile: "E-commerce — À Domicile",
};

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

function parseUpload(u: CommissionUpload): ParsedUpload {
  try {
    const raw = JSON.parse(u.results_json ?? "[]");
    if (Array.isArray(raw)) return { breakdown: raw };
    if (raw && typeof raw === "object" && Array.isArray(raw.breakdown)) {
      return { breakdown: raw.breakdown as ParsedResult[], rateType: raw.rateType as string | undefined };
    }
    return { breakdown: [] };
  } catch { return { breakdown: [] }; }
}

function Spinner({ size = "sm" }: { size?: "sm" | "md" }) {
  const cls = size === "md" ? "w-6 h-6" : "w-4 h-4";
  return (
    <svg className={`animate-spin ${cls}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

type Tab = "offices" | "rates" | "returns" | "sp";

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

  // Returns (DB-backed)
  const [returns, setReturns] = useState<ReturnEntry[]>([]);
  const [returnsLoading, setReturnsLoading] = useState(false);

  const now = new Date();
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [showAllTime, setShowAllTime] = useState(false);

  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);
  const [expandedBreakId, setExpandedBreakId] = useState<number | null>(null);
  const [expandedReturnOffice, setExpandedReturnOffice] = useState<string | null>(null);

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

  // Return Rate state (DB-backed)
  const [returnRateInput, setReturnRateInput] = useState("");
  const [returnRate, setReturnRate] = useState(0);
  const [returnRateSaved, setReturnRateSaved] = useState(false);
  const [returnRateSaving, setReturnRateSaving] = useState(false);

  // Return modal state
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnModalOffice, setReturnModalOffice] = useState("");
  const [returnCount, setReturnCount] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [returnSaving, setReturnSaving] = useState(false);

  // SP (Stop Desk) state
  const [spEntries, setSpEntries] = useState<SpEntry[]>([]);
  const [spLoading, setSpLoading] = useState(false);
  const [spRate, setSpRate] = useState(0);
  const [spRateInput, setSpRateInput] = useState("");
  const [spRateSaved, setSpRateSaved] = useState(false);
  const [spRateSaving, setSpRateSaving] = useState(false);
  const [expandedSpOffice, setExpandedSpOffice] = useState<string | null>(null);

  // SP modal state
  const [showSpModal, setShowSpModal] = useState(false);
  const [spModalOffice, setSpModalOffice] = useState("");
  const [spCount, setSpCount] = useState("");
  const [spDate, setSpDate] = useState(new Date().toISOString().split("T")[0]);
  const [spSaving, setSpSaving] = useState(false);

  // Aggregate SP entries per office
  const spByOffice = useMemo(() => {
    const map: Record<string, { totalCount: number; totalCommission: number; entries: SpEntry[] }> = {};
    for (const e of spEntries) {
      if (!map[e.office_name]) map[e.office_name] = { totalCount: 0, totalCommission: 0, entries: [] };
      map[e.office_name].totalCount += Number(e.sp_count);
      map[e.office_name].totalCommission += Number(e.commission_dzd);
      map[e.office_name].entries.push(e);
    }
    return map;
  }, [spEntries]);

  // Aggregate returns per office
  const returnsByOffice = useMemo(() => {
    const map: Record<string, { totalCount: number; totalDeduction: number; entries: ReturnEntry[] }> = {};
    for (const r of returns) {
      if (!map[r.office_name]) map[r.office_name] = { totalCount: 0, totalDeduction: 0, entries: [] };
      map[r.office_name].totalCount += Number(r.return_count);
      map[r.office_name].totalDeduction += Number(r.deduction_dzd);
      map[r.office_name].entries.push(r);
    }
    return map;
  }, [returns]);

  // ── Fetch SP rate from DB ──────────────────────────────────────────────────
  const fetchSpRate = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/settings/commission_sp_rate`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok && d.value != null) {
        const rate = parseFloat(d.value) || 0;
        setSpRate(rate);
        setSpRateInput(rate > 0 ? String(rate) : "");
      }
    } catch {}
  }, []);

  // ── Fetch SP entries from DB ───────────────────────────────────────────────
  const fetchSp = useCallback(async () => {
    setSpLoading(true);
    try {
      const params = new URLSearchParams();
      if (!showAllTime) {
        const y = filterYear, m = filterMonth;
        params.set("from", `${y}-${String(m).padStart(2,"0")}-01`);
        params.set("to", `${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`);
      }
      const r = await fetch(`${API_BASE}/api/admin/commission-sp?${params}`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setSpEntries(d.entries ?? []);
    } catch {} finally { setSpLoading(false); }
  }, [showAllTime, filterYear, filterMonth]);

  async function saveSpRate() {
    setSpRateSaving(true);
    try {
      const rate = parseFloat(spRateInput) || 0;
      const res = await fetch(`${API_BASE}/api/admin/settings/commission_sp_rate`, {
        method: "PUT",
        headers: adminHeaders(),
        body: JSON.stringify({ value: String(rate) }),
      });
      const d = await res.json();
      if (d.ok) {
        setSpRate(rate);
        setSpRateSaved(true);
        setTimeout(() => setSpRateSaved(false), 2500);
      }
    } catch {} finally { setSpRateSaving(false); }
  }

  function openSpModal(officeName: string) {
    setSpModalOffice(officeName);
    setSpCount("");
    setSpDate(new Date().toISOString().split("T")[0]);
    setShowSpModal(true);
  }

  async function saveSp() {
    const count = parseInt(spCount) || 0;
    if (count <= 0) return;
    const commission = Math.round(count * spRate);
    setSpSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/commission-sp`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          office_name: spModalOffice,
          sp_count: count,
          commission_dzd: commission,
          sp_date: spDate,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setShowSpModal(false);
        const [savedYear, savedMonth] = spDate.split("-").map(Number);
        setSpCount("");
        setSpDate(new Date().toISOString().split("T")[0]);
        if (!showAllTime && (savedYear !== filterYear || savedMonth !== filterMonth)) {
          setFilterYear(savedYear);
          setFilterMonth(savedMonth);
        } else {
          await fetchSp();
        }
      }
    } catch {} finally { setSpSaving(false); }
  }

  async function deleteSp(id: number) {
    try {
      await fetch(`${API_BASE}/api/admin/commission-sp/${id}`, {
        method: "DELETE", headers: adminHeaders(),
      });
      await fetchSp();
    } catch {}
  }

  // ── Fetch return rate from DB ──────────────────────────────────────────────
  const fetchReturnRate = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/settings/commission_return_rate`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok && d.value != null) {
        const rate = parseFloat(d.value) || 0;
        setReturnRate(rate);
        setReturnRateInput(rate > 0 ? String(rate) : "");
      }
    } catch {}
  }, []);

  // ── Fetch returns from DB ──────────────────────────────────────────────────
  const fetchReturns = useCallback(async () => {
    setReturnsLoading(true);
    try {
      const params = new URLSearchParams();
      if (!showAllTime) {
        const y = filterYear, m = filterMonth;
        params.set("from", `${y}-${String(m).padStart(2,"0")}-01`);
        params.set("to", `${y}-${String(m).padStart(2,"0")}-${new Date(y, m, 0).getDate()}`);
      }
      const r = await fetch(`${API_BASE}/api/admin/commission-returns?${params}`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setReturns(d.returns ?? []);
    } catch {} finally { setReturnsLoading(false); }
  }, [showAllTime, filterYear, filterMonth]);

  async function saveReturnRate() {
    setReturnRateSaving(true);
    try {
      const rate = parseFloat(returnRateInput) || 0;
      const res = await fetch(`${API_BASE}/api/admin/settings/commission_return_rate`, {
        method: "PUT",
        headers: adminHeaders(),
        body: JSON.stringify({ value: String(rate) }),
      });
      const d = await res.json();
      if (d.ok) {
        setReturnRate(rate);
        setReturnRateSaved(true);
        setTimeout(() => setReturnRateSaved(false), 2500);
      }
    } catch {} finally { setReturnRateSaving(false); }
  }

  function openReturnModal(officeName: string) {
    setReturnModalOffice(officeName);
    setReturnCount("");
    setReturnDate(new Date().toISOString().split("T")[0]);
    setShowReturnModal(true);
  }

  async function saveReturn() {
    const count = parseInt(returnCount) || 0;
    if (count <= 0) return;
    const deduction = Math.round(count * returnRate);
    setReturnSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/commission-returns`, {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({
          office_name: returnModalOffice,
          return_count: count,
          deduction_dzd: deduction,
          return_date: returnDate,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setShowReturnModal(false);
        const [savedYear, savedMonth] = returnDate.split("-").map(Number);
        setReturnCount("");
        setReturnDate(new Date().toISOString().split("T")[0]);
        // Auto-switch filter period to match the saved entry's date
        if (!showAllTime && (savedYear !== filterYear || savedMonth !== filterMonth)) {
          setFilterYear(savedYear);
          setFilterMonth(savedMonth);
          // useEffect on filterYear/filterMonth will trigger fetchReturns automatically
        } else {
          await fetchReturns();
        }
      }
    } catch {} finally { setReturnSaving(false); }
  }

  async function deleteReturn(id: number) {
    try {
      await fetch(`${API_BASE}/api/admin/commission-returns/${id}`, {
        method: "DELETE", headers: adminHeaders(),
      });
      await fetchReturns();
    } catch {}
  }

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
  useEffect(() => { fetchReturns(); }, [fetchReturns]);
  useEffect(() => { fetchReturnRate(); }, [fetchReturnRate]);
  useEffect(() => { fetchSp(); }, [fetchSp]);
  useEffect(() => { fetchSpRate(); }, [fetchSpRate]);

  const officeUploads = useCallback(
    (name: string) => history.filter(h => h.period_label === name),
    [history]
  );

  const totalReturnsDZD = Object.values(returnsByOffice).reduce((s, v) => s + v.totalDeduction, 0);
  const totalSpDZD = Object.values(spByOffice).reduce((s, v) => s + v.totalCommission, 0);
  const periodTotal = history.reduce((s, h) => s + Number(h.total_commissions), 0) + totalReturnsDZD + totalSpDZD;
  const activeOfficeCount = new Set(history.map(h => h.period_label)).size;
  const totalDelivered = history.reduce((s, h) => {
    const { breakdown } = parseUpload(h);
    return s + breakdown.reduce((rs, r) => rs + (r.delivered ?? 0), 0);
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
      const { breakdown } = parseUpload(h);
      const delivered = breakdown.reduce((s, r) => s + (r.delivered ?? 0), 0);
      rows.push([h.period_label, new Date(h.created_at).toLocaleDateString("fr-DZ"), String(delivered), String(Math.round(Number(h.total_commissions)))]);
    }
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `commissions_${showAllTime ? "all" : `${filterYear}-${String(filterMonth).padStart(2,"0")}`}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  const tabBtn = (value: Tab, label: string) => (
    <button
      onClick={() => setTab(value)}
      className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${tab === value ? "bg-[#E10600] text-white shadow-sm" : "bg-white text-gray-600 border border-gray-200 hover:border-gray-300"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="p-6 lg:p-8 min-h-screen bg-gray-50/50">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.commissions.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.commissions.subtitle")} · {periodLabel}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabBtn("offices", t("admin.commissions.tabs.offices"))}
          {tabBtn("rates", t("admin.commissions.tabs.rates"))}
          {tabBtn("returns", t("admin.commissions.tabs.returns"))}
          {tabBtn("sp", t("admin.commissions.tabs.sp"))}
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
                <select value={filterMonth} onChange={e => setFilterMonth(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white">
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={filterYear} onChange={e => setFilterYear(Number(e.target.value))}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white">
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </>
            )}
            <div className="flex-1" />
            {history.length > 0 && (
              <button onClick={downloadCSV}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-[#E10600] border border-[#E10600]/30 bg-red-50 hover:bg-red-100 rounded-lg transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {t("admin.commissions.exportCsv")}
              </button>
            )}
          </div>

          {/* KPI */}
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
                const grossTotal = uploads.reduce((s, h) => s + Number(h.total_commissions), 0);
                const returnAgg = returnsByOffice[name];
                const spAgg = spByOffice[name];
                const netTotal = grossTotal + (returnAgg?.totalDeduction ?? 0) + (spAgg?.totalCommission ?? 0);
                const isExpanded = expandedOffice === name;
                const isReturnExpanded = expandedReturnOffice === name;
                const hasData = uploads.length > 0;
                const badge = wilayaBadge(office.wilayaNumber);
                const hasReturns = (returnAgg?.entries.length ?? 0) > 0;

                return (
                  <div key={office.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
                            <p className="text-lg font-black text-[#E10600]">{fmtDZ(netTotal)}</p>
                            {returnAgg && returnAgg.totalDeduction > 0 && (
                              <p className="text-xs text-green-700 font-semibold">
                                {fmtDZ(grossTotal)} + {fmtDZ(returnAgg.totalDeduction)}
                              </p>
                            )}
                            <p className="text-xs text-gray-400">
                              {fmtN(uploads.reduce((s, h) => {
                                const { breakdown } = parseUpload(h);
                                return s + breakdown.reduce((rs, r) => rs + (r.delivered ?? 0), 0);
                              }, 0))} {t("admin.commissions.office.parcels")}
                              {returnAgg && returnAgg.totalCount > 0 && (
                                <span className="text-red-400 ml-1">· {returnAgg.totalCount} {t("admin.commissions.office.returned")}</span>
                              )}
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
                        {/* Return history toggle */}
                        {hasReturns && !isExpanded && (
                          <button
                            onClick={() => setExpandedReturnOffice(isReturnExpanded ? null : name)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border ${isReturnExpanded ? "bg-red-100 text-red-800 border-red-200" : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"}`}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                            </svg>
                            {returnAgg?.entries.length}
                          </button>
                        )}
                        {/* Add Return button — always visible */}
                        <button
                          onClick={() => openReturnModal(name)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border ${hasReturns ? "bg-red-50 text-red-700 border-red-200 hover:bg-red-100" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          {t("admin.commissions.office.return")}
                        </button>
                        {/* Add SP (Stop Desk) button — always visible */}
                        {(() => {
                          const spAgg = spByOffice[name];
                          const hasSp = (spAgg?.entries.length ?? 0) > 0;
                          return (
                            <button
                              onClick={() => openSpModal(name)}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border ${hasSp ? "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"}`}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                              {t("admin.commissions.office.sp")}
                            </button>
                          );
                        })()}
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

                    {/* Return entries list (standalone, when not in upload expanded view) */}
                    {isReturnExpanded && !isExpanded && hasReturns && (
                      <div className="border-t border-red-100 bg-red-50/40">
                        <div className="px-5 py-2.5 flex items-center justify-between">
                          <p className="text-xs font-bold text-red-800">{t("admin.commissions.returnModal.historyTitle")} · {periodLabel}</p>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-red-100">
                              <th className="text-left text-xs font-semibold text-red-400 px-5 py-2">{t("admin.commissions.returnModal.date")}</th>
                              <th className="text-right text-xs font-semibold text-red-400 px-4 py-2">{t("admin.commissions.returnModal.count")}</th>
                              <th className="text-right text-xs font-semibold text-red-400 px-4 py-2">{t("admin.commissions.returnModal.deduction")}</th>
                              {role === "admin" && <th className="px-4 py-2 w-10" />}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100">
                            {returnAgg.entries.map(entry => (
                              <tr key={entry.id} className="hover:bg-red-50 transition-colors">
                                <td className="px-5 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                                  {new Date(entry.return_date).toLocaleDateString("fr-DZ", { day:"2-digit", month:"short", year:"numeric" })}
                                </td>
                                <td className="px-4 py-2.5 text-right text-red-700 font-bold">{fmtN(Number(entry.return_count))}</td>
                                <td className="px-4 py-2.5 text-right font-bold text-red-800">{fmtDZ(Number(entry.deduction_dzd))}</td>
                                {role === "admin" && (
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      onClick={() => deleteReturn(entry.id)}
                                      className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                      title="Supprimer"
                                    >
                                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-red-100/70 border-t-2 border-red-200/60">
                              <td className="px-5 py-2 text-xs font-bold text-red-800">Total</td>
                              <td className="px-4 py-2 text-right font-black text-red-800">{fmtN(returnAgg.totalCount)}</td>
                              <td className="px-4 py-2 text-right font-black text-red-800">{fmtDZ(returnAgg.totalDeduction)}</td>
                              {role === "admin" && <td />}
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}

                    {/* Expanded: upload history */}
                    {isExpanded && uploads.length > 0 && (
                      <div className="border-t border-gray-100 bg-gray-50/60">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="text-left text-xs font-semibold text-gray-400 px-5 py-2.5">Date</th>
                              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5 hidden sm:table-cell">Fichier</th>
                              <th className="text-left text-xs font-semibold text-gray-400 px-4 py-2.5 hidden md:table-cell">{t("admin.commissions.details.rateCategory")}</th>
                              <th className="text-right text-xs font-semibold text-gray-400 px-4 py-2.5">{t("admin.commissions.kpi.delivered")}</th>
                              <th className="text-right text-xs font-semibold text-gray-400 px-4 py-2.5">Commission</th>
                              <th className="px-4 py-2.5 w-28"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {uploads.map(u => {
                              const { breakdown, rateType } = parseUpload(u);
                              const delivered = breakdown.reduce((s, r) => s + (r.delivered ?? 0), 0);
                              const isBreakExpanded = expandedBreakId === u.id;

                              return (
                                <React.Fragment key={u.id}>
                                  <tr className="hover:bg-white/70 transition-colors">
                                    <td className="px-5 py-3 text-gray-700 font-medium whitespace-nowrap">
                                      {new Date(u.created_at).toLocaleDateString("fr-DZ", { day:"2-digit", month:"short", year:"numeric" })}
                                    </td>
                                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate hidden sm:table-cell" title={u.file_name}>
                                      {u.file_name}
                                    </td>
                                    <td className="px-4 py-3 hidden md:table-cell">
                                      {rateType ? (
                                        <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg whitespace-nowrap">
                                          {RATE_TYPE_LABELS[rateType] ?? rateType}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-300">—</span>
                                      )}
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
                                      <td colSpan={6} className="px-5 py-3 bg-white">
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
                                </React.Fragment>
                              );
                            })}
                          </tbody>

                          {/* Office total row */}
                          <tfoot>
                            <tr className="bg-red-50 border-t-2 border-[#E10600]/20">
                              <td colSpan={4} className="px-5 py-2.5 font-bold text-gray-900 text-xs uppercase tracking-wide">{t("admin.commissions.office.totalLabel")} {office.wilaya}</td>
                              <td className="px-4 py-2.5 text-right font-black text-[#E10600]">{fmtDZ(grossTotal)}</td>
                              <td className="px-4" />
                            </tr>
                          </tfoot>
                        </table>

                        {/* Return entries inline (when expanded) */}
                        {hasReturns && (
                          <div className="border-t border-red-100 bg-red-50/40">
                            <div className="px-5 py-2.5 flex items-center justify-between">
                              <p className="text-xs font-bold text-red-800">{t("admin.commissions.returnModal.historyTitle")} · {periodLabel}</p>
                              <p className="text-xs text-green-700 font-semibold">+ {fmtDZ(returnAgg?.totalDeduction ?? 0)}</p>
                            </div>
                            <table className="w-full text-sm">
                              <tbody className="divide-y divide-red-100">
                                {returnAgg?.entries.map(entry => (
                                  <tr key={entry.id} className="hover:bg-red-50 transition-colors">
                                    <td className="px-5 py-2.5 text-gray-700 font-medium whitespace-nowrap">
                                      {new Date(entry.return_date).toLocaleDateString("fr-DZ", { day:"2-digit", month:"short", year:"numeric" })}
                                    </td>
                                    <td className="px-4 py-2.5 text-red-700 font-bold">{fmtN(Number(entry.return_count))} colis</td>
                                    <td className="px-4 py-2.5 text-right font-bold text-red-800">{fmtDZ(Number(entry.deduction_dzd))}</td>
                                    <td className="px-4 py-2.5 w-10 text-right">
                                      {role === "admin" && (
                                        <button
                                          onClick={() => deleteReturn(entry.id)}
                                          className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr className="bg-red-100/70 border-t border-red-200/60">
                                  <td colSpan={2} className="px-5 py-2 text-xs font-bold text-red-800">Net {office.wilaya}</td>
                                  <td className="px-4 py-2 text-right font-black text-red-800">{fmtDZ(netTotal)}</td>
                                  <td />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        )}
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

      {/* ── SP (Stop Desk) Tab ── */}
      {tab === "sp" && (
        <div className="space-y-4 max-w-xl">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{t("admin.commissions.spRate.title")}</h2>
                <p className="text-xs text-gray-400">{t("admin.commissions.spRate.subtitle")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.spRate.rate")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={spRateInput}
                    onChange={e => setSpRateInput(e.target.value)}
                    placeholder="0"
                    className="w-40 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                  />
                  <span className="text-sm text-gray-400 font-medium">DZD / {t("admin.commissions.spRate.perParcel")}</span>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-800 leading-relaxed">
                {t("admin.commissions.spRate.explanation")}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveSpRate}
                  disabled={spRateSaving}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-[#E10600] hover:bg-[#B80500] text-white rounded-xl shadow-sm transition-colors disabled:opacity-60"
                >
                  {spRateSaving ? <Spinner /> : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  )}
                  {t("admin.commissions.spRate.save")}
                </button>
                {spRateSaved && (
                  <span className="text-sm text-green-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    {t("admin.commissions.spRate.saved")}
                  </span>
                )}
              </div>

              {spRate > 0 && (
                <p className="text-xs text-gray-500">
                  {t("admin.commissions.spRate.currentRate")} : <span className="font-bold text-gray-800">{fmtDZ(spRate)}</span> / {t("admin.commissions.spRate.perParcel")}
                </p>
              )}
            </div>
          </div>

          {/* SP summary per office */}
          {Object.keys(spByOffice).length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-bold text-gray-900">{t("admin.commissions.spModal.historyTitle")} · {periodLabel}</p>
                <p className="text-sm font-black text-[#E10600]">{fmtDZ(totalSpDZD)}</p>
              </div>
              {spLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />{t("admin.commissions.spRate.saving")}</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {Object.entries(spByOffice).map(([officeName, agg]) => (
                    <div key={officeName} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{officeName}</p>
                        <p className="text-xs text-gray-400">{fmtN(agg.totalCount)} {t("admin.commissions.office.spCount")}</p>
                      </div>
                      <p className="text-sm font-bold text-[#E10600] shrink-0">{fmtDZ(agg.totalCommission)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Return Rate Tab ── */}
      {tab === "returns" && (
        <div className="space-y-4 max-w-xl">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </div>
              <div>
                <h2 className="font-bold text-gray-900">{t("admin.commissions.returnRate.title")}</h2>
                <p className="text-xs text-gray-400">{t("admin.commissions.returnRate.subtitle")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.returnRate.rate")}</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={returnRateInput}
                    onChange={e => setReturnRateInput(e.target.value)}
                    placeholder="0"
                    className="w-40 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                  />
                  <span className="text-sm text-gray-400 font-medium">DZD / {t("admin.commissions.returnRate.perParcel")}</span>
                </div>
              </div>

              <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-xs text-red-800 leading-relaxed">
                {t("admin.commissions.returnRate.explanation")}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveReturnRate}
                  disabled={returnRateSaving}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-red-500 hover:bg-red-900 text-white rounded-xl shadow-sm transition-colors disabled:opacity-60"
                >
                  {returnRateSaving ? <Spinner /> : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                  )}
                  {t("admin.commissions.returnRate.save")}
                </button>
                {returnRateSaved && (
                  <span className="text-sm text-green-600 font-semibold flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    {t("admin.commissions.returnRate.saved")}
                  </span>
                )}
              </div>

              {returnRate > 0 && (
                <p className="text-xs text-gray-500">
                  {t("admin.commissions.returnRate.currentRate")} : <span className="font-bold text-gray-800">{fmtDZ(returnRate)}</span> / {t("admin.commissions.returnRate.perParcel")}
                </p>
              )}
            </div>
          </div>
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
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.details.rateCategory")}</label>
                <select
                  value={addRateType}
                  onChange={e => setAddRateType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                >
                  <option value="classic_stop_desk">{RATE_TYPE_LABELS.classic_stop_desk}</option>
                  <option value="classic_domicile">{RATE_TYPE_LABELS.classic_domicile}</option>
                  <option value="ecommerce_stop_desk">{RATE_TYPE_LABELS.ecommerce_stop_desk}</option>
                  <option value="ecommerce_domicile">{RATE_TYPE_LABELS.ecommerce_domicile}</option>
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

      {/* ── Return Modal ── */}
      {showReturnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowReturnModal(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900">{t("admin.commissions.returnModal.title")}</h3>
                <p className="text-xs text-gray-400 truncate">{returnModalOffice}</p>
              </div>
              <button onClick={() => setShowReturnModal(false)} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl shrink-0">×</button>
            </div>

            {returnRate === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 mb-4">
                {t("admin.commissions.returnModal.noRate")}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.returnModal.date")}</label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={e => setReturnDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.returnModal.count")}</label>
                <input
                  type="number"
                  min="0"
                  value={returnCount}
                  onChange={e => setReturnCount(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                />
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{t("admin.commissions.returnModal.rate")}</span>
                  <span className="font-semibold text-gray-700">{fmtDZ(returnRate)} / {t("admin.commissions.returnRate.perParcel")}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="font-semibold text-gray-700">{t("admin.commissions.returnModal.deduction")}</span>
                  <span className="font-black text-red-700">{fmtDZ(Math.round((parseInt(returnCount) || 0) * returnRate))}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowReturnModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                {t("admin.commissions.returnModal.cancel")}
              </button>
              <button
                onClick={saveReturn}
                disabled={returnRate === 0 || returnSaving || !returnCount || parseInt(returnCount) <= 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-red-500 hover:bg-red-900 text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors"
              >
                {returnSaving ? <Spinner /> : t("admin.commissions.returnModal.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SP Modal ── */}
      {showSpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSpModal(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-gray-900">{t("admin.commissions.spModal.title")}</h3>
                <p className="text-xs text-gray-400 truncate">{spModalOffice}</p>
              </div>
              <button onClick={() => setShowSpModal(false)} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl shrink-0">×</button>
            </div>

            {spRate === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 mb-4">
                {t("admin.commissions.spModal.noRate")}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.spModal.date")}</label>
                <input
                  type="date"
                  value={spDate}
                  onChange={e => setSpDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.spModal.count")}</label>
                <input
                  type="number"
                  min="0"
                  value={spCount}
                  onChange={e => setSpCount(e.target.value)}
                  placeholder="0"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                />
              </div>

              <div className="bg-gray-50 rounded-xl px-4 py-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">{t("admin.commissions.spModal.rate")}</span>
                  <span className="font-semibold text-gray-700">{fmtDZ(spRate)} / {t("admin.commissions.spRate.perParcel")}</span>
                </div>
                <div className="flex items-center justify-between text-sm border-t border-gray-200 pt-2">
                  <span className="font-semibold text-gray-700">{t("admin.commissions.spModal.commission")}</span>
                  <span className="font-black text-[#E10600]">{fmtDZ(Math.round((parseInt(spCount) || 0) * spRate))}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowSpModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                {t("admin.commissions.spModal.cancel")}
              </button>
              <button
                onClick={saveSp}
                disabled={spRate === 0 || spSaving || !spCount || parseInt(spCount) <= 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-[#E10600] hover:bg-[#B80500] text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors"
              >
                {spSaving ? <Spinner /> : t("admin.commissions.spModal.save")}
              </button>
            </div>
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
