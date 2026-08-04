import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

function formatSenderCompact(name: string | null, othersLabel: string, maxShow = 2): string {
  if (!name) return "—";
  const parts = name.split("|").map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length <= maxShow) return parts.join(", ");
  return `${parts.slice(0, maxShow).join(", ")} (+${parts.length - maxShow} ${othersLabel})`;
}

interface OfficeStats {
  totalReports: number;
  totalDelivered: number;
  totalDispatched: number;
  totalReturns: number;
  totalNetDzd: number;
  totalCodDzd: number;
  totalDispatchedDzd: number;
  fraisLivraison: number;
}

interface TopSender {
  sender_name: string;
  report_count: number;
  total_parcels: number;
  net_dzd: number;
}

interface OfficeReport {
  id: number;
  report_type: "delivery_receipt" | "route_sheet" | "returns_list" | "unknown";
  file_name: string;
  report_date: string;
  total_parcels: number;
  total_amount_dzd: number;
  net_amount_dzd: number;
  station: string | null;
  sender_name: string | null;
  tracking_numbers: string | null;
  wilayas: string | null;
  uploaded_by: string | null;
  created_at: string;
}

type OfficeTab = "dashboard" | "routes" | "returns" | "discharges";

const fmtN  = (n: number) => n.toLocaleString("fr-DZ");
const fmtDZ = (n: number) => `${fmtN(n)} DZD`;

function parseWilayaCounts(wilayas: string | null): Record<string, number> {
  if (!wilayas) return {};
  const result: Record<string, number> = {};
  for (const entry of wilayas.split(",").map(s => s.trim()).filter(Boolean)) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx !== -1) {
      const name  = entry.slice(0, colonIdx).trim();
      const count = parseInt(entry.slice(colonIdx + 1), 10);
      if (name && !isNaN(count) && count > 0) result[name] = (result[name] ?? 0) + count;
    } else {
      if (entry) result[entry] = (result[entry] ?? 0) + 1;
    }
  }
  return result;
}

function wilayasDisplay(wilayas: string | null): string {
  if (!wilayas) return "";
  return wilayas
    .split(",")
    .map(e => { const i = e.indexOf(":"); return i !== -1 ? e.slice(0, i).trim() : e.trim(); })
    .filter(Boolean)
    .join(", ");
}

const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};

function matchesSearch(r: OfficeReport, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    (r.sender_name ?? "").toLowerCase().includes(lower) ||
    (r.station ?? "").toLowerCase().includes(lower) ||
    (r.tracking_numbers ?? "").toLowerCase().includes(lower) ||
    (r.wilayas ?? "").toLowerCase().includes(lower) ||
    r.report_date.includes(lower) ||
    r.file_name.toLowerCase().includes(lower)
  );
}

function ReportTable({
  reports, isAdmin, onDelete, emptyMsg, columns, renderCells,
  searchPlaceholder, dateFromLabel, dateToLabel, clearLabel, noResultsMsg, deleteConfirm, trackingNumsLabel,
}: {
  reports: OfficeReport[];
  isAdmin: boolean;
  onDelete: (id: number) => void;
  emptyMsg: string;
  columns: string[];
  renderCells: (r: OfficeReport) => React.ReactNode;
  searchPlaceholder: string;
  dateFromLabel: string;
  dateToLabel: string;
  clearLabel: string;
  noResultsMsg: string;
  deleteConfirm: string;
  trackingNumsLabel: string;
}) {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filtered = useMemo(() => {
    return reports.filter(r => {
      if (!matchesSearch(r, search)) return false;
      if (dateFrom && r.report_date < dateFrom) return false;
      if (dateTo && r.report_date > dateTo) return false;
      return true;
    });
  }, [reports, search, dateFrom, dateTo]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 flex-1 min-w-48 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-[#E10600]/30 focus-within:border-[#E10600]">
          <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0" /></svg>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 text-sm focus:outline-none bg-transparent"
          />
          {search && <button onClick={() => setSearch("")} className="text-gray-400 hover:text-gray-600 shrink-0">×</button>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-xs text-gray-400 font-semibold px-1">{dateFromLabel}</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
          <span className="text-xs text-gray-400 font-semibold px-1">{dateToLabel}</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-2 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-xs text-[#E10600] font-semibold px-2 py-1 hover:bg-red-50 rounded-lg transition-colors">{clearLabel}</button>
          )}
        </div>
        <span className="text-xs text-gray-400 shrink-0">{filtered.length} / {reports.length}</span>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">{search || dateFrom || dateTo ? noResultsMsg : emptyMsg}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  {columns.map(col => (
                    <th key={col} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{col}</th>
                  ))}
                  {isAdmin && <th className="w-10 px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(r => (
                  <>
                    <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                      {renderCells(r)}
                      {isAdmin && (
                        <td className="px-3 py-3">
                          <button
                            onClick={() => { if (confirm(deleteConfirm)) onDelete(r.id); }}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      )}
                    </tr>
                    {r.tracking_numbers && (
                      <tr key={`${r.id}-tracking`} className="bg-blue-50/40">
                        <td colSpan={columns.length + (isAdmin ? 1 : 0)} className="px-4 py-2">
                          <p className="text-xs font-semibold text-blue-700 mb-1">{trackingNumsLabel}</p>
                          <div className="flex flex-wrap gap-1">
                            {r.tracking_numbers.split(",").map(t => t.trim()).filter(Boolean).map(t => (
                              <span key={t} className="text-xs font-mono bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{t}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OfficeDashboardView({ onUnauth, isAdmin }: { onUnauth: () => void; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<OfficeTab>("dashboard");
  const [stats, setStats]         = useState<OfficeStats | null>(null);
  const [senders, setSenders]     = useState<TopSender[]>([]);
  const [reports, setReports]     = useState<OfficeReport[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const TYPE = {
    delivery_receipt: { label: t("admin.office.reportTypes.delivery_receipt"), badge: "bg-emerald-100 text-emerald-700", icon: "✅" },
    route_sheet:      { label: t("admin.office.reportTypes.route_sheet"),      badge: "bg-blue-100 text-blue-700",    icon: "🗺️" },
    returns_list:     { label: t("admin.office.reportTypes.returns_list"),      badge: "bg-orange-100 text-orange-700", icon: "↩️" },
    unknown:          { label: t("admin.office.reportTypes.unknown"),           badge: "bg-gray-100 text-gray-500",     icon: "📄" },
  };

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/api/office/reports/stats`,  { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/office/reports`,        { headers: adminHeaders() }),
      ]);
      if (sRes.status === 401) { onUnauth(); return; }
      const [sd, rd] = await Promise.all([sRes.json(), rRes.json()]);
      if (sd.ok) { setStats(sd.stats); setSenders(sd.topSenders ?? []); }
      if (rd.ok) setReports(rd.reports ?? []);
    } catch { } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleUpload(file: File) {
    setUploading(true); setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch(`${API_BASE}/api/office/reports/upload`, {
        method: "POST",
        headers: { Authorization: adminHeaders().Authorization },
        body: fd,
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) {
        const tp = TYPE[data.reportType as keyof typeof TYPE] ?? TYPE.unknown;
        const parts = [
          `${tp.icon} ${tp.label} ${t("admin.office.upload.importedSuffix")}`,
          `${data.totalParcels} ${t("admin.office.upload.parcelUnit")}`,
          data.senderName ? `${t("admin.office.upload.senderLabel")} : ${data.senderName}` : "",
          data.netAmount   ? `${t("admin.office.upload.netLabel")} : ${fmtDZ(data.netAmount)}`  : "",
          data.totalAmount && !data.netAmount ? `${t("admin.office.upload.totalLabel")} : ${fmtDZ(data.totalAmount)}` : "",
        ].filter(Boolean);
        setUploadMsg({ ok: true, text: parts.join(" · ") });
        fetchAll();
      } else {
        setUploadMsg({ ok: false, text: `${t("admin.office.upload.errorPrefix")} ${data.detail ?? data.error ?? t("admin.office.upload.unrecognized")}` });
      }
    } catch {
      setUploadMsg({ ok: false, text: t("admin.office.upload.connectionError") });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteReport(id: number) {
    await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() });
    fetchAll();
  }

  const wilayaCount: Record<string, number> = {};
  for (const r of reports) {
    for (const [w, n] of Object.entries(parseWilayaCounts(r.wilayas))) {
      wilayaCount[w] = (wilayaCount[w] ?? 0) + n;
    }
  }
  const topWilayas = Object.entries(wilayaCount).sort(([, a], [, b]) => b - a);
  const maxW = topWilayas[0]?.[1] ?? 1;

  const deliveries = useMemo(() => reports.filter(r => r.report_type === "delivery_receipt"), [reports]);
  const routes     = useMemo(() => reports.filter(r => r.report_type === "route_sheet"), [reports]);
  const returns_   = useMemo(() => reports.filter(r => r.report_type === "returns_list"), [reports]);

  const othersLabel = t("admin.office.units.others");

  const Spinner = () => (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
  const Skeleton = ({ h = "h-8", w = "w-20" }: { h?: string; w?: string }) => (
    <div className={`${h} ${w} bg-gray-100 rounded animate-pulse`} />
  );

  const ALL_TABS: { key: OfficeTab; label: string; icon: string; count?: number; adminOnly?: boolean }[] = [
    { key: "dashboard",  label: t("admin.office.tabs.dashboard"),  icon: "📊" },
    { key: "routes",     label: t("admin.office.tabs.routes"),     icon: "🗺️", count: routes.length,     adminOnly: true },
    { key: "returns",    label: t("admin.office.tabs.returns"),    icon: "↩️", count: returns_.length,   adminOnly: true },
    { key: "discharges", label: t("admin.office.tabs.discharges"), icon: "✅", count: deliveries.length, adminOnly: true },
  ];
  const TABS = ALL_TABS.filter(tb => !tb.adminOnly || isAdmin);

  const tableProps = {
    searchPlaceholder: t("admin.office.table.search"),
    dateFromLabel: t("admin.office.table.dateFrom"),
    dateToLabel: t("admin.office.table.dateTo"),
    clearLabel: t("admin.office.table.clearDates"),
    noResultsMsg: t("admin.office.table.noResults"),
    deleteConfirm: t("admin.office.delete.report"),
    trackingNumsLabel: t("admin.office.table.trackingNums"),
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.office.title")}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t("admin.office.subtitle")}</p>
        </div>
        <button onClick={fetchAll}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors">
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t("admin.office.refresh")}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl w-fit flex-wrap">
        {TABS.map(tb => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all ${
              tab === tb.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            <span>{tb.icon}</span>
            <span className="hidden sm:inline">{tb.label}</span>
            {tb.count !== undefined && tb.count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === tb.key ? "bg-gray-100 text-gray-600" : "bg-white text-gray-500"}`}>
                {tb.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB: Dashboard */}
      {tab === "dashboard" && (
        <div className="space-y-6">

          {/* Upload zone */}
          <div
            className="relative bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-6 overflow-hidden"
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") handleUpload(f); }}
          >
            <div className="absolute inset-0 opacity-5 pointer-events-none select-none">
              <span className="absolute top-3 right-4 text-8xl">📄</span>
              <span className="absolute bottom-2 left-6 text-6xl">📋</span>
            </div>
            <div className="relative">
              <h2 className="text-white font-bold text-lg mb-0.5">{t("admin.office.upload.title")}</h2>
              <p className="text-white/50 text-sm mb-4">{t("admin.office.upload.subtitle")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <input ref={fileRef} type="file" accept="application/pdf" className="hidden" id="pdf-upload"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                <label htmlFor="pdf-upload"
                  className="flex items-center gap-2 text-sm font-bold bg-[#E10600] hover:bg-[#C50500] text-white px-5 py-2.5 rounded-xl cursor-pointer transition-colors shadow-lg shadow-red-900/30">
                  {uploading ? <><Spinner />{t("admin.office.upload.analyzing")}</> : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      {t("admin.office.upload.choose")}
                    </>
                  )}
                </label>
                <div className="flex flex-wrap gap-2">
                  {(["delivery_receipt", "route_sheet", "returns_list"] as const).map(k => (
                    <span key={k} className="text-xs text-white/60 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                      {TYPE[k].icon} {TYPE[k].label}
                    </span>
                  ))}
                </div>
              </div>
              {uploadMsg && (
                <div className={`mt-4 flex items-start gap-2 text-sm px-4 py-3 rounded-xl border ${uploadMsg.ok ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-red-500/15 text-red-300 border-red-500/25"}`}>
                  <span className="shrink-0">{uploadMsg.ok ? "✅" : "❌"}</span>
                  <span className="flex-1">{uploadMsg.text}</span>
                  <button onClick={() => setUploadMsg(null)} className="opacity-50 hover:opacity-100 ml-auto">✕</button>
                </div>
              )}
            </div>
          </div>

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {[
              { icon: "💰", label: t("admin.office.kpi.cod"),            value: stats ? fmtDZ(stats.totalCodDzd        ?? 0) : null, color: "from-amber-500 to-amber-600",    sub: t("admin.office.kpi.codSub") },
              { icon: "📊", label: t("admin.office.kpi.net"),            value: stats ? fmtDZ(stats.totalNetDzd        ?? 0) : null, color: "from-[#E10600] to-[#B80500]",  sub: t("admin.office.kpi.netSub") },
              { icon: "💸", label: t("admin.office.kpi.fees"),           value: stats ? fmtDZ(stats.fraisLivraison      ?? 0) : null, color: "from-slate-500 to-slate-700",  sub: t("admin.office.kpi.feesSub") },
              { icon: "🚚", label: t("admin.office.kpi.dispatchedValue"),value: stats ? fmtDZ(stats.totalDispatchedDzd  ?? 0) : null, color: "from-blue-500 to-blue-600",    sub: t("admin.office.kpi.dispatchedValueSub") },
              { icon: "✅", label: t("admin.office.kpi.delivered"),      value: stats ? fmtN(stats.totalDelivered   ?? 0)    : null, color: "from-emerald-500 to-emerald-600", sub: t("admin.office.kpi.deliveredSub") },
              { icon: "🗺️", label: t("admin.office.kpi.dispatched"),     value: stats ? fmtN(stats.totalDispatched  ?? 0)    : null, color: "from-sky-500 to-sky-600",         sub: t("admin.office.kpi.dispatchedSub") },
              { icon: "↩️", label: t("admin.office.kpi.returns"),        value: stats ? fmtN(stats.totalReturns     ?? 0)    : null, color: "from-orange-500 to-orange-600",   sub: t("admin.office.kpi.returnsSub") },
              { icon: "📄", label: t("admin.office.kpi.pdfs"),           value: stats ? fmtN(stats.totalReports     ?? 0)    : null, color: "from-gray-500 to-gray-700",        sub: t("admin.office.kpi.pdfsSub") },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} text-white text-base flex items-center justify-center shrink-0`}>{c.icon}</div>
                <div className="min-w-0">
                  {loading || !c.value ? <Skeleton h="h-6" w="w-20" /> : (
                    <p className="text-lg font-bold text-gray-900 leading-none truncate">{c.value}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5 font-medium truncate">{c.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-start justify-between mb-1">
                <h3 className="font-bold text-gray-900">{t("admin.office.charts.wilayas")}</h3>
                {topWilayas.length > 0 && (
                  <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5 shrink-0">
                    {topWilayas.length} {topWilayas.length > 1 ? t("admin.office.units.report").replace("تقرير","ولايات") : ""} · {fmtN(Object.values(wilayaCount).reduce((a, b) => a + b, 0))} {t("admin.office.units.parcel")}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-400 mb-4">{t("admin.office.charts.wilayasSubtitle")}</p>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-7 bg-gray-100 rounded-lg animate-pulse" />)}</div>
              ) : topWilayas.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">{t("admin.office.charts.noData")}</p>
              ) : (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {topWilayas.map(([name, count]) => (
                    <div key={name} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-36 truncate shrink-0 font-medium">{name}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                        <div className="h-2.5 rounded-full bg-gradient-to-r from-[#E10600] to-[#FF4444] transition-all" style={{ width: `${Math.round((count / maxW) * 100)}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-700 w-8 text-right shrink-0">{fmtN(count)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-1">{t("admin.office.charts.topSenders")}</h3>
              <p className="text-xs text-gray-400 mb-4">{t("admin.office.charts.topSendersSubtitle")}</p>
              {loading ? (
                <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
              ) : senders.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">{t("admin.office.charts.noSenders")}</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {senders.map((s, i) => (
                    <div key={s.sender_name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                      <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{s.sender_name}</p>
                        <p className="text-xs text-gray-400">{s.report_count} {s.report_count > 1 ? t("admin.office.units.reports") : t("admin.office.units.report")}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-gray-900">{fmtN(Number(s.total_parcels))} {t("admin.office.units.parcel")}</p>
                        {Number(s.net_dzd) > 0 && <p className="text-xs text-emerald-600">{fmtDZ(Number(s.net_dzd))}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Per-type compact sections */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <ReportSection title={t("admin.office.sections.dischargesTitle")} icon="✅" accent="emerald" empty={t("admin.office.sections.noDischarges")}
              rows={deliveries.slice(0, 6)} isAdmin={isAdmin} deleteConfirm={t("admin.office.delete.confirm")}
              onDelete={async id => { await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() }); fetchAll(); }}
              renderRow={r => (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                    <span className="text-xs font-bold text-gray-900">{r.total_parcels} {t("admin.office.units.parcel")}</span>
                  </div>
                  {r.sender_name && <p className="text-xs text-gray-500 truncate mt-0.5">📦 {r.sender_name}</p>}
                  {r.wilayas    && <p className="text-xs text-[#E10600] truncate mt-0.5">📍 {wilayasDisplay(r.wilayas)}</p>}
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {r.total_amount_dzd > 0 && <span className="text-xs text-gray-400">COD: {fmtDZ(r.total_amount_dzd)}</span>}
                    {r.net_amount_dzd   > 0 && <span className="text-xs text-emerald-600 font-semibold">Net: {fmtDZ(r.net_amount_dzd)}</span>}
                  </div>
                </>
              )}
            />
            <ReportSection title={t("admin.office.sections.routesTitle")} icon="🗺️" accent="blue" empty={t("admin.office.sections.noRoutes")}
              rows={routes.slice(0, 6)} isAdmin={isAdmin} deleteConfirm={t("admin.office.delete.confirm")}
              onDelete={async id => { await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() }); fetchAll(); }}
              renderRow={r => (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                    <span className="text-xs font-bold text-gray-900">{r.total_parcels} {t("admin.office.units.parcel")}</span>
                  </div>
                  {r.station     && <p className="text-xs text-gray-500 truncate mt-0.5">🏢 {r.station}</p>}
                  {r.wilayas     && <p className="text-xs text-blue-600 truncate mt-0.5">📍 {wilayasDisplay(r.wilayas)}</p>}
                  {r.sender_name && <p className="text-xs text-gray-400 truncate mt-0.5">📦 {formatSenderCompact(r.sender_name, othersLabel)}</p>}
                  {r.total_amount_dzd > 0 && <p className="text-xs text-gray-500 mt-0.5">{fmtDZ(r.total_amount_dzd)}</p>}
                </>
              )}
            />
            <ReportSection title={t("admin.office.sections.returnsTitle")} icon="↩️" accent="orange" empty={t("admin.office.sections.noReturns")}
              rows={returns_.slice(0, 6)} isAdmin={isAdmin} deleteConfirm={t("admin.office.delete.confirm")}
              onDelete={async id => { await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() }); fetchAll(); }}
              renderRow={r => (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                    <span className="text-xs font-bold text-gray-900">{r.total_parcels} {t("admin.office.units.returnUnit")}</span>
                  </div>
                  {r.sender_name && <p className="text-xs text-gray-500 truncate mt-0.5">📦 {r.sender_name}</p>}
                  {r.station     && <p className="text-xs text-gray-500 truncate mt-0.5">🏢 {r.station}</p>}
                  {r.wilayas     && <p className="text-xs text-orange-600 truncate mt-0.5">📍 {wilayasDisplay(r.wilayas)}</p>}
                </>
              )}
            />
          </div>

          {/* Full history */}
          {reports.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-bold text-gray-900">{t("admin.office.sections.allReports")}</h3>
                <span className="text-xs text-gray-400">{reports.length} {reports.length > 1 ? t("admin.office.units.files") : t("admin.office.units.file")}</span>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {reports.map(r => {
                  const tp = TYPE[r.report_type] ?? TYPE.unknown;
                  return (
                    <div key={r.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                      <span className="text-base shrink-0">{tp.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${tp.badge}`}>{tp.label}</span>
                          <span className="text-xs text-gray-400">{fmtDate(r.report_date)}</span>
                          {r.sender_name && <span className="text-xs text-gray-500 truncate max-w-[120px]">{r.sender_name}</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate mt-0.5">{r.file_name}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold text-gray-700">{r.total_parcels} {t("admin.office.units.parcel")}</p>
                        {r.net_amount_dzd > 0 && <p className="text-xs text-emerald-600">{fmtDZ(r.net_amount_dzd)}</p>}
                        {r.total_amount_dzd > 0 && r.net_amount_dzd === 0 && <p className="text-xs text-gray-400">{fmtDZ(r.total_amount_dzd)}</p>}
                      </div>
                      {isAdmin && (
                        <button onClick={async () => { if (!confirm(t("admin.office.delete.report"))) return; deleteReport(r.id); }}
                          className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Routes (POD) */}
      {tab === "routes" && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t("admin.office.tabContent.routesTitle")}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{t("admin.office.tabContent.routesSubtitle")} — {routes.length} {routes.length !== 1 ? t("admin.office.units.reports") : t("admin.office.units.report")}</p>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : (
            <ReportTable
              reports={routes}
              isAdmin={isAdmin}
              onDelete={deleteReport}
              emptyMsg={t("admin.office.table.emptyRoutes")}
              columns={[t("admin.office.table.date"), t("admin.office.table.station"), t("admin.office.table.sender"), t("admin.office.table.parcels"), t("admin.office.table.wilayas"), t("admin.office.table.tracking")]}
              {...tableProps}
              renderCells={r => (
                <>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-700">{r.station ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-700 font-medium">{formatSenderCompact(r.sender_name, othersLabel)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-gray-900">{r.total_parcels}</span>
                    {r.total_amount_dzd > 0 && <p className="text-xs text-gray-400">{fmtDZ(r.total_amount_dzd)}</p>}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {r.wilayas ? (
                      <span className="text-xs text-blue-700 leading-relaxed">{wilayasDisplay(r.wilayas)}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.tracking_numbers ? (
                      <details className="cursor-pointer">
                        <summary className="text-xs text-[#E10600] font-semibold hover:text-[#B80500] list-none">
                          {r.tracking_numbers.split(",").filter(Boolean).length} ▾
                        </summary>
                        <div className="mt-2 flex flex-wrap gap-1 max-w-xs">
                          {r.tracking_numbers.split(",").map(tn => tn.trim()).filter(Boolean).map(tn => (
                            <span key={tn} className="text-xs font-mono bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-100">{tn}</span>
                          ))}
                        </div>
                      </details>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                </>
              )}
            />
          )}
        </div>
      )}

      {/* TAB: Returns */}
      {tab === "returns" && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t("admin.office.tabContent.returnsTitle")}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{t("admin.office.tabContent.returnsSubtitle")} — {returns_.length} {returns_.length !== 1 ? t("admin.office.units.reports") : t("admin.office.units.report")}</p>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : (
            <ReportTable
              reports={returns_}
              isAdmin={isAdmin}
              onDelete={deleteReport}
              emptyMsg={t("admin.office.table.emptyReturns")}
              columns={[t("admin.office.table.date"), t("admin.office.table.sender"), t("admin.office.table.station"), t("admin.office.table.parcels"), t("admin.office.table.wilayas"), t("admin.office.table.file")]}
              {...tableProps}
              renderCells={r => (
                <>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-700 font-medium">{r.sender_name ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-700">{r.station ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-orange-700">{r.total_parcels}</span>
                    <p className="text-xs text-gray-400">{t("admin.office.units.returnUnit")}</p>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {r.wilayas ? (
                      <span className="text-xs text-orange-700 leading-relaxed">{wilayasDisplay(r.wilayas)}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className="text-xs text-gray-400 truncate block">{r.file_name}</span>
                  </td>
                </>
              )}
            />
          )}
        </div>
      )}

      {/* TAB: Discharges */}
      {tab === "discharges" && (
        <div>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-900">{t("admin.office.tabContent.dischargesTitle")}</h2>
            <p className="text-sm text-gray-400 mt-0.5">{t("admin.office.tabContent.dischargesSubtitle")} — {deliveries.length} {deliveries.length !== 1 ? t("admin.office.units.reports") : t("admin.office.units.report")}</p>
          </div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}</div>
          ) : (
            <ReportTable
              reports={deliveries}
              isAdmin={isAdmin}
              onDelete={deleteReport}
              emptyMsg={t("admin.office.table.emptyDischarges")}
              columns={[t("admin.office.table.date"), t("admin.office.table.sender"), t("admin.office.table.parcels"), t("admin.office.table.codTotal"), t("admin.office.table.netReceived"), t("admin.office.table.wilayas"), t("admin.office.table.file")]}
              {...tableProps}
              renderCells={r => (
                <>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-gray-700 font-medium">{r.sender_name ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-bold text-emerald-700">{r.total_parcels}</span>
                    <p className="text-xs text-gray-400">{t("admin.office.units.delivered")}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.total_amount_dzd > 0 ? (
                      <span className="text-xs font-semibold text-amber-700">{fmtDZ(r.total_amount_dzd)}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.net_amount_dzd > 0 ? (
                      <span className="text-xs font-bold text-emerald-600">{fmtDZ(r.net_amount_dzd)}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {r.wilayas ? (
                      <span className="text-xs text-emerald-700 leading-relaxed">{wilayasDisplay(r.wilayas)}</span>
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 max-w-[160px]">
                    <span className="text-xs text-gray-400 truncate block">{r.file_name}</span>
                  </td>
                </>
              )}
            />
          )}
        </div>
      )}

    </div>
  );
}

function ReportSection({
  title, icon, accent, empty, rows, isAdmin, onDelete, renderRow, deleteConfirm,
}: {
  title: string;
  icon: string;
  accent: "emerald" | "blue" | "orange";
  empty: string;
  rows: OfficeReport[];
  isAdmin: boolean;
  onDelete: (id: number) => void;
  renderRow: (r: OfficeReport) => React.ReactNode;
  deleteConfirm: string;
}) {
  const borderColor = { emerald: "border-emerald-200", blue: "border-blue-200", orange: "border-orange-200" }[accent];
  const iconBg      = { emerald: "bg-emerald-50",      blue: "bg-blue-50",      orange: "bg-orange-50"      }[accent];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`px-5 py-3 border-b ${borderColor} flex items-center gap-2`}>
        <span className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center text-sm`}>{icon}</span>
        <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
        <span className="ml-auto text-xs text-gray-400">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-400 text-xs text-center py-8">{empty}</p>
      ) : (
        <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
          {rows.map(r => (
            <div key={r.id} className="px-4 py-3 hover:bg-gray-50 transition-colors flex gap-2">
              <div className="flex-1 min-w-0">{renderRow(r)}</div>
              {isAdmin && (
                <button
                  onClick={() => { if (confirm(deleteConfirm)) onDelete(r.id); }}
                  className="text-gray-200 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors shrink-0 self-start"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
