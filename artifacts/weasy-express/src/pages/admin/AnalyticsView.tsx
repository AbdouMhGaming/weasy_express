import { useState, useEffect, useCallback } from "react";
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString(); }
function fmtDzd(n: number) { return n.toLocaleString() + " DZD"; }

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

// Build last-14-day skeleton so gaps show as zero
function buildTrend(raw: { day: string; count: number }[]): { day: string; count: number }[] {
  const map = new Map(raw.map(r => [r.day, r.count]));
  const out: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string;
  color: string; icon: React.ReactNode;
}) {
  return (
    <div className={`relative bg-white rounded-2xl border border-gray-100 shadow-sm p-5 overflow-hidden`}>
      <div className={`absolute inset-y-0 left-0 w-1 rounded-l-2xl ${color}`} />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
          <p className="text-2xl font-black text-gray-900 leading-none">{value}</p>
          {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color.replace("bg-", "bg-").replace("-600", "-50").replace("-500", "-50")} opacity-80`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface BarRowProps { label: string; count: number; total: number; color: string; }
function BarRow({ label, count, total, color }: BarRowProps) {
  const p = pct(count, total);
  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-gray-500 w-28 shrink-0 truncate">{label}</p>
      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${p}%` }} />
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-bold text-gray-700 w-6 text-right">{count}</span>
        <span className="text-xs text-gray-400 w-8">({p}%)</span>
      </div>
    </div>
  );
}

function Sparkline({ trend }: { trend: { day: string; count: number }[] }) {
  const max = Math.max(...trend.map(t => t.count), 1);
  return (
    <div className="flex items-end gap-0.5 h-12">
      {trend.map((t, i) => {
        const h = Math.max(4, Math.round((t.count / max) * 48));
        const isToday = i === trend.length - 1;
        return (
          <div key={t.day} className="group relative flex-1 flex items-end">
            <div
              className={`w-full rounded-sm transition-all ${isToday ? "bg-[#E10600]" : "bg-[#E10600]/25 group-hover:bg-[#E10600]/50"}`}
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
      <div className="w-9 h-9 bg-[#E10600]/10 rounded-xl flex items-center justify-center shrink-0 text-[#E10600]">
        {icon}
      </div>
      <div>
        <h2 className="text-base font-bold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AnalyticsView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<TicketStats | null>(null);
  const [payouts, setPayouts] = useState<PayoutStats | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) {
        setTickets(data.tickets);
        setPayouts(data.payouts);
        setFetchedAt(new Date());
      }
    } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { load(); }, [load]);

  // Ticket status config
  const ticketStatusCfg: { key: string; labelKey: string; color: string }[] = [
    { key: "open",           labelKey: "admin.analytics.queue.statuses.open",           color: "bg-blue-400" },
    { key: "claimed",        labelKey: "admin.analytics.queue.statuses.claimed",        color: "bg-indigo-400" },
    { key: "in_progress",   labelKey: "admin.analytics.queue.statuses.in_progress",   color: "bg-amber-400" },
    { key: "resolved",       labelKey: "admin.analytics.queue.statuses.resolved",       color: "bg-emerald-400" },
    { key: "pending_close",  labelKey: "admin.analytics.queue.statuses.pending_close",  color: "bg-orange-400" },
    { key: "pending_accept", labelKey: "admin.analytics.queue.statuses.pending_accept", color: "bg-violet-400" },
    { key: "closed",         labelKey: "admin.analytics.queue.statuses.closed",         color: "bg-gray-400" },
  ];

  const payoutStatusCfg: { key: string; labelKey: string; color: string; dotColor: string }[] = [
    { key: "pending",  labelKey: "admin.analytics.payouts.statuses.pending",  color: "bg-amber-400",   dotColor: "bg-amber-400" },
    { key: "accepted", labelKey: "admin.analytics.payouts.statuses.accepted", color: "bg-blue-400",    dotColor: "bg-blue-400" },
    { key: "refused",  labelKey: "admin.analytics.payouts.statuses.refused",  color: "bg-red-400",     dotColor: "bg-red-400" },
    { key: "delayed",  labelKey: "admin.analytics.payouts.statuses.delayed",  color: "bg-orange-400",  dotColor: "bg-orange-400" },
    { key: "paid",     labelKey: "admin.analytics.payouts.statuses.paid",     color: "bg-emerald-500", dotColor: "bg-emerald-500" },
  ];

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="mb-8">
          <div className="h-7 w-36 bg-gray-200 rounded-lg animate-pulse mb-2" />
          <div className="h-4 w-56 bg-gray-100 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-24 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-100 h-48 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  const tkt = tickets;
  const pyt = payouts;
  const ticketTrend  = buildTrend(tkt?.trend ?? []);
  const payoutTrend  = buildTrend(pyt?.trend ?? []);

  const ticketTotal  = tkt?.total ?? 0;
  const payoutTotal  = pyt?.total ?? 0;
  const paidAmt      = pyt?.paid_amount ?? 0;
  const totalAmt     = pyt?.total_amount ?? 0;

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-gray-50">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t("admin.analytics.title")}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t("admin.analytics.subtitle")}</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          {t("admin.analytics.refresh")}
        </button>
      </div>

      {/* ── Top KPI row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          label={t("admin.analytics.queue.total")}
          value={fmt(ticketTotal)}
          sub={`${tkt?.this_month ?? 0} ${t("admin.analytics.thisMonth")}`}
          color="bg-blue-500"
          icon={<svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h10M4 18h10" /></svg>}
        />
        <KpiCard
          label={t("admin.analytics.queue.resolutionRate")}
          value={`${tkt?.resolution_rate ?? 0}%`}
          sub={tkt?.avg_resolution_hours != null ? `~${tkt.avg_resolution_hours}h ${t("admin.analytics.avgTime")}` : "—"}
          color="bg-emerald-500"
          icon={<svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <KpiCard
          label={t("admin.analytics.payouts.total")}
          value={fmt(payoutTotal)}
          sub={`${pyt?.this_month ?? 0} ${t("admin.analytics.thisMonth")}`}
          color="bg-[#E10600]"
          icon={<svg className="w-5 h-5 text-[#E10600]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        />
        <KpiCard
          label={t("admin.analytics.payouts.successRate")}
          value={`${pyt?.success_rate ?? 0}%`}
          sub={fmtDzd(paidAmt)}
          color="bg-violet-500"
          icon={<svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Queue: Status breakdown ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
            title={t("admin.analytics.queue.byStatus")}
            subtitle={`${ticketTotal} ${t("admin.analytics.totalTickets")}`}
          />
          {ticketTotal === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t("admin.analytics.empty")}</p>
          ) : (
            <div className="space-y-3">
              {ticketStatusCfg.map(s => {
                const n = tkt?.by_status[s.key] ?? 0;
                return n > 0 ? (
                  <BarRow key={s.key} label={t(s.labelKey)} count={n} total={ticketTotal} color={s.color} />
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* ── Queue: 14-day trend + destination ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
            title={t("admin.analytics.queue.trend")}
            subtitle={t("admin.analytics.last14Days")}
          />
          <Sparkline trend={ticketTrend} />
          {/* Destination mini-breakdown */}
          {ticketTotal > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-50">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t("admin.analytics.queue.byType")}</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "merchant",    color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
                  { key: "central_team", color: "bg-amber-50 text-amber-600 border-amber-100" },
                  { key: "pickup_desk", color: "bg-emerald-50 text-emerald-600 border-emerald-100" },
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
        </div>

        {/* ── Queue: Top reasons ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>}
            title={t("admin.analytics.queue.topReasons")}
            subtitle={t("admin.analytics.last30Days")}
          />
          {(!tkt?.top_reasons?.length) ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t("admin.analytics.empty")}</p>
          ) : (
            <div className="space-y-2.5">
              {tkt.top_reasons.map((r, i) => {
                const maxCount = tkt.top_reasons[0].count;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded-full bg-[#E10600]/10 text-[#E10600] text-[10px] font-black flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
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

          {/* Queue mini stats */}
          <div className="mt-5 pt-4 border-t border-gray-50 grid grid-cols-2 gap-3">
            <div className="text-center">
              <p className="text-2xl font-black text-gray-800">{tkt?.this_week ?? 0}</p>
              <p className="text-xs text-gray-400">{t("admin.analytics.thisWeek")}</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black text-gray-800">{tkt?.this_month ?? 0}</p>
              <p className="text-xs text-gray-400">{t("admin.analytics.thisMonth")}</p>
            </div>
          </div>
        </div>

        {/* ── Payouts: Status breakdown ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <SectionHeader
            icon={<svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            title={t("admin.analytics.payouts.byStatus")}
            subtitle={`${payoutTotal} ${t("admin.analytics.totalRequests")}`}
          />
          {payoutTotal === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">{t("admin.analytics.empty")}</p>
          ) : (
            <div className="space-y-3">
              {payoutStatusCfg.map(s => {
                const n = pyt?.by_status[s.key] ?? 0;
                return n > 0 ? (
                  <BarRow key={s.key} label={t(s.labelKey)} count={n} total={payoutTotal} color={s.color} />
                ) : null;
              })}
            </div>
          )}

          {/* Amount breakdown */}
          <div className="mt-5 pt-4 border-t border-gray-50 grid grid-cols-3 gap-2">
            {[
              { label: t("admin.analytics.payouts.totalAmount"),   val: totalAmt,            color: "text-gray-800" },
              { label: t("admin.analytics.payouts.paidAmount"),    val: paidAmt,              color: "text-emerald-600" },
              { label: t("admin.analytics.payouts.pendingAmount"), val: pyt?.pending_amount ?? 0, color: "text-amber-600" },
            ].map((item, i) => (
              <div key={i} className="text-center">
                <p className={`text-sm font-black ${item.color} leading-tight`}>{fmt(Math.round(item.val))}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">DZD</p>
                <p className="text-[10px] text-gray-500 font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Payouts: Trend + avg ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 lg:col-span-2">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <SectionHeader
              icon={<svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>}
              title={t("admin.analytics.payouts.trend")}
              subtitle={t("admin.analytics.last14Days")}
            />
            <div className="flex items-center gap-6 flex-wrap">
              {[
                { label: t("admin.analytics.thisWeek"),   val: pyt?.this_week ?? 0 },
                { label: t("admin.analytics.thisMonth"),  val: pyt?.this_month ?? 0 },
                { label: t("admin.analytics.payouts.avgAmount"), val: fmtDzd(pyt?.avg_amount ?? 0) },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <p className="text-lg font-black text-gray-800 leading-none">{item.val}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
          <Sparkline trend={payoutTrend} />
          <p className="text-[10px] text-gray-400 mt-2 text-center">{t("admin.analytics.last14Days")}</p>
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
