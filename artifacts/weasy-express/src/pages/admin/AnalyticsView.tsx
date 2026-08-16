import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TicketStats {
  total: number; this_week: number; this_month: number; resolution_rate: number;
  avg_resolution_hours: number | null;
  by_status: Record<string, number>;
  by_destination: Record<string, number>;
  trend: { day: string; count: number }[];
  top_reasons: { label: string; count: number }[];
}
interface PayoutStats {
  total: number; this_week: number; this_month: number;
  total_amount: number; paid_amount: number; pending_amount: number;
  avg_amount: number; success_rate: number;
  by_status: Record<string, number>;
  trend: { day: string; count: number; amount: number }[];
}
interface Filters {
  preset: "all" | "today" | "7d" | "30d" | "90d" | "custom";
  from: string; to: string;
  hub: string; expediteur: string;
  ticketDest: string; ticketStatus: string; payoutStatus: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const TICKET_STATUSES = ["open","claimed","in_progress","resolved","pending_close","pending_accept","closed"];
const PAYOUT_STATUSES = ["pending","accepted","refused","delayed","paid"];
const TICKET_DESTS    = ["merchant","central_team","pickup_desk"];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-400", claimed: "bg-indigo-400", in_progress: "bg-amber-400",
  resolved: "bg-emerald-400", pending_close: "bg-orange-400", pending_accept: "bg-violet-400", closed: "bg-gray-400",
  pending: "bg-amber-400", accepted: "bg-blue-400", refused: "bg-red-400",
  delayed: "bg-orange-400", paid: "bg-emerald-500",
};

function isoDate(d: Date) { return d.toISOString().slice(0, 10); }
function today()  { return isoDate(new Date()); }
function daysAgo(n: number) { const d = new Date(); d.setDate(d.getDate() - n); return isoDate(d); }

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number)    { return n.toLocaleString(); }
function fmtDzd(n: number) { return n.toLocaleString() + " DZD"; }
function pct(part: number, total: number) { return total ? Math.round((part / total) * 100) : 0; }

function buildTrend(raw: { day: string; count: number }[], from: string, to: string) {
  const map  = new Map(raw.map(r => [r.day, r.count]));
  const start = new Date(from + "T00:00:00");
  const end   = new Date(to   + "T00:00:00");
  const diff  = Math.ceil((end.getTime() - start.getTime()) / 86400000);
  const days  = Math.max(1, Math.min(diff + 1, 90));
  const out: { day: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = isoDate(d);
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ReactNode;
}) {
  return (
    <div className="relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-hidden">
      <div className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl ${color}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gray-50">{icon}</div>
      </div>
    </div>
  );
}

function BarRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const p = pct(count, total);
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-gray-500 w-28 shrink-0 truncate">{label}</p>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${p}%` }} />
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs font-bold text-gray-700 w-6 text-right">{count}</span>
        <span className="text-xs text-gray-400 w-9">({p}%)</span>
      </div>
    </div>
  );
}

function Sparkline({ trend }: { trend: { day: string; count: number }[] }) {
  const max = Math.max(...trend.map(t => t.count), 1);
  const show = trend.length > 30 ? trend.filter((_, i) => i % 2 === 0) : trend; // thin out if too many
  return (
    <div className="flex items-end gap-px h-12">
      {show.map((t, i) => {
        const h = Math.max(3, Math.round((t.count / max) * 48));
        const isLast = i === show.length - 1;
        return (
          <div key={t.day} className="group relative flex-1 flex items-end min-w-0">
            <div
              className={`w-full rounded-sm transition-all ${isLast ? "bg-[#E10600]" : "bg-[#E10600]/25 group-hover:bg-[#E10600]/60"}`}
              style={{ height: `${h}px` }}
            />
            {t.count > 0 && (
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                {t.count}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="w-9 h-9 bg-[#E10600]/10 rounded-xl flex items-center justify-center shrink-0 text-[#E10600]">{icon}</div>
      <div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

// ActiveTag — shown below filter bar for each active filter
function ActiveTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-[#E10600]/8 border border-[#E10600]/20 text-[#E10600] rounded-full text-xs font-semibold">
      {label}
      <button onClick={onRemove} className="w-4 h-4 rounded-full hover:bg-[#E10600]/20 flex items-center justify-center transition-colors">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}

// ── Filter bar ─────────────────────────────────────────────────────────────────

function FilterBar({
  filters, setFilters, role, hubs, expediteurs, loading,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  role: string;
  hubs: string[];
  expediteurs: string[];
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  function set(patch: Partial<Filters>) { setFilters({ ...filters, ...patch }); }

  function setPreset(p: Filters["preset"]) {
    if (p === "today")  return set({ preset: p, from: today(),    to: today() });
    if (p === "7d")     return set({ preset: p, from: daysAgo(6), to: today() });
    if (p === "30d")    return set({ preset: p, from: daysAgo(29),to: today() });
    if (p === "90d")    return set({ preset: p, from: daysAgo(89),to: today() });
    if (p === "all")    return set({ preset: p, from: "",          to: "" });
    if (p === "custom") return set({ preset: p });
  }

  const presets: { key: Filters["preset"]; label: string }[] = [
    { key: "all",    label: t("admin.analytics.filters.all") },
    { key: "today",  label: t("admin.analytics.filters.today") },
    { key: "7d",     label: t("admin.analytics.filters.d7") },
    { key: "30d",    label: t("admin.analytics.filters.d30") },
    { key: "90d",    label: t("admin.analytics.filters.d90") },
    { key: "custom", label: t("admin.analytics.filters.custom") },
  ];

  const activeCount = [
    filters.preset !== "all",
    !!filters.hub,
    !!filters.expediteur,
    !!filters.ticketDest,
    !!filters.ticketStatus,
    !!filters.payoutStatus,
  ].filter(Boolean).length;

  const selectCls = "border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-all";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-5 overflow-hidden">
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(v => !v)}
        onKeyDown={e => e.key === "Enter" && setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-50/50 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="text-sm font-semibold text-gray-700">{t("admin.analytics.filters.title")}</span>
          {activeCount > 0 && (
            <span className="px-2 py-0.5 bg-[#E10600] text-white text-xs font-bold rounded-full leading-none">
              {activeCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => { e.stopPropagation(); setFilters({ preset: "all", from: "", to: "", hub: "", expediteur: "", ticketDest: "", ticketStatus: "", payoutStatus: "" }); }}
              onKeyDown={e => e.key === "Enter" && (e.stopPropagation(), setFilters({ preset: "all", from: "", to: "", hub: "", expediteur: "", ticketDest: "", ticketStatus: "", payoutStatus: "" }))}
              className="text-xs text-[#E10600] font-semibold hover:underline cursor-pointer"
            >
              {t("admin.analytics.filters.clearAll")}
            </span>
          )}
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-50 px-5 py-4 space-y-4">
          {/* Date preset row */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("admin.analytics.filters.dateRange")}</p>
            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => (
                <button
                  key={p.key}
                  onClick={() => setPreset(p.key)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    filters.preset === p.key
                      ? "bg-[#E10600] text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {filters.preset === "custom" && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 font-medium">{t("admin.analytics.filters.from")}</label>
                  <input type="date" value={filters.from} onChange={e => set({ from: e.target.value })}
                    className={`${selectCls} text-xs`} max={today()} />
                </div>
                <span className="text-gray-300">→</span>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 font-medium">{t("admin.analytics.filters.to")}</label>
                  <input type="date" value={filters.to} onChange={e => set({ to: e.target.value })}
                    className={`${selectCls} text-xs`} max={today()} min={filters.from} />
                </div>
              </div>
            )}
          </div>

          {/* Contextual filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {/* Hub — admin only */}
            {role === "admin" && hubs.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t("admin.analytics.filters.hub")}</label>
                <select value={filters.hub} onChange={e => set({ hub: e.target.value })} className={`${selectCls} w-full`}>
                  <option value="">{t("admin.analytics.filters.allHubs")}</option>
                  {hubs.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            )}

            {/* Expediteur — admin + office */}
            {(role === "admin" || role === "office") && expediteurs.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t("admin.analytics.filters.expediteur")}</label>
                <select value={filters.expediteur} onChange={e => set({ expediteur: e.target.value })} className={`${selectCls} w-full`}>
                  <option value="">{t("admin.analytics.filters.allExpediteurs")}</option>
                  {expediteurs.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            )}

            {/* Ticket destination */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t("admin.analytics.filters.ticketDest")}</label>
              <select value={filters.ticketDest} onChange={e => set({ ticketDest: e.target.value })} className={`${selectCls} w-full`}>
                <option value="">{t("admin.analytics.filters.allDests")}</option>
                {TICKET_DESTS.map(d => (
                  <option key={d} value={d}>{t(`admin.analytics.queue.types.${d}`)}</option>
                ))}
              </select>
            </div>

            {/* Ticket status */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t("admin.analytics.filters.ticketStatus")}</label>
              <select value={filters.ticketStatus} onChange={e => set({ ticketStatus: e.target.value })} className={`${selectCls} w-full`}>
                <option value="">{t("admin.analytics.filters.allStatuses")}</option>
                {TICKET_STATUSES.map(s => (
                  <option key={s} value={s}>{t(`admin.analytics.queue.statuses.${s}`)}</option>
                ))}
              </select>
            </div>

            {/* Payout status */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{t("admin.analytics.filters.payoutStatus")}</label>
              <select value={filters.payoutStatus} onChange={e => set({ payoutStatus: e.target.value })} className={`${selectCls} w-full`}>
                <option value="">{t("admin.analytics.filters.allStatuses")}</option>
                {PAYOUT_STATUSES.map(s => (
                  <option key={s} value={s}>{t(`admin.analytics.payouts.statuses.${s}`)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Active filter tags */}
          {activeCount > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {filters.preset !== "all" && (
                <ActiveTag
                  label={`📅 ${filters.preset === "custom" ? `${filters.from} → ${filters.to}` : presets.find(p => p.key === filters.preset)?.label}`}
                  onRemove={() => setPreset("all")}
                />
              )}
              {filters.hub && (
                <ActiveTag label={`🏢 ${filters.hub}`} onRemove={() => set({ hub: "" })} />
              )}
              {filters.expediteur && (
                <ActiveTag label={`👤 ${filters.expediteur}`} onRemove={() => set({ expediteur: "" })} />
              )}
              {filters.ticketDest && (
                <ActiveTag label={`🎫 ${t(`admin.analytics.queue.types.${filters.ticketDest}`)}`} onRemove={() => set({ ticketDest: "" })} />
              )}
              {filters.ticketStatus && (
                <ActiveTag label={`🏷 ${t(`admin.analytics.queue.statuses.${filters.ticketStatus}`)}`} onRemove={() => set({ ticketStatus: "" })} />
              )}
              {filters.payoutStatus && (
                <ActiveTag label={`💳 ${t(`admin.analytics.payouts.statuses.${filters.payoutStatus}`)}`} onRemove={() => set({ payoutStatus: "" })} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AnalyticsView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();
  const role = localStorage.getItem("admin_role") ?? "expediteur";

  const [loading, setLoading]   = useState(true);
  const [tickets, setTickets]   = useState<TicketStats | null>(null);
  const [payouts, setPayouts]   = useState<PayoutStats | null>(null);
  const [trendFrom, setTrendFrom] = useState(daysAgo(13));
  const [trendTo,   setTrendTo]   = useState(today());
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const [hubs, setHubs]               = useState<string[]>([]);
  const [expediteurs, setExpediteurs] = useState<string[]>([]);

  const [filters, setFilters] = useState<Filters>({
    preset: "all", from: "", to: "",
    hub: "", expediteur: "",
    ticketDest: "", ticketStatus: "", payoutStatus: "",
  });

  // Fetch dropdown options — called on mount and on every manual refresh
  const loadOptions = useCallback(() => {
    fetch(`${API_BASE}/api/analytics/options`, { headers: adminHeaders() })
      .then(r => r.json()).then(d => {
        if (d.ok) { setHubs(d.hubs ?? []); setExpediteurs(d.expediteurs ?? []); }
      }).catch(() => {});
  }, []);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  const load = useCallback(async (f: Filters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (f.from)          params.set("from",           f.from);
      if (f.to)            params.set("to",             f.to);
      if (f.hub)           params.set("hub",            f.hub);
      if (f.expediteur)    params.set("expediteur",     f.expediteur);
      if (f.ticketDest)    params.set("ticket_dest",    f.ticketDest);
      if (f.ticketStatus)  params.set("ticket_status",  f.ticketStatus);
      if (f.payoutStatus)  params.set("payout_status",  f.payoutStatus);

      const url = `${API_BASE}/api/analytics${params.toString() ? "?" + params.toString() : ""}`;
      const res  = await fetch(url, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setTickets(data.tickets);
        setPayouts(data.payouts);
        setTrendFrom(data.trendFrom);
        setTrendTo(data.trendTo);
        setFetchedAt(new Date());
      }
    } finally { setLoading(false); }
  }, [onUnauth]);

  // Auto-reload when filters change
  useEffect(() => { load(filters); }, [filters, load]);

  // Ticket status config
  const ticketStatusCfg = useMemo(() => TICKET_STATUSES.map(key => ({
    key,
    labelKey: `admin.analytics.queue.statuses.${key}`,
    color: STATUS_COLORS[key] ?? "bg-gray-300",
  })), []);

  const payoutStatusCfg = useMemo(() => PAYOUT_STATUSES.map(key => ({
    key,
    labelKey: `admin.analytics.payouts.statuses.${key}`,
    color: STATUS_COLORS[key] ?? "bg-gray-300",
  })), []);

  const tkt = tickets;
  const pyt = payouts;
  const ticketTrend = useMemo(() => buildTrend(tkt?.trend ?? [], trendFrom, trendTo), [tkt, trendFrom, trendTo]);
  const payoutTrend = useMemo(() => buildTrend(pyt?.trend ?? [], trendFrom, trendTo), [pyt, trendFrom, trendTo]);
  const ticketTotal = tkt?.total ?? 0;
  const payoutTotal = pyt?.total ?? 0;
  const paidAmt     = pyt?.paid_amount ?? 0;
  const totalAmt    = pyt?.total_amount ?? 0;
  const isDateFiltered = filters.preset !== "all";

  const skeletonClass = "bg-gray-200 rounded-lg animate-pulse";

  if (loading && !tickets) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <div className={`h-7 w-36 mb-2 ${skeletonClass}`} />
          <div className={`h-4 w-56 ${skeletonClass}`} />
        </div>
        <div className={`h-14 rounded-2xl mb-5 ${skeletonClass}`} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[...Array(4)].map((_, i) => <div key={i} className={`h-24 rounded-2xl ${skeletonClass}`} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => <div key={i} className={`h-48 rounded-2xl ${skeletonClass}`} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-gray-50">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t("admin.analytics.title")}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t("admin.analytics.subtitle")}</p>
        </div>
        <button
          onClick={() => { load(filters); loadOptions(); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-60"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t("admin.analytics.refresh")}
        </button>
      </div>

      {/* ── Filter bar ── */}
      <FilterBar
        filters={filters} setFilters={setFilters}
        role={role} hubs={hubs} expediteurs={expediteurs}
        loading={loading}
      />

      {/* ── Top KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label={t("admin.analytics.queue.total")} value={fmt(ticketTotal)}
          sub={!isDateFiltered ? `${tkt?.this_month ?? 0} ${t("admin.analytics.thisMonth")}` : undefined}
          color="bg-blue-500"
          icon={<svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h10" /></svg>}
        />
        <KpiCard
          label={t("admin.analytics.queue.resolutionRate")} value={`${tkt?.resolution_rate ?? 0}%`}
          sub={tkt?.avg_resolution_hours != null ? `~${tkt.avg_resolution_hours}h ${t("admin.analytics.avgTime")}` : "—"}
          color="bg-emerald-500"
          icon={<svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          label={t("admin.analytics.payouts.total")} value={fmt(payoutTotal)}
          sub={!isDateFiltered ? `${pyt?.this_month ?? 0} ${t("admin.analytics.thisMonth")}` : undefined}
          color="bg-[#E10600]"
          icon={<svg className="w-5 h-5 text-[#E10600]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        />
        <KpiCard
          label={t("admin.analytics.payouts.successRate")} value={`${pyt?.success_rate ?? 0}%`}
          sub={fmtDzd(paidAmt)}
          color="bg-violet-500"
          icon={<svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Queue: status bars */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            title={t("admin.analytics.queue.byStatus")}
            subtitle={`${fmt(ticketTotal)} ${t("admin.analytics.totalTickets")}`}
          />
          {ticketTotal === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t("admin.analytics.empty")}</p>
          ) : (
            <div className="space-y-3">
              {ticketStatusCfg.map(s => {
                const n = tkt?.by_status[s.key] ?? 0;
                return n > 0 ? <BarRow key={s.key} label={t(s.labelKey)} count={n} total={ticketTotal} color={s.color} /> : null;
              })}
            </div>
          )}
        </div>

        {/* Queue: trend + destination */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
            title={t("admin.analytics.queue.trend")}
            subtitle={`${trendFrom} → ${trendTo}`}
          />
          <Sparkline trend={ticketTrend} />
          {ticketTotal > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{t("admin.analytics.queue.byType")}</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "merchant",     color: "bg-indigo-50 text-indigo-700 border-indigo-100" },
                  { key: "central_team", color: "bg-amber-50 text-amber-700 border-amber-100" },
                  { key: "pickup_desk",  color: "bg-emerald-50 text-emerald-700 border-emerald-100" },
                ].map(d => (
                  <div key={d.key} className={`rounded-xl border px-3 py-2 ${d.color}`}>
                    <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70 truncate">
                      {t(`admin.analytics.queue.types.${d.key}`)}
                    </p>
                    <p className="text-xl font-black">{tkt?.by_destination[d.key] ?? 0}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Week / month mini-stats */}
          {!isDateFiltered && (
            <div className="mt-4 pt-4 border-t border-gray-50 grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-2xl font-black text-gray-800">{tkt?.this_week ?? 0}</p>
                <p className="text-xs text-gray-400">{t("admin.analytics.thisWeek")}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-gray-800">{tkt?.this_month ?? 0}</p>
                <p className="text-xs text-gray-400">{t("admin.analytics.thisMonth")}</p>
              </div>
            </div>
          )}
        </div>

        {/* Queue: top reasons */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>}
            title={t("admin.analytics.queue.topReasons")}
            subtitle={isDateFiltered ? `${trendFrom} → ${trendTo}` : t("admin.analytics.last30Days")}
          />
          {!tkt?.top_reasons?.length ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t("admin.analytics.empty")}</p>
          ) : (
            <div className="space-y-2.5">
              {tkt.top_reasons.map((r, i) => {
                const maxCount = tkt.top_reasons[0].count;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#E10600]/10 text-[#E10600] text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate capitalize">{r.label}</p>
                      <div className="mt-0.5 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-[#E10600]/70 rounded-full" style={{ width: `${pct(r.count, maxCount)}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-gray-500 shrink-0">{r.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payouts: status bars + amounts */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            title={t("admin.analytics.payouts.byStatus")}
            subtitle={`${fmt(payoutTotal)} ${t("admin.analytics.totalRequests")}`}
          />
          {payoutTotal === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">{t("admin.analytics.empty")}</p>
          ) : (
            <div className="space-y-3">
              {payoutStatusCfg.map(s => {
                const n = pyt?.by_status[s.key] ?? 0;
                return n > 0 ? <BarRow key={s.key} label={t(s.labelKey)} count={n} total={payoutTotal} color={s.color} /> : null;
              })}
            </div>
          )}
          <div className="mt-5 pt-4 border-t border-gray-50 grid grid-cols-3 gap-2">
            {[
              { label: t("admin.analytics.payouts.totalAmount"),   val: totalAmt,             color: "text-gray-800" },
              { label: t("admin.analytics.payouts.paidAmount"),    val: paidAmt,               color: "text-emerald-600" },
              { label: t("admin.analytics.payouts.pendingAmount"), val: pyt?.pending_amount??0, color: "text-amber-600" },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className={`text-sm font-black ${item.color} leading-tight`}>{fmt(Math.round(item.val))}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">DZD</p>
                <p className="text-[10px] text-gray-500 font-medium leading-tight mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Payouts: trend — full width */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <SectionHeader
              icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
              title={t("admin.analytics.payouts.trend")}
              subtitle={`${trendFrom} → ${trendTo}`}
            />
            <div className="flex items-center gap-6 flex-wrap">
              {!isDateFiltered && (
                <>
                  <div className="text-center">
                    <p className="text-lg font-black text-gray-800 leading-none">{pyt?.this_week ?? 0}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{t("admin.analytics.thisWeek")}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-black text-gray-800 leading-none">{pyt?.this_month ?? 0}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{t("admin.analytics.thisMonth")}</p>
                  </div>
                </>
              )}
              <div className="text-center">
                <p className="text-lg font-black text-gray-800 leading-none">{fmtDzd(pyt?.avg_amount ?? 0)}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{t("admin.analytics.payouts.avgAmount")}</p>
              </div>
            </div>
          </div>
          <Sparkline trend={payoutTrend} />
        </div>

      </div>

      {fetchedAt && (
        <p className="text-center text-[11px] text-gray-300 mt-6">
          {t("admin.analytics.updatedAt")} {fetchedAt.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
