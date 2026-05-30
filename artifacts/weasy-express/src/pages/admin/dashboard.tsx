import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import logoWhitePath from "@assets/weasy_logo_white_no_bg.png";
import AlgeriaMapSvg from "@/assets/algeria-map.svg?raw";
import { API_BASE, adminHeaders } from "@/lib/api";
import i18n, { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { WILAYA_LIST } from "@/lib/wilayas";

// ── Types ──────────────────────────────────────────────────────────────────────

type PartnerStatus = "pending" | "reviewing" | "approved" | "rejected";
type AdminRole = "admin" | "office" | "finance" | "commercial";
type OrderStatus = "pending" | "in_transit" | "delivered" | "returned" | "failed" | "cancelled";

interface Partner {
  id: number; firstName: string; lastName: string; email: string;
  password: string | null; phone: string; address: string; city: string;
  parcelsPerMonth: string; status: PartnerStatus; notes: string | null; createdAt: string;
}
interface Office {
  id: number; wilayaNumber: number; wilaya: string; commune: string | null;
  address: string; phone: string | null; mapsUrl: string; isPrincipal: boolean; createdAt: string;
}
interface AdminUser {
  id: number; username: string; role: AdminRole; createdAt: string;
}
interface Order {
  id: number; trackingNumber: string | null; status: OrderStatus;
  senderName: string | null; recipientName: string | null;
  destinationWilayaCode: string | null; destinationWilaya: string | null;
  originWilayaCode: string | null; originWilaya: string | null;
  createdAt: string;
}
interface WilayaStat { code: string; name: string; total: number; delivered: number; }
interface DashboardStats {
  total: number; delivered: number; in_transit: number; returned: number;
  pending: number; failed: number; cancelled: number; successRate: number;
  byWilaya: WilayaStat[];
  recentOrders: Order[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
}

function wilayaHeatColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return "#e2e8f0";
  const r = count / maxCount;
  const red = Math.round(254 + r * (225 - 254));
  const green = Math.round(226 + r * (6 - 226));
  const blue = Math.round(226 + r * (0 - 226));
  return `rgb(${red},${green},${blue})`;
}

const STATUS_COLOR: Record<PartnerStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  reviewing: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};
const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  in_transit: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700",
  returned: "bg-orange-100 text-orange-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-600",
};
const ROLE_COLOR: Record<AdminRole, string> = {
  admin: "bg-purple-100 text-purple-800",
  office: "bg-blue-100 text-blue-800",
  finance: "bg-emerald-100 text-emerald-800",
  commercial: "bg-orange-100 text-orange-800",
};
const LANG_LABELS: Record<string, string> = { fr: "FR", ar: "ع", en: "EN" };

// ── Sidebar ────────────────────────────────────────────────────────────────────

type SidebarView = "dashboard" | "partners" | "offices" | "admins";

function Sidebar({
  view, setView, role, username, onLogout, onChangePassword,
  partnerCount, officeCount,
}: {
  view: SidebarView; setView: (v: SidebarView) => void;
  role: AdminRole; username: string;
  onLogout: () => void; onChangePassword: () => void;
  partnerCount: number; officeCount: number;
}) {
  const { t } = useTranslation();
  const isAdmin = role === "admin";

  const navItem = (v: SidebarView, label: string, badge: number, icon: React.ReactNode) => (
    <button
      onClick={() => setView(v)}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        view === v ? "bg-[#E10600] text-white shadow-lg shadow-red-900/30" : "text-white/60 hover:text-white hover:bg-white/5"
      }`}
    >
      {icon}
      <span>{label}</span>
      {badge > 0 && (
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${view === v ? "bg-white/20 text-white" : "bg-white/10 text-white/60"}`}>{badge}</span>
      )}
    </button>
  );

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-[#0F172A] flex flex-col z-30 shadow-xl">
      <div className="px-5 py-5 border-b border-white/10">
        <img src={logoWhitePath} alt="Weasy Express" className="h-10 w-auto object-contain" />
        <p className="text-white/40 text-xs mt-2 font-medium uppercase tracking-widest">{t("admin.sidebar.label")}</p>
      </div>

      <div className="px-5 py-3 border-b border-white/5">
        <p className="text-white/80 text-xs font-semibold truncate">{username}</p>
        <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${ROLE_COLOR[role]}`}>
          {t(`admin.roles.${role}`)}
        </span>
      </div>

      {isAdmin ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItem("dashboard", t("admin.sidebar.dashboard"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}
          {navItem("partners", t("admin.sidebar.partners"), partnerCount,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          {navItem("offices", t("admin.sidebar.offices"), officeCount,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          {navItem("admins", t("admin.sidebar.admins"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          )}
        </nav>
      ) : (
        <div className="flex-1" />
      )}

      <div className="px-3 pb-5 space-y-1 border-t border-white/10 pt-4">
        <div className="flex items-center gap-1 px-3 pb-2">
          {SUPPORTED_LANGUAGES.map((lng) => (
            <button
              key={lng}
              onClick={() => i18n.changeLanguage(lng)}
              className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                i18n.language === lng ? "bg-white/20 text-white" : "text-white/40 hover:text-white hover:bg-white/10"
              }`}
            >
              {LANG_LABELS[lng]}
            </button>
          ))}
        </div>
        <button onClick={onChangePassword} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
          {t("admin.sidebar.changePassword")}
        </button>
        <button onClick={onLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/50 hover:text-white hover:bg-white/5 transition-all">
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          {t("admin.sidebar.logout")}
        </button>
      </div>
    </aside>
  );
}

// ── Empty role placeholder ─────────────────────────────────────────────────────

function EmptyRoleView({ role }: { role: AdminRole }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-32 px-8 text-center">
      <div className={`inline-flex text-sm font-bold px-4 py-1.5 rounded-full mb-6 ${ROLE_COLOR[role]}`}>
        {t(`admin.roles.${role}`)}
      </div>
      <h2 className="text-2xl font-bold text-gray-900 mb-3">{t("admin.emptyRole.title")}</h2>
      <p className="text-gray-500 max-w-sm">{t("admin.emptyRole.subtitle")}</p>
      <p className="text-gray-400 text-sm mt-2">{t("admin.emptyRole.hint")}</p>
    </div>
  );
}

// ── Dashboard view ─────────────────────────────────────────────────────────────

const ORDER_STATUSES: OrderStatus[] = ["pending", "in_transit", "delivered", "returned", "failed", "cancelled"];

type TimePreset = "all" | "today" | "yesterday" | "7d" | "30d" | "custom";

function getDateRangeFromPreset(preset: TimePreset, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (preset) {
    case "today":
      return { from: today.toISOString(), to: new Date(today.getTime() + 86400000).toISOString() };
    case "yesterday": {
      const y = new Date(today.getTime() - 86400000);
      return { from: y.toISOString(), to: today.toISOString() };
    }
    case "7d":
      return { from: new Date(today.getTime() - 7 * 86400000).toISOString() };
    case "30d":
      return { from: new Date(today.getTime() - 30 * 86400000).toISOString() };
    case "custom":
      return {
        from: customFrom ? new Date(customFrom).toISOString() : undefined,
        to: customTo ? new Date(new Date(customTo).getTime() + 86400000).toISOString() : undefined,
      };
    default:
      return {};
  }
}

function buildMapSvg(stats: DashboardStats | null): string {
  const byWilaya = stats?.byWilaya ?? [];
  const maxCount = Math.max(...byWilaya.map((w) => w.delivered), 1);
  const styleRules = byWilaya
    .filter((w) => w.delivered > 0)
    .map((w) => `#${w.code}{fill:${wilayaHeatColor(w.delivered, maxCount)}!important}`)
    .join(" ");
  const base = AlgeriaMapSvg
    .replace(/fill="[^"]*"/g, 'fill="#e2e8f0"')
    .replace(/stroke="[^"]*"/g, 'stroke="white"')
    .replace(/stroke-width="[^"]*"/g, 'stroke-width="0.3"');
  return styleRules ? base.replace(/(<svg[^>]*>)/, `$1<style>${styleRules}</style>`) : base;
}

interface OrderForm {
  trackingNumber: string; senderName: string; recipientName: string;
  originWilayaCode: string; destinationWilayaCode: string; status: OrderStatus;
}
const EMPTY_FORM: OrderForm = {
  trackingNumber: "", senderName: "", recipientName: "",
  originWilayaCode: "", destinationWilayaCode: "", status: "pending",
};

const TIME_PRESET_LABELS: { value: TimePreset; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "7d", label: "7 jours" },
  { value: "30d", label: "30 jours" },
];

function DashboardView({ onUnauth, onRefreshBadge }: { onUnauth: () => void; onRefreshBadge: () => void }) {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [form, setForm] = useState<OrderForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [hoveredWilaya, setHoveredWilaya] = useState<{ name: string; total: number; delivered: number } | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const mapRef = useRef<HTMLDivElement>(null);

  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [filterWilaya, setFilterWilaya] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [formWilaya, setFormWilaya] = useState("");
  const [formFrom, setFormFrom] = useState("");
  const [formTo, setFormTo] = useState("");
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  const dashboardMapSvg = useMemo(() => buildMapSvg(stats), [stats]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const range = getDateRangeFromPreset(timePreset, filterFrom, filterTo);
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      if (filterWilaya) params.set("wilaya", filterWilaya);
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/api/admin/stats${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; stats: DashboardStats };
      if (data.ok) setStats(data.stats);
    } catch { } finally { setLoading(false); }
  }, [onUnauth, timePreset, filterWilaya, filterFrom, filterTo]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const target = e.target as SVGPathElement;
      const code = target?.getAttribute?.("id");
      if (code?.match(/^DZ\d{2}$/)) {
        const w = stats?.byWilaya.find((b) => b.code === code);
        const name = WILAYA_LIST.find((l) => l.code === code)?.name ?? code;
        setHoveredWilaya({ name, total: w?.total ?? 0, delivered: w?.delivered ?? 0 });
        setTooltipPos({ x, y });
      } else {
        setHoveredWilaya(null);
      }
    };
    const handleLeave = () => setHoveredWilaya(null);
    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", handleLeave);
    return () => { el.removeEventListener("mousemove", handleMove); el.removeEventListener("mouseleave", handleLeave); };
  }, [stats]);

  function openAdd() { setEditOrder(null); setForm(EMPTY_FORM); setShowModal(true); }
  function openEdit(o: Order) {
    setEditOrder(o);
    setForm({
      trackingNumber: o.trackingNumber ?? "",
      senderName: o.senderName ?? "",
      recipientName: o.recipientName ?? "",
      originWilayaCode: o.originWilayaCode ?? "",
      destinationWilayaCode: o.destinationWilayaCode ?? "",
      status: o.status,
    });
    setShowModal(true);
  }

  async function saveOrder() {
    setSaving(true);
    const destWilaya = WILAYA_LIST.find((w) => w.code === form.destinationWilayaCode);
    const origWilaya = WILAYA_LIST.find((w) => w.code === form.originWilayaCode);
    const body = {
      trackingNumber: form.trackingNumber || null,
      senderName: form.senderName || null,
      recipientName: form.recipientName || null,
      originWilayaCode: form.originWilayaCode || null,
      originWilaya: origWilaya?.name ?? null,
      destinationWilayaCode: form.destinationWilayaCode || null,
      destinationWilaya: destWilaya?.name ?? null,
      status: form.status,
    };
    try {
      const url = editOrder
        ? `${API_BASE}/api/admin/orders/${editOrder.id}`
        : `${API_BASE}/api/admin/orders`;
      const res = await fetch(url, {
        method: editOrder ? "PATCH" : "POST",
        headers: adminHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) { setShowModal(false); fetchStats(); onRefreshBadge(); }
    } finally { setSaving(false); }
  }

  async function deleteOrder(id: number) {
    if (!confirm(t("admin.dashboard.orders.deleteConfirm"))) return;
    const res = await fetch(`${API_BASE}/api/admin/orders/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchStats(); onRefreshBadge();
  }

  function selectPreset(preset: TimePreset) {
    setTimePreset(preset);
    setFilterFrom(""); setFilterTo("");
    setFormFrom(""); setFormTo("");
  }

  function applyAdvancedFilter() {
    setFilterFrom(formFrom); setFilterTo(formTo); setFilterWilaya(formWilaya);
    setTimePreset("custom");
    setShowAdvancedFilter(false);
  }

  function resetFilters() {
    setTimePreset("all");
    setFilterFrom(""); setFilterTo(""); setFilterWilaya("");
    setFormFrom(""); setFormTo(""); setFormWilaya("");
    setShowAdvancedFilter(false);
  }

  const hasActiveFilter = timePreset !== "all" || filterWilaya !== "";

  const filteredOrders = useMemo(() => {
    if (!stats) return [];
    return statusFilter === "all"
      ? stats.recentOrders
      : stats.recentOrders.filter((o) => o.status === statusFilter);
  }, [stats, statusFilter]);

  const kpiCards = stats ? [
    { label: t("admin.dashboard.kpi.total"), value: stats.total, color: "from-slate-600 to-slate-700", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
    { label: t("admin.dashboard.kpi.delivered"), value: stats.delivered, color: "from-emerald-500 to-emerald-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { label: t("admin.dashboard.kpi.inTransit"), value: stats.in_transit, color: "from-blue-500 to-blue-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg> },
    { label: t("admin.dashboard.kpi.returned"), value: stats.returned, color: "from-orange-500 to-orange-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg> },
    { label: t("admin.dashboard.kpi.pending"), value: stats.pending, color: "from-amber-500 to-amber-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { label: t("admin.dashboard.kpi.successRate"), value: `${stats.successRate}%`, color: "from-[#E10600] to-[#B80500]", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
  ] : [];

  return (
    <>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin.dashboard.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("admin.dashboard.subtitle")}</p>
          </div>
          <button onClick={fetchStats} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {t("admin.dashboard.refresh")}
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 shrink-0">Période :</span>
            {TIME_PRESET_LABELS.map((p) => (
              <button
                key={p.value}
                onClick={() => selectPreset(p.value)}
                className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                  timePreset === p.value && p.value !== "custom"
                    ? "bg-[#E10600] text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setShowAdvancedFilter((v) => !v)}
              className={`ml-auto shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${
                showAdvancedFilter || (timePreset === "custom") || filterWilaya
                  ? "border-[#E10600] text-[#E10600] bg-red-50"
                  : "border-gray-200 text-gray-600 hover:border-[#E10600] hover:text-[#E10600]"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
              Filtres avancés
              {hasActiveFilter && <span className="w-1.5 h-1.5 rounded-full bg-[#E10600]" />}
            </button>
          </div>

          {showAdvancedFilter && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Du</label>
                <input
                  type="date" value={formFrom}
                  onChange={(e) => setFormFrom(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Au</label>
                <input
                  type="date" value={formTo}
                  onChange={(e) => setFormTo(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Wilaya destination</label>
                <select
                  value={formWilaya}
                  onChange={(e) => setFormWilaya(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white"
                >
                  <option value="">Toutes les wilayas</option>
                  {WILAYA_LIST.map((w) => (
                    <option key={w.code} value={w.code}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  onClick={applyAdvancedFilter}
                  className="flex-1 py-2 text-xs font-bold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm transition-colors"
                >
                  Appliquer
                </button>
                <button
                  onClick={resetFilters}
                  className="flex-1 py-2 text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          )}

          {hasActiveFilter && !showAdvancedFilter && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {timePreset !== "all" && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-[#E10600] font-semibold px-2.5 py-1 rounded-full">
                  {TIME_PRESET_LABELS.find((p) => p.value === timePreset)?.label ?? "Période personnalisée"}
                  {filterFrom && filterTo ? ` · ${filterFrom} → ${filterTo}` : filterFrom ? `· à partir du ${filterFrom}` : ""}
                  <button onClick={() => selectPreset("all")} className="ml-0.5 hover:text-red-800">×</button>
                </span>
              )}
              {filterWilaya && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-[#E10600] font-semibold px-2.5 py-1 rounded-full">
                  {WILAYA_LIST.find((w) => w.code === filterWilaya)?.name ?? filterWilaya}
                  <button onClick={() => { setFilterWilaya(""); setFormWilaya(""); }} className="ml-0.5 hover:text-red-800">×</button>
                </span>
              )}
            </div>
          )}
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-7">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse">
                <div className="h-8 w-16 bg-gray-200 rounded mb-2" />
                <div className="h-4 w-24 bg-gray-100 rounded" />
              </div>
            ))
          ) : (
            kpiCards.map((card) => (
              <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900 leading-none">{card.value}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium">{card.label}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Orders + Map */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

          {/* Orders table */}
          <div className="xl:col-span-7 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900 text-base">{t("admin.dashboard.orders.title")}</h2>
              <button
                onClick={openAdd}
                className="flex items-center gap-2 text-xs font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-3 py-2 rounded-xl shadow-sm transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                {t("admin.dashboard.orders.add")}
              </button>
            </div>

            {/* Status filter pills */}
            <div className="flex gap-2 px-5 py-3 overflow-x-auto border-b border-gray-50 scrollbar-none">
              {(["all", ...ORDER_STATUSES] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s as OrderStatus | "all")}
                  className={`shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                    statusFilter === s
                      ? "bg-[#0F172A] text-white"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {s === "all" ? "Tous" : t(`admin.dashboard.orders.status.${s}`)}
                  {s !== "all" && stats && (
                    <span className="ml-1.5 opacity-70">
                      {s === "in_transit" ? stats.in_transit
                        : s === "delivered" ? stats.delivered
                        : s === "returned" ? stats.returned
                        : s === "pending" ? stats.pending
                        : s === "failed" ? stats.failed
                        : stats.cancelled}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-sm">{t("admin.dashboard.orders.noData")}</div>
            ) : (
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t("admin.dashboard.orders.cols.tracking")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 hidden sm:table-cell">{t("admin.dashboard.orders.cols.sender")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 hidden md:table-cell">{t("admin.dashboard.orders.cols.destination")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">{t("admin.dashboard.orders.cols.status")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 hidden lg:table-cell">{t("admin.dashboard.orders.cols.date")}</th>
                      <th className="w-16 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-3">
                          <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                            {o.trackingNumber ?? `#${o.id}`}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-gray-700 text-xs hidden sm:table-cell">{o.senderName ?? "—"}</td>
                        <td className="px-3 py-3 text-gray-700 text-xs hidden md:table-cell">{o.destinationWilaya ?? "—"}</td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ORDER_STATUS_STYLE[o.status]}`}>
                            {t(`admin.dashboard.orders.status.${o.status}`)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-400 hidden lg:table-cell">{fmtDate(o.createdAt)}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(o)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => deleteOrder(o.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Heatmap */}
          <div className="xl:col-span-5 bg-[#0F172A] rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="font-bold text-white text-base">{t("admin.dashboard.map.title")}</h2>
              <p className="text-white/40 text-xs mt-0.5">{t("admin.dashboard.map.subtitle")}</p>
            </div>
            <div className="flex-1 p-4 flex flex-col items-center justify-center relative">
              <div
                ref={mapRef}
                dir="ltr"
                className="relative w-full max-w-xs mx-auto [&_svg]:w-full [&_svg]:h-full [&_path[id^='DZ']]:cursor-pointer"
              >
                <div className="contents" dangerouslySetInnerHTML={{ __html: dashboardMapSvg }} />
                {hoveredWilaya && (
                  <div
                    className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-full"
                    style={{ left: tooltipPos.x, top: tooltipPos.y - 10 }}
                  >
                    <div className="rounded-xl bg-white text-[#1A1A1A] shadow-2xl ring-1 ring-black/10 px-3 py-2.5 min-w-[160px]">
                      <p className="font-bold text-sm leading-tight mb-1">{hoveredWilaya.name}</p>
                      <p className="text-xs text-emerald-600 font-semibold">{hoveredWilaya.delivered} {t("admin.dashboard.map.deliveries")}</p>
                      <p className="text-xs text-gray-400">{hoveredWilaya.total} {t("admin.dashboard.map.total")}</p>
                      <div className="absolute left-1/2 -bottom-1.5 -translate-x-1/2 h-3 w-3 rotate-45 bg-white ring-1 ring-black/10" />
                    </div>
                  </div>
                )}
              </div>
              {/* Legend */}
              <div className="mt-3 flex items-center gap-3 self-center">
                <div className="flex items-center gap-1.5 text-xs text-white/50">
                  <span className="inline-block w-3 h-3 rounded-sm bg-[#e2e8f0] border border-white/10" />
                  0
                </div>
                <div className="flex gap-0.5">
                  {[0.15, 0.35, 0.55, 0.75, 1].map((r, i) => (
                    <span key={i} className="inline-block w-4 h-3 rounded-sm" style={{ backgroundColor: wilayaHeatColor(r * 100, 100) }} />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-white/50">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: wilayaHeatColor(100, 100) }} />
                  max
                </div>
              </div>

              {/* Top wilayas */}
              {stats && stats.byWilaya.filter((w) => w.delivered > 0).length > 0 && (
                <div className="w-full mt-4 space-y-1.5">
                  <p className="text-xs text-white/40 font-semibold uppercase tracking-widest px-1 mb-2">Top wilayas</p>
                  {stats.byWilaya.filter((w) => w.delivered > 0).slice(0, 5).map((w) => {
                    const maxD = stats.byWilaya[0]?.delivered ?? 1;
                    return (
                      <div key={w.code} className="flex items-center gap-2">
                        <span className="text-xs text-white/60 w-28 truncate shrink-0">{w.name || w.code}</span>
                        <div className="flex-1 bg-white/10 rounded-full h-1.5">
                          <div
                            className="h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.round((w.delivered / maxD) * 100)}%`, backgroundColor: wilayaHeatColor(w.delivered, maxD) }}
                          />
                        </div>
                        <span className="text-xs text-white/60 w-6 text-right shrink-0">{w.delivered}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {stats && stats.total === 0 && (
                <p className="mt-4 text-xs text-white/30 italic text-center">{t("admin.dashboard.map.noData")}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Add / Edit Order Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
              <h3 className="font-bold text-gray-900 text-lg">
                {editOrder ? t("admin.dashboard.orders.editTitle") : t("admin.dashboard.orders.addTitle")}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Tracking number */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.dashboard.orders.fields.trackingNumber")}</label>
                <input
                  type="text" value={form.trackingNumber}
                  onChange={(e) => setForm((f) => ({ ...f, trackingNumber: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                  placeholder="WE-XXXXXX"
                />
              </div>
              {/* Sender / Recipient */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.dashboard.orders.fields.senderName")}</label>
                  <input type="text" value={form.senderName}
                    onChange={(e) => setForm((f) => ({ ...f, senderName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.dashboard.orders.fields.recipientName")}</label>
                  <input type="text" value={form.recipientName}
                    onChange={(e) => setForm((f) => ({ ...f, recipientName: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
              </div>
              {/* Origin / Destination Wilaya */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.dashboard.orders.fields.originWilaya")}</label>
                  <select value={form.originWilayaCode}
                    onChange={(e) => setForm((f) => ({ ...f, originWilayaCode: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                    <option value="">—</option>
                    {WILAYA_LIST.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.dashboard.orders.fields.destinationWilaya")}</label>
                  <select value={form.destinationWilayaCode}
                    onChange={(e) => setForm((f) => ({ ...f, destinationWilayaCode: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                    <option value="">—</option>
                    {WILAYA_LIST.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              {/* Status */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.dashboard.orders.fields.status")}</label>
                <select value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as OrderStatus }))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`admin.dashboard.orders.status.${s}`)}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                  {t("admin.dashboard.orders.cancel")}
                </button>
                <button onClick={saveOrder} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                  {saving ? t("admin.dashboard.orders.saving") : t("admin.dashboard.orders.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Partners view ──────────────────────────────────────────────────────────────

function PartnersView({ partners, loading, error, onRefresh, onUnauth }: {
  partners: Partner[]; loading: boolean; error: string; onRefresh: () => void; onUnauth: () => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<PartnerStatus | "all">("all");
  const [selected, setSelected] = useState<Partner | null>(null);
  const [editStatus, setEditStatus] = useState<PartnerStatus>("pending");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  function open(p: Partner) {
    setSelected(p); setEditStatus(p.status); setEditNotes(p.notes ?? ""); setShowPassword(false);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/partners/${selected.id}`, {
        method: "PATCH", headers: adminHeaders(),
        body: JSON.stringify({ status: editStatus, notes: editNotes }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) { onRefresh(); setSelected(null); }
    } finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm(t("admin.partners.deleteConfirm"))) return;
    const res = await fetch(`${API_BASE}/api/admin/partners/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    onRefresh(); if (selected?.id === id) setSelected(null);
  }

  const counts = {
    all: partners.length,
    pending: partners.filter((p) => p.status === "pending").length,
    reviewing: partners.filter((p) => p.status === "reviewing").length,
    approved: partners.filter((p) => p.status === "approved").length,
    rejected: partners.filter((p) => p.status === "rejected").length,
  };
  const filtered = filter === "all" ? partners : partners.filter((p) => p.status === filter);

  return (
    <>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin.partners.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("admin.partners.subtitle")}</p>
          </div>
          <button onClick={onRefresh} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {t("admin.partners.refresh")}
          </button>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
          {(["pending", "reviewing", "approved", "rejected"] as const).map((s) => (
            <button key={s} onClick={() => setFilter(filter === s ? "all" : s)}
              className={`bg-white rounded-2xl border p-4 text-left shadow-sm hover:shadow-md transition-all ${filter === s ? "border-[#E10600] ring-1 ring-[#E10600]" : "border-gray-100"}`}>
              <p className="text-3xl font-bold text-gray-900">{counts[s]}</p>
              <p className="text-xs text-gray-500 mt-1">{t(`admin.partners.status.${s}`)}</p>
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4 flex items-center justify-between">
            {error}
            <button onClick={onRefresh} className="ml-3 underline font-medium">{t("admin.partners.refresh")}</button>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
            <p className="text-sm text-gray-500">{filtered.length} {filtered.length !== 1 ? t("admin.partners.title").toLowerCase() : t("admin.partners.title").toLowerCase().replace(/s$/, "")}{filter !== "all" ? ` · ${t(`admin.partners.status.${filter}`)}` : ""}</p>
            {filter !== "all" && <button onClick={() => setFilter("all")} className="text-xs text-[#E10600] hover:text-[#B80500] font-medium">{t("admin.partners.viewAll")}</button>}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">{t("admin.partners.noData")}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {filtered.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E10600] to-[#B80500] flex items-center justify-center shrink-0 text-xs font-bold text-white uppercase">
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm">{p.firstName} {p.lastName}</p>
                      <p className="text-xs text-gray-400 truncate">{p.email} · {p.city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-4">
                    <span className={`hidden sm:inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_COLOR[p.status]}`}>{t(`admin.partners.status.${p.status}`)}</span>
                    <span className="hidden md:block text-xs text-gray-400 w-20 text-right">{fmtDate(p.createdAt)}</span>
                    <button onClick={() => open(p)} className="text-xs text-[#E10600] hover:text-[#B80500] font-semibold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors">{t("admin.partners.details")}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E10600] to-[#B80500] flex items-center justify-center text-xs font-bold text-white uppercase shrink-0">
                  {selected.firstName[0]}{selected.lastName[0]}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">{selected.firstName} {selected.lastName}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[selected.status]}`}>{t(`admin.partners.status.${selected.status}`)}</span>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  [t("admin.partners.fields.email"), selected.email],
                  [t("admin.partners.fields.phone"), selected.phone],
                  [t("admin.partners.fields.city"), selected.city],
                  [t("admin.partners.fields.parcels"), selected.parcelsPerMonth],
                  [t("admin.partners.fields.date"), fmtDate(selected.createdAt)],
                  [t("admin.partners.fields.address"), selected.address],
                ].map(([label, value]) => (
                  <div key={label} className={label === t("admin.partners.fields.address") ? "col-span-2" : ""}>
                    <p className="text-xs font-semibold text-gray-500 mb-1">{label}</p>
                    <p className="text-sm text-gray-900 break-words">{value}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">{t("admin.partners.passwordLabel")}</p>
                {selected.password ? (
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-gray-100 px-2 py-1 rounded text-gray-800 flex-1 break-all">
                      {showPassword ? selected.password : "••••••••••••"}
                    </code>
                    <button onClick={() => setShowPassword((v) => !v)} className="text-xs text-[#E10600] font-semibold shrink-0">
                      {showPassword ? t("admin.partners.passwordHide") : t("admin.partners.passwordShow")}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic">{t("admin.partners.passwordEmpty")}</p>
                )}
                {selected.password && <p className="text-xs text-gray-400 mt-1">{t("admin.partners.passwordNote")}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.statusLabel")}</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as PartnerStatus)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                  {(["pending", "reviewing", "approved", "rejected"] as const).map((s) => (
                    <option key={s} value={s}>{t(`admin.partners.statusOptions.${s}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.notesLabel")}</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] resize-none"
                  placeholder={t("admin.partners.notesPh")} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => remove(selected.id)} className="py-2.5 px-4 text-sm text-red-600 font-medium rounded-xl border border-red-200 hover:bg-red-50">
                  {t("admin.partners.delete")}
                </button>
                <button onClick={() => setSelected(null)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.partners.cancel")}</button>
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                  {saving ? t("admin.partners.saving") : t("admin.partners.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Offices view ───────────────────────────────────────────────────────────────

function OfficesView({ offices, loading, error, onRefresh, onUnauth }: {
  offices: Office[]; loading: boolean; error: string; onRefresh: () => void; onUnauth: () => void;
}) {
  const { t } = useTranslation();
  const [showAdd, setShowAdd] = useState(false);
  const [editOffice, setEditOffice] = useState<Office | null>(null);
  const [form, setForm] = useState({ wilayaNumber: "", wilaya: "", commune: "", address: "", phone: "", mapsUrl: "", isPrincipal: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function openAdd() { setEditOffice(null); setForm({ wilayaNumber: "", wilaya: "", commune: "", address: "", phone: "", mapsUrl: "", isPrincipal: false }); setFormError(""); setShowAdd(true); }
  function openEdit(o: Office) { setEditOffice(o); setForm({ wilayaNumber: String(o.wilayaNumber), wilaya: o.wilaya, commune: o.commune ?? "", address: o.address, phone: o.phone ?? "", mapsUrl: o.mapsUrl, isPrincipal: o.isPrincipal }); setFormError(""); setShowAdd(true); }

  async function save() {
    if (!form.wilayaNumber || !form.wilaya || !form.address || !form.mapsUrl) { setFormError(t("admin.offices.formError")); return; }
    setSaving(true);
    try {
      const url = editOffice ? `${API_BASE}/api/admin/offices/${editOffice.id}` : `${API_BASE}/api/admin/offices`;
      const res = await fetch(url, {
        method: editOffice ? "PATCH" : "POST", headers: adminHeaders(),
        body: JSON.stringify({ ...form, wilayaNumber: parseInt(form.wilayaNumber) }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) { setShowAdd(false); onRefresh(); }
      else setFormError(t("admin.offices.saveError"));
    } finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm(t("admin.offices.deleteConfirm"))) return;
    const res = await fetch(`${API_BASE}/api/admin/offices/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    onRefresh();
  }

  return (
    <>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin.offices.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("admin.offices.subtitle")}</p>
          </div>
          <button onClick={openAdd} className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {t("admin.offices.add")}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        ) : offices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-20 text-center">
            <p className="text-gray-400 text-sm mb-4">{t("admin.offices.noData")}</p>
            <button onClick={openAdd} className="text-sm font-semibold text-[#E10600] hover:text-[#B80500]">{t("admin.offices.addFirst")}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {offices.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-900">{o.wilaya}</span>
                      {o.isPrincipal && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#E10600]/10 text-[#E10600]">{t("admin.offices.principal")}</span>}
                    </div>
                    {o.commune && <p className="text-xs text-gray-500 mt-0.5">{o.commune}</p>}
                  </div>
                  <span className="text-xs text-gray-400 font-mono shrink-0">W{String(o.wilayaNumber).padStart(2, "0")}</span>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{o.address}</p>
                {o.phone && <p className="text-xs text-gray-500">{o.phone}</p>}
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-gray-50">
                  <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold text-[#E10600] hover:text-[#B80500] bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors">
                    {t("admin.offices.maps")}
                  </a>
                  <button onClick={() => openEdit(o)} className="text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 hover:bg-gray-100 px-3 py-1.5 rounded-lg transition-colors">
                    {t("admin.offices.edit")}
                  </button>
                  <button onClick={() => remove(o.id)} className="ml-auto text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
              <h3 className="font-bold text-gray-900 text-lg">{editOffice ? t("admin.offices.editTitle") : t("admin.offices.addTitle")}</h3>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{formError}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.offices.fields.wilayaNumber")}</label>
                  <input type="number" min={1} max={58} value={form.wilayaNumber} onChange={(e) => setForm((f) => ({ ...f, wilayaNumber: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.offices.fields.wilaya")}</label>
                  <input type="text" value={form.wilaya} onChange={(e) => setForm((f) => ({ ...f, wilaya: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
              </div>
              {[
                { key: "commune", label: t("admin.offices.fields.commune") },
                { key: "address", label: t("admin.offices.fields.address") },
                { key: "phone", label: t("admin.offices.fields.phone") },
                { key: "mapsUrl", label: t("admin.offices.fields.mapsUrl") },
              ].map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                  <input type="text" value={(form as Record<string, unknown>)[key] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
              ))}
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.isPrincipal} onChange={(e) => setForm((f) => ({ ...f, isPrincipal: e.target.checked }))} className="w-4 h-4 accent-[#E10600]" />
                <span className="text-sm font-medium text-gray-700">{t("admin.offices.fields.isPrincipal")}</span>
              </label>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.offices.cancel")}</button>
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                  {saving ? t("admin.offices.saving") : (editOffice ? t("admin.offices.saveEdit") : t("admin.offices.save"))}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Admins view ────────────────────────────────────────────────────────────────

function AdminsView({ currentUsername, onUnauth }: { currentUsername: string; onUnauth: () => void }) {
  const { t } = useTranslation();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("office");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; admins: AdminUser[] };
      if (data.ok) setAdmins(data.admins);
    } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  async function createAdmin() {
    if (!newUsername.trim() || newPassword.length < 8) { setFormError(t("admin.admins.formError")); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) { setShowAdd(false); setNewUsername(""); setNewPassword(""); setNewRole("office"); fetchAdmins(); }
      else setFormError(t("admin.admins.saveError"));
    } finally { setSaving(false); }
  }

  async function removeAdmin(id: number, username: string) {
    if (username === currentUsername) return;
    if (!confirm(`Supprimer l'utilisateur "${username}" ?`)) return;
    const res = await fetch(`${API_BASE}/api/admin/admins/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchAdmins();
  }

  return (
    <>
      <div className="p-6 lg:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin.admins.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("admin.admins.subtitle")}</p>
          </div>
          <button onClick={() => { setFormError(""); setShowAdd(true); }} className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {t("admin.admins.add")}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-50">
              {admins.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center shrink-0 text-xs font-bold text-white uppercase">
                      {a.username[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">{a.username}</p>
                      <p className="text-xs text-gray-400">{fmtDate(a.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_COLOR[a.role as AdminRole]}`}>{t(`admin.roles.${a.role}`)}</span>
                    {a.username !== currentUsername && (
                      <button onClick={() => removeAdmin(a.id, a.username)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl mx-4">
            <div className="h-1.5 bg-gradient-to-r from-[#E10600] to-[#B80500] rounded-t-2xl" />
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-gray-900 text-lg">{t("admin.admins.addTitle")}</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
              </div>
              {formError && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{formError}</div>}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.admins.fields.username")}</label>
                  <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.admins.fields.password")}</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.admins.fields.role")}</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value as AdminRole)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                    {(["admin", "office", "finance", "commercial"] as const).map((r) => (
                      <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.admins.cancel")}</button>
                <button onClick={createAdmin} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                  {saving ? t("admin.admins.saving") : t("admin.admins.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Change-password modal ──────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (newPass.length < 8) { setError(t("admin.changePassword.tooShort")); return; }
    if (newPass !== confirmPass) { setError(t("admin.changePassword.mismatch")); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/change-password`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        if (data.error === "wrong_current_password") setError(t("admin.changePassword.wrongCurrent"));
        else if (data.error === "password_too_short") setError(t("admin.changePassword.tooShort"));
        else setError(t("admin.changePassword.error"));
        return;
      }
      setSuccess(true); setTimeout(onClose, 1800);
    } catch { setError(t("admin.changePassword.networkError")); } finally { setSaving(false); }
  }

  const eyeOff = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>;
  const eyeOn = <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl mx-4">
        <div className="h-1.5 bg-gradient-to-r from-[#E10600] to-[#B80500] rounded-t-2xl" />
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-bold text-gray-900 text-lg">{t("admin.changePassword.title")}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
          </div>
          {success ? (
            <div className="flex flex-col items-center py-8 gap-3 text-emerald-600">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              <p className="font-semibold text-base">{t("admin.changePassword.success")}</p>
              <p className="text-sm text-gray-400">{t("admin.changePassword.successHint")}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
              {[
                { label: t("admin.changePassword.current"), value: currentPass, set: setCurrentPass, show: showCurrent, toggle: () => setShowCurrent((v) => !v) },
                { label: `${t("admin.changePassword.new")} ${t("admin.changePassword.newHint")}`, value: newPass, set: setNewPass, show: showNew, toggle: () => setShowNew((v) => !v) },
              ].map(({ label, value, set, show, toggle }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
                  <div className="relative">
                    <input type={show ? "text" : "password"} value={value} onChange={(e) => set(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" required />
                    <button type="button" onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{show ? eyeOff : eyeOn}</button>
                  </div>
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.changePassword.confirm")}</label>
                <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)}
                  className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] ${confirmPass && confirmPass !== newPass ? "border-red-300 bg-red-50" : "border-gray-200"}`} required />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.changePassword.cancel")}</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                  {saving ? t("admin.changePassword.saving") : t("admin.changePassword.save")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<SidebarView>("dashboard");
  const [showChangePass, setShowChangePass] = useState(false);

  const role = (localStorage.getItem("admin_role") ?? "admin") as AdminRole;
  const username = localStorage.getItem("admin_username") ?? "admin";

  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [partnersError, setPartnersError] = useState("");

  const [offices, setOffices] = useState<Office[]>([]);
  const [officesLoading, setOfficesLoading] = useState(true);
  const [officesError, setOfficesError] = useState("");

  function unauth() { localStorage.removeItem("admin_token"); localStorage.removeItem("admin_role"); localStorage.removeItem("admin_username"); navigate("/admin/login"); }

  const fetchPartners = useCallback(async () => {
    setPartnersLoading(true); setPartnersError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/partners`, { headers: adminHeaders() });
      if (res.status === 401) { unauth(); return; }
      const data = (await res.json()) as { ok: boolean; partners: Partner[] };
      if (data.ok) setPartners(data.partners);
    } catch { setPartnersError("Impossible de charger les candidatures."); } finally { setPartnersLoading(false); }
  }, []);

  const fetchOffices = useCallback(async () => {
    setOfficesLoading(true); setOfficesError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/offices`, { headers: adminHeaders() });
      if (res.status === 401) { unauth(); return; }
      const data = (await res.json()) as { ok: boolean; offices: Office[] };
      if (data.ok) setOffices(data.offices);
    } catch { setOfficesError("Impossible de charger les bureaux."); } finally { setOfficesLoading(false); }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) { navigate("/admin/login"); return; }
    if (role === "admin") { fetchPartners(); fetchOffices(); }
  }, [fetchPartners, fetchOffices, navigate, role]);

  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="ltr">
      <Sidebar
        view={view} setView={setView} role={role} username={username}
        onLogout={unauth} onChangePassword={() => setShowChangePass(true)}
        partnerCount={partners.filter((p) => p.status === "pending").length}
        officeCount={offices.length}
      />
      <main className="flex-1 ml-64 min-h-screen overflow-y-auto">
        {!isAdmin ? (
          <EmptyRoleView role={role} />
        ) : view === "dashboard" ? (
          <DashboardView onUnauth={unauth} onRefreshBadge={() => { fetchPartners(); fetchOffices(); }} />
        ) : view === "partners" ? (
          <PartnersView partners={partners} loading={partnersLoading} error={partnersError} onRefresh={fetchPartners} onUnauth={unauth} />
        ) : view === "offices" ? (
          <OfficesView offices={offices} loading={officesLoading} error={officesError} onRefresh={fetchOffices} onUnauth={unauth} />
        ) : (
          <AdminsView currentUsername={username} onUnauth={unauth} />
        )}
      </main>
      {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} />}
    </div>
  );
}
