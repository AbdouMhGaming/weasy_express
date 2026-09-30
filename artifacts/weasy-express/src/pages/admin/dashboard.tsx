import { useState, useEffect, useCallback, useRef, useMemo, memo, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { usePagination, PaginationBar } from "@/components/Pagination";
const HOSTINGER_PUBLIC_BUILD = import.meta.env.VITE_HOSTINGER_BUILD === "true";
const PerformanceView = lazy(() => import("./PerformanceView"));
const ChargesView     = lazy(() => import("./ChargesView"));
const CommissionsView = lazy(() => import("./CommissionsView"));
const SettingsView    = lazy(() => import("./SettingsView"));
const OfficeDashboardView = lazy(() => import("./OfficeDashboardView"));
const WorkersView     = lazy(() => import("./WorkersView"));
const DechargesView   = lazy(() => import("./DechargesView"));
const QueueView              = lazy(() => import("./QueueView"));
const PayoutsRequestView     = lazy(() => import("./PayoutsRequestView"));
const TeamView               = lazy(() => import("./TeamView"));
const AnalyticsView          = lazy(() => import("./AnalyticsView"));
const AgentApplicationsView  = lazy(() => import("./AgentApplicationsView"));
const ProfileView            = lazy(() => import("./ProfileView"));
const EcotrackSettingsView   = HOSTINGER_PUBLIC_BUILD ? null : lazy(() => import("./EcotrackSettingsView"));
const EcotrackWorkspaceView  = HOSTINGER_PUBLIC_BUILD ? null : lazy(() => import("./EcotrackWorkspaceView"));
const EcotrackDashboardView  = HOSTINGER_PUBLIC_BUILD ? null : lazy(() => import("./EcotrackDashboardView"));
const EcotrackReportsView    = HOSTINGER_PUBLIC_BUILD ? null : lazy(() => import("./EcotrackReportsView"));
const EcotrackDelaysView     = HOSTINGER_PUBLIC_BUILD ? null : lazy(() => import("./EcotrackDelaysView"));
const EcotrackFailuresView   = HOSTINGER_PUBLIC_BUILD ? null : lazy(() => import("./EcotrackFailuresView"));
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, History, Clock, Settings2, User } from "lucide-react";
import logoWhitePath from "@assets/weasy_logo_white_no_bg.png";
import AlgeriaMapSvg from "@/assets/algeria-map.svg?raw";
import { API_BASE, adminHeaders } from "@/lib/api";
import { useAutoRefresh } from "@/lib/useAutoRefresh";
import i18n, { SUPPORTED_LANGUAGES } from "@/lib/i18n";
import { WILAYA_LIST } from "@/lib/wilayas";
import { useEcotrackDashboard } from "@/hooks/use-ecotrack";
import { humanizeEcotrackStatus } from "./EcotrackWorkspaceView";

// ── Types ──────────────────────────────────────────────────────────────────────

type PartnerStatus = "pending" | "reviewing" | "approved" | "rejected";
type AdminRole = "admin" | "office" | "finance" | "commercial" | "expediteur" | "ticket_manager" | "suivi" | "admin_team";
type OrderStatus = "pending" | "in_transit" | "delivered" | "returned" | "failed" | "cancelled";

interface Partner {
  id: number; firstName: string; lastName: string; email: string;
  password: string | null; phone: string; address: string; city: string; wilayaCode?: string | null; wilayaName?: string | null;
  parcelsPerMonth: string; status: PartnerStatus; notes: string | null; createdAt: string;
}
interface Office {
  id: number; wilayaNumber: number; wilaya: string; commune: string | null;
  address: string; phone: string | null; mapsUrl: string; isPrincipal: boolean; createdAt: string;
}
interface AdminUser {
  id: number; username: string; role: AdminRole; office_hub: string;
  phone: string | null; email: string | null;
  allowed_partner_statuses: string | null; can_change_partner_status: number;
  createdAt: string;
}
interface ExpéditeurUser {
  id: number; username: string; phone: string | null; email: string | null; office_hub: string | null; createdAt: string;
}
interface Order {
  id: number; trackingNumber: string | null; status: OrderStatus;
  senderName: string | null; recipientName: string | null;
  destinationWilayaCode: string | null; destinationWilaya: string | null;
  originWilayaCode: string | null; originWilaya: string | null;
  createdAt: string;
  source?: "manual" | "pdf";
}
interface WilayaStat { code: string; name: string; total: number; delivered: number; }
interface DashboardStats {
  total: number; delivered: number; in_transit: number; returned: number;
  pending: number; failed: number; cancelled: number; successRate: number;
  byWilaya: WilayaStat[];
  recentOrders: Order[];
}
interface TopStats {
  topSenders: Array<{ name: string; count: string | number; delivered: string | number }>;
  topRecipients: Array<{ name: string; phone: string; count: number }>;
  topWilayas: Array<{ name: string; count: string | number }>;
  officeAgents: Array<{ name: string; createdAt: string }>;
  marketers: Array<{ name: string; createdAt: string }>;
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
  expediteur: "bg-amber-100 text-amber-800",
  ticket_manager: "bg-cyan-100 text-cyan-800",
  suivi: "bg-pink-100 text-pink-800",
  admin_team: "bg-purple-50 text-purple-600",
};
const LANG_LABELS: Record<string, string> = { fr: "FR", ar: "ع", en: "EN" };

// ── Shared push-notification helper ───────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

type SidebarView = "dashboard" | "partners" | "agent-applications" | "offices" | "admins" | "expediteurs" | "performance" | "charges" | "commissions" | "settings" | "office-dashboard" | "workers" | "decharges" | "queue" | "returns" | "merchants" | "payouts" | "messaging" | "team" | "analytics" | "ecotrack" | "ecotrack-desks" | "ecotrack-fees" | "ecotrack-products" | "ecotrack-settings" | "ecotrack-dashboard" | "ecotrack-reports" | "ecotrack-delays" | "ecotrack-delay-configuration" | "ecotrack-failures" | "profile";

function SidebarInner({
  view, setView, role, username, onLogout, onChangePassword,
  partnerCount, agentApplicationCount, officeCount, isOpen, onClose,
  isCollapsed = false, toggleCollapse, isPermitted
}: {
  view: string; setView: (v: string) => void;
  role: AdminRole; username: string;
  onLogout: () => void; onChangePassword: () => void;
  partnerCount: number; agentApplicationCount: number; officeCount: number;
  isOpen: boolean; onClose: () => void;
  isCollapsed?: boolean; toggleCollapse?: () => void;
  isPermitted: (v: string) => boolean;
}) {
  const { t } = useTranslation();
  const isAdmin = role === "admin";

  const { data: ecotrackDashboard } = useEcotrackDashboard({ enabled: role === "expediteur" && !HOSTINGER_PUBLIC_BUILD });
  const rawStatuses = ecotrackDashboard?.statuses || [];
  const ecotrackStatuses = useMemo(() => {
    const ordered = [
      "prete_a_expedier", "en_ramassage", "vers_station", "en_station",
      "vers_wilaya", "en_preparation", "en_livraison", "suspendu",
      "livre_non_encaisse", "encaisse_non_paye", "paiements_prets",
      "retour_chez_livreur", "retour_en_traitement", "retour_recu",
    ];
    const aliases: Record<string, string> = {
      pret_a_expedier: "prete_a_expedier",
      vers_hub: "vers_station",
      en_hub: "en_station",
      stock_en_preparation: "en_preparation",
      suspendus: "suspendu",
      "livré_non_encaissé": "livre_non_encaisse",
      "encaissé_non_payé": "encaisse_non_paye",
      paiement_pret: "paiements_prets", "paiement_prêt": "paiements_prets", "paiements_prêts": "paiements_prets",
      retour_en_transit: "retour_en_traitement",
      return_received: "retour_recu", retour_en_stock: "retour_recu",
    };
    const counts = new Map(ordered.map((status) => [status, 0]));
    for (const item of rawStatuses) {
      const raw = String(item.status ?? "").toLocaleLowerCase();
      const canonical = aliases[raw] ?? raw;
      if (counts.has(canonical)) counts.set(canonical, (counts.get(canonical) ?? 0) + (Number(item.count) || 0));
    }
    return ordered
      .map((status) => ({ status, count: counts.get(status) ?? 0 }))
      .filter((item) => item.count > 0);
  }, [rawStatuses]);

  const [isCommandesOpen, setIsCommandesOpen] = useState(view.startsWith("ecotrack-status-"));
  const [isDelaysOpen, setIsDelaysOpen] = useState(view === "ecotrack-delays" || view === "ecotrack-delay-configuration");
  const [isSettingsOpen, setIsSettingsOpen] = useState(view === "profile" || view === "ecotrack-settings");

  const groupHeader = (label: string) => (
    <div className={`px-3 pt-5 pb-2 text-[10px] font-extrabold text-[#ad120e] uppercase tracking-[.16em] ${isCollapsed ? "md:sr-only" : ""}`}>
      {label}
    </div>
  );

  // Team member permission filtering — use exp_* keys for expediteur sessions
  const sidebarIsTeam = localStorage.getItem(role === "expediteur" ? "exp_is_team" : "admin_is_team") === "1";
  const sidebarTeamPerms: string[] = sidebarIsTeam ? (() => { try { return JSON.parse(localStorage.getItem(role === "expediteur" ? "exp_permissions" : "admin_permissions") ?? "[]"); } catch { return []; } })() : [];
  function expAllowed(section: SidebarView) {
    if (role !== "expediteur" || !sidebarIsTeam) return true;
    return sidebarTeamPerms.length === 0 || sidebarTeamPerms.includes(section);
  }
  function offAllowed(section: SidebarView) {
    if (role !== "office" || !sidebarIsTeam) return true;
    return sidebarTeamPerms.length === 0 || sidebarTeamPerms.includes(section);
  }

  const navItem = (v: string, label: string, badge: number, icon: React.ReactNode) => (
    <button
      onClick={() => { setView(v); onClose(); }}
      title={isCollapsed ? label : undefined}
      aria-current={view === v ? "page" : undefined}
      className={`w-full flex items-center ${isCollapsed ? "md:justify-center" : ""} gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#B80500] ${
        view === v ? "bg-[#b80500] text-white shadow-sm" : "text-[#353535] hover:text-[#a60702] hover:bg-[#fff0ee]"
      }`}
    >
      {icon}
      <span className={isCollapsed ? "md:hidden" : ""}>{label}</span>
      {badge > 0 && (
        <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${view === v ? "bg-white/25 text-white" : "bg-[#fce9e7] text-[#9e0904]"} ${isCollapsed ? "md:hidden" : ""}`}>{badge}</span>
      )}
    </button>
  );

  return (
    <aside aria-label={t("admin.sidebar.label")} className={`fixed inset-y-0 left-0 bg-white border-r border-[#e9dedb] flex flex-col z-40 shadow-[4px_0_24px_rgba(38,19,17,.08)] transition-all duration-300 ease-in-out md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"} ${isCollapsed ? "w-64 md:w-[72px]" : "w-64"}`}>
      <div className={`bg-gradient-to-br from-[#E10600] to-[#a90000] flex flex-col items-center justify-center shrink-0 ${isCollapsed ? "md:px-2" : ""}`}>
        <img src={`${import.meta.env.BASE_URL}logo-white.png`} alt="Weasy Express" className={`w-[220px] h-[88px] object-cover object-center ${isCollapsed ? "md:hidden" : ""}`} />
        <img src={`${import.meta.env.BASE_URL}weasy-mark-white.png`} alt="Weasy Express" className={`hidden ${isCollapsed ? "md:block" : ""} w-14 h-[88px] object-contain`} />
      </div>

      <div className={`px-4 py-3 border-b border-[#eee3e1] flex items-center gap-2 ${isCollapsed ? "md:justify-center md:px-2" : "justify-between"}`}>
        <div className={isCollapsed ? "md:hidden" : ""}>
          <p className="text-[#292322] text-xs font-bold truncate">{username}</p>
          <span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 bg-[#fce9e7] text-[#9e0904]">
            {t(`admin.roles.${role}`)}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {role !== "suivi" && toggleCollapse && (
          <button onClick={toggleCollapse} title="Toggle Sidebar" aria-label="Toggle sidebar" className="hidden md:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[#514844] hover:text-[#a60702] hover:bg-[#fff0ee] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#B80500]">
            <svg className={`w-5 h-5 shrink-0 transition-transform duration-300 ${isCollapsed ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
          </button>
        )}
        </div>
      </div>

      {(isAdmin || role === "admin_team") ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {isPermitted("dashboard") && navItem("dashboard", t("admin.sidebar.dashboard"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}
          {isPermitted("partners") && navItem("partners", t("admin.sidebar.partners"), partnerCount,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          {isPermitted("agent-applications") && navItem("agent-applications", t("admin.sidebar.agentApplications"), agentApplicationCount,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0M19 8v6m3-3h-6" /></svg>
          )}
          {isPermitted("offices") && navItem("offices", t("admin.sidebar.offices"), officeCount,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          {isPermitted("admins") && navItem("admins", t("admin.sidebar.admins"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          )}
          <div className="my-2 border-t border-[#eee3e1]" />
          {isPermitted("performance") && navItem("performance", t("admin.sidebar.performance"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
          )}
          {!HOSTINGER_PUBLIC_BUILD && (isPermitted("ecotrack-delays") || isPermitted("ecotrack-delay-configuration")) && (
            <div>
              <button type="button" onClick={() => setIsDelaysOpen(open => !open)}
                aria-expanded={isDelaysOpen} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-[#353535] hover:text-[#a60702] hover:bg-[#fff0ee] ${isCollapsed ? "md:justify-center" : ""}`}
                title={isCollapsed ? t("admin.sidebar.ecotrackDelays") : undefined}>
                <Clock className="w-5 h-5 shrink-0" />
                <span className={isCollapsed ? "md:hidden" : ""}>{t("admin.sidebar.ecotrackDelays")}</span>
                <span className={`ml-auto text-xs ${isCollapsed ? "md:hidden" : ""}`}>{isDelaysOpen ? "▾" : "▸"}</span>
              </button>
              {isDelaysOpen && <div className={isCollapsed ? "md:pl-0" : "pl-5"}>
                {isPermitted("ecotrack-delays") && navItem("ecotrack-delays", t("admin.sidebar.delaysList"), 0, <Clock className="w-4 h-4 shrink-0" />)}
                {isPermitted("ecotrack-delay-configuration") && navItem("ecotrack-delay-configuration", t("admin.sidebar.delaysConfiguration"), 0, <Settings2 className="w-4 h-4 shrink-0" />)}
              </div>}
            </div>
          )}
          {isPermitted("charges") && navItem("charges", t("admin.charges.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}
          {isPermitted("commissions") && navItem("commissions", t("admin.commissions.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
          )}
          {isPermitted("workers") && navItem("workers", t("admin.workers.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          {isPermitted("decharges") && navItem("decharges", t("admin.decharges.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          )}
          <div className="my-2 border-t border-[#eee3e1]" />
          {isPermitted("queue") && navItem("queue", t("admin.sidebar.queue"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h10M4 18h10" /></svg>
          )}
          {isPermitted("returns") && navItem("returns", t("admin.sidebar.returns"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
          )}
          {isPermitted("expediteurs") && navItem("expediteurs", t("admin.sidebar.merchants"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          )}
          {isPermitted("payouts") && navItem("payouts", t("admin.sidebar.payouts"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          )}
          {isPermitted("messaging") && navItem("messaging", t("admin.sidebar.messaging"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          )}
          {isPermitted("team") && navItem("team", t("admin.sidebar.team"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          )}
          {isPermitted("analytics") && navItem("analytics", t("admin.sidebar.analytics"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}
          <div className="my-2 border-t border-[#eee3e1]" />
          {isPermitted("settings") && navItem("settings", t("admin.settings.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
        </nav>
      ) : role === "office" ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {offAllowed("office-dashboard") && navItem("office-dashboard", t("admin.sidebar.officeDashboard"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}
          <div className="my-2 border-t border-[#eee3e1]" />
          {offAllowed("queue") && navItem("queue", t("admin.sidebar.queue"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h10M4 18h10" /></svg>
          )}
          {offAllowed("returns") && navItem("returns", t("admin.sidebar.returns"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
          )}
          {offAllowed("merchants") && navItem("merchants", t("admin.sidebar.merchants"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          )}
          {offAllowed("payouts") && navItem("payouts", t("admin.sidebar.payouts"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          )}
          {offAllowed("messaging") && navItem("messaging", t("admin.sidebar.messaging"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          )}
          {offAllowed("team") && navItem("team", t("admin.sidebar.team"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 118 0z" /></svg>
          )}
          {offAllowed("analytics") && navItem("analytics", t("admin.sidebar.analytics"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}
        </nav>
      ) : role === "finance" ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {isPermitted("charges") && navItem("charges", t("admin.charges.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}
          {isPermitted("commissions") && navItem("commissions", t("admin.commissions.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>
          )}
          {isPermitted("workers") && navItem("workers", t("admin.workers.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
          {isPermitted("decharges") && navItem("decharges", t("admin.decharges.title"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          )}
        </nav>
      ) : role === "commercial" ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {isPermitted("partners") && navItem("partners", t("admin.sidebar.partners"), partnerCount,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          )}
        </nav>
      ) : role === "expediteur" ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {groupHeader(t("admin.sidebar.groups.activity"))}
          {!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack-dashboard") && navItem("ecotrack-dashboard", t("admin.sidebar.ecotrackDashboard"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}
          {!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack") && (
            <div>
              <button
                type="button"
                onClick={() => {
                  if (isCollapsed && toggleCollapse) {
                    toggleCollapse();
                    setIsCommandesOpen(true);
                    return;
                  }
                  setIsCommandesOpen((open) => !open);
                }}
                aria-expanded={isCommandesOpen}
                title={isCollapsed ? t("admin.ecotrackPortal.nav") : undefined}
                className={`w-full flex items-center ${isCollapsed ? "md:justify-center" : ""} gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  view.startsWith("ecotrack-status-")
                    ? "bg-[#fce9e7] text-[#a60702]"
                    : "text-[#353535] hover:text-[#a60702] hover:bg-[#fff0ee]"
                }`}
              >
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7h-3V4H3a2 2 0 00-2 2v11h2a3 3 0 006 0h6a3 3 0 006 0h2v-5l-3-5zM6 19a2 2 0 110-4 2 2 0 010 4zm12 0a2 2 0 110-4 2 2 0 010 4zM17 9h2l2 3h-4V9z" /></svg>
                <span className={`flex-1 text-start ${isCollapsed ? "md:hidden" : ""}`}>{t("admin.ecotrackPortal.nav")}</span>
                <span className={isCollapsed ? "md:hidden" : ""}>
                  {isCommandesOpen
                    ? <ChevronDown className="h-4 w-4 shrink-0" />
                    : <ChevronRight className="h-4 w-4 shrink-0 rtl:rotate-180" />}
                </span>
              </button>
              {isCommandesOpen && (
                <div className={`ms-5 mt-1 space-y-0.5 border-s border-[#ead4d0] ps-2 ${isCollapsed ? "md:hidden" : ""}`}>
                  {ecotrackStatuses.map((item: any) => {
                    const status = String(item.status);
                    const statusView = `ecotrack-status-${status}`;
                    const active = view === statusView;
                    return (
                      <button
                        type="button"
                        key={status}
                        onClick={() => { setView(statusView); onClose(); }}
                        className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors ${
                          active
                            ? "bg-[#E10600] text-white font-semibold"
                            : "text-[#353535] hover:bg-[#fff0ee] hover:text-[#a60702]"
                        }`}
                      >
                        <span className="min-w-0 flex-1 truncate text-start" title={humanizeEcotrackStatus(status, t)}>
                          {humanizeEcotrackStatus(status, t)}
                        </span>
                        {Number(item.count) > 0 && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            active ? "bg-white/25 text-white" : "bg-[#fce9e7] text-[#9e0904]"
                          }`}>
                            {item.count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {expAllowed("queue") && navItem("queue", t("admin.sidebar.queue"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h10M4 18h10" /></svg>
          )}
          {!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack-delays") && navItem("ecotrack-delays", t("admin.sidebar.ecotrackDelays"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}

          {groupHeader(t("admin.sidebar.groups.management"))}
          {!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack-products") && navItem("ecotrack-products", t("admin.ecotrackPortal.productsNav"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
          )}
          {!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack-desks") && navItem("ecotrack-desks", t("admin.sidebar.agencies"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 21h18M5 21V7l7-4 7 4v14M9 10h6M9 14h6M9 18h6" /></svg>
          )}
          {(!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack")) && navItem("ecotrack-history", t("admin.sidebar.history"), 0,
            <History className="w-5 h-5 shrink-0" />
          )}

          {groupHeader(t("admin.sidebar.groups.finances"))}
          {expAllowed("payouts") && navItem("payouts", t("admin.sidebar.payouts"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          )}
          {!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack-fees") && navItem("ecotrack-fees", t("admin.sidebar.fees"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6v12m3-9.5c-.7-.9-1.7-1.5-3-1.5-1.7 0-3 1-3 2.5s1.3 2.2 3 2.5 3 1 3 2.5-1.3 2.5-3 2.5c-1.3 0-2.4-.6-3-1.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}

          {groupHeader(t("admin.sidebar.groups.analytics"))}
          {!HOSTINGER_PUBLIC_BUILD && expAllowed("ecotrack-reports") && navItem("ecotrack-reports", t("admin.sidebar.reports"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
          )}

          {groupHeader(t("admin.sidebar.groups.administration"))}
          {expAllowed("team") && navItem("team", t("admin.sidebar.team"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          )}
          <div>
            <button type="button" onClick={() => {
              if (isCollapsed && toggleCollapse && window.innerWidth >= 768) {
                toggleCollapse();
                setIsSettingsOpen(true);
              } else setIsSettingsOpen(open => !open);
            }}
              aria-expanded={isSettingsOpen} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-[#353535] hover:text-[#a60702] hover:bg-[#fff0ee] ${isCollapsed ? "md:justify-center" : ""}`}
              title={isCollapsed ? t("admin.sidebar.settings") : undefined}>
              <Settings2 className="w-5 h-5 shrink-0" />
              <span className={isCollapsed ? "md:hidden" : ""}>{t("admin.sidebar.settings")}</span>
              <span className={`ml-auto text-xs ${isCollapsed ? "md:hidden" : ""}`}>{isSettingsOpen ? "▾" : "▸"}</span>
            </button>
            {isSettingsOpen && <div className={isCollapsed ? "md:hidden" : "pl-5"}>
              {navItem("profile", t("admin.sidebar.profile"), 0,
                <User className="w-4 h-4 shrink-0" />
              )}
              {!HOSTINGER_PUBLIC_BUILD && !sidebarIsTeam && navItem("ecotrack-settings", t("admin.sidebar.api"), 0,
                <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
              )}
              <button onClick={onLogout} title={isCollapsed ? t("admin.sidebar.logout") : undefined} className={`w-full flex items-center ${isCollapsed ? "md:justify-center" : ""} gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-[#353535] hover:text-[#a60702] hover:bg-[#fff0ee] transition-colors`}>
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span className={isCollapsed ? "md:hidden" : ""}>{t("admin.sidebar.logout")}</span>
              </button>
            </div>}
          </div>
        </nav>
      ) : role === "ticket_manager" ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItem("queue", t("admin.sidebar.queue"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h10M4 18h10" /></svg>
          )}
        </nav>
      ) : role === "suivi" ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {!HOSTINGER_PUBLIC_BUILD && navItem("ecotrack-delays", t("admin.sidebar.ecotrackDelays", "Retards"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}
          {!HOSTINGER_PUBLIC_BUILD && navItem("ecotrack-failures", t("admin.sidebar.ecotrackFailures", "Échec de livraison"), 0,
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          )}
        </nav>
      ) : (
        <div className="flex-1" />
      )}

      <div className={`px-3 pb-5 space-y-1 border-t border-[#eee3e1] pt-4 shrink-0 ${isCollapsed ? "flex flex-col items-center" : ""}`}>
        <div className={`gap-1 pb-2 ${isCollapsed ? "hidden" : "flex items-center px-3"}`}>
          {SUPPORTED_LANGUAGES.map((lng) => (
            <button
              key={lng}
              onClick={() => i18n.changeLanguage(lng)}
              className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                i18n.language === lng ? "bg-[#b80500] text-white" : "text-[#514844] hover:text-[#a60702] hover:bg-[#fff0ee]"
              }`}
            >
              {LANG_LABELS[lng]}
            </button>
          ))}
        </div>
        {role !== "expediteur" && <><button onClick={onChangePassword} title={t("admin.sidebar.changePassword")} className={`w-full flex items-center ${isCollapsed ? "md:justify-center" : ""} gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-[#353535] hover:text-[#a60702] hover:bg-[#fff0ee] transition-colors`}>
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
          <span className={isCollapsed ? "md:hidden" : ""}>{t("admin.sidebar.changePassword")}</span>
        </button>
        <button onClick={onLogout} title={t("admin.sidebar.logout")} className={`w-full flex items-center ${isCollapsed ? "md:justify-center" : ""} gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-[#353535] hover:text-[#a60702] hover:bg-[#fff0ee] transition-colors`}>
          <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
          <span className={isCollapsed ? "md:hidden" : ""}>{t("admin.sidebar.logout")}</span>
        </button></>}
      </div>
    </aside>
  );
}
const Sidebar = memo(SidebarInner);

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

// ── Coming Soon placeholder ────────────────────────────────────────────────────

const COMING_SOON_ICONS: Record<string, React.ReactNode> = {
  queue:     <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h10M4 18h10" /></svg>,
  returns:   <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>,
  merchants: <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  payouts:   <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>,
  messaging: <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>,
  team:      <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  analytics: <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>,
};

function ComingSoonView({ section }: { section: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-32 px-8 text-center">
      <div className="mb-5">{COMING_SOON_ICONS[section]}</div>
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-600 border border-amber-200 mb-4">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        {t("admin.sidebar." + section)}
      </span>
      <h2 className="text-xl font-bold text-gray-900 mb-2">{t("admin.comingSoon.title")}</h2>
      <p className="text-gray-400 text-sm max-w-xs">{t("admin.comingSoon.subtitle")}</p>
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
  const maxCount = Math.max(...byWilaya.map((w) => w.total), 1);
  const styleRules = byWilaya
    .filter((w) => w.total > 0)
    .map((w) => `#${w.code}{fill:${wilayaHeatColor(w.total, maxCount)}!important}`)
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

// TIME_PRESET_LABELS built dynamically inside DashboardView using t()

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

  const timePresetLabels = useMemo(() => [
    { value: "all" as TimePreset,       label: t("admin.timePresets.all") },
    { value: "today" as TimePreset,     label: t("admin.timePresets.today") },
    { value: "yesterday" as TimePreset, label: t("admin.timePresets.yesterday") },
    { value: "7d" as TimePreset,        label: t("admin.timePresets.d7") },
    { value: "30d" as TimePreset,       label: t("admin.timePresets.d30") },
  ], [t]);

  const [timePreset, setTimePreset] = useState<TimePreset>("all");
  const [filterWilaya, setFilterWilaya] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterOffice, setFilterOffice] = useState("");
  const [formWilaya, setFormWilaya] = useState("");
  const [formFrom, setFormFrom] = useState("");
  const [formTo, setFormTo] = useState("");
  const [formOffice, setFormOffice] = useState("");
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  const [topStats, setTopStats] = useState<TopStats | null>(null);
  const topSendersAll = useMemo(() => topStats?.topSenders ?? [], [topStats]);
  const topRecipientsAll = useMemo(() => topStats?.topRecipients ?? [], [topStats]);
  const sendersPag = usePagination(topSendersAll);
  const recipientsPag = usePagination(topRecipientsAll);
  const [searchOrders, setSearchOrders] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  interface OfficeReportRow {
    id: number; report_type: string; file_name: string;
    report_date: string; total_parcels: number;
    total_amount_dzd: number; net_amount_dzd: number;
    sender_name: string | null; station: string | null;
    uploaded_by: string | null; created_at: string;
  }
  const [officeReports, setOfficeReports] = useState<OfficeReportRow[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  const fetchTopStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterOffice) params.set("office", filterOffice);
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/api/admin/top-stats${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
      if (res.status !== 200) return;
      const data = await res.json();
      if (data.ok) setTopStats(data);
    } catch { }
  }, [filterOffice]);

  const fetchOfficeReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/office/reports`, { headers: adminHeaders() });
      if (res.status !== 200) return;
      const data = await res.json();
      if (data.ok) setOfficeReports(data.reports ?? []);
    } catch { } finally { setReportsLoading(false); }
  }, []);

  useEffect(() => { fetchTopStats(); fetchOfficeReports(); }, [fetchTopStats, fetchOfficeReports]);
  useAutoRefresh(fetchTopStats, 30_000);

  const dashboardMapSvg = useMemo(() => buildMapSvg(stats), [stats]);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const range = getDateRangeFromPreset(timePreset, filterFrom, filterTo);
      if (range.from) params.set("from", range.from);
      if (range.to) params.set("to", range.to);
      if (filterWilaya) params.set("wilaya", filterWilaya);
      if (filterOffice) params.set("office", filterOffice);
      const qs = params.toString();
      const res = await fetch(`${API_BASE}/api/admin/stats${qs ? `?${qs}` : ""}`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; stats: DashboardStats };
      if (data.ok) setStats(data.stats);
    } catch { } finally { setLoading(false); }
  }, [onUnauth, timePreset, filterWilaya, filterFrom, filterTo, filterOffice]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useAutoRefresh(fetchStats, 30_000);

  const handleReprocessAll = useCallback(async () => {
    if (!window.confirm("Re-traiter tous les PDFs importés ?\n\nCela relit chaque fichier original et corrige les données extraites (expéditeurs, numéros de suivi, destinataires, etc.).")) return;
    setReprocessing(true);
    try {
      const res = await fetch(`${API_BASE}/api/office/reports/reprocess-all`, { method: "POST", headers: adminHeaders() });
      const data = await res.json();
      if (data.ok) {
        alert(`✅ ${data.updated} rapport(s) retraité(s) sur ${data.total}${data.failed ? ` · ${data.failed} échec(s)` : ""}`);
        fetchStats(); fetchTopStats(); fetchOfficeReports();
      } else {
        alert("Erreur lors du retraitement.");
      }
    } catch { alert("Erreur réseau."); }
    finally { setReprocessing(false); }
  }, [fetchStats, fetchTopStats, fetchOfficeReports]);

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
      if (data.ok) { setShowModal(false); fetchStats(); }
    } finally { setSaving(false); }
  }

  async function deleteOrder(id: number) {
    if (!confirm(t("admin.dashboard.orders.deleteConfirm"))) return;
    const res = await fetch(`${API_BASE}/api/admin/orders/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchStats();
  }

  function selectPreset(preset: TimePreset) {
    setTimePreset(preset);
    setFilterFrom(""); setFilterTo("");
    setFormFrom(""); setFormTo("");
  }

  function applyAdvancedFilter() {
    setFilterFrom(formFrom); setFilterTo(formTo); setFilterWilaya(formWilaya);
    setFilterOffice(formOffice);
    setTimePreset("custom");
    setShowAdvancedFilter(false);
  }

  function resetFilters() {
    setTimePreset("all");
    setFilterFrom(""); setFilterTo(""); setFilterWilaya(""); setFilterOffice("");
    setFormFrom(""); setFormTo(""); setFormWilaya(""); setFormOffice("");
    setShowAdvancedFilter(false);
  }

  const hasActiveFilter = timePreset !== "all" || filterWilaya !== "" || filterOffice !== "";

  const filteredOrders = useMemo(() => {
    if (!stats) return [];
    let orders = statusFilter === "all"
      ? stats.recentOrders
      : stats.recentOrders.filter((o) => o.status === statusFilter);
    if (searchOrders.trim()) {
      const q = searchOrders.trim().toLowerCase();
      orders = orders.filter((o) =>
        o.trackingNumber?.toLowerCase().includes(q) ||
        o.senderName?.toLowerCase().includes(q) ||
        o.recipientName?.toLowerCase().includes(q) ||
        o.destinationWilaya?.toLowerCase().includes(q) ||
        o.originWilaya?.toLowerCase().includes(q)
      );
    }
    return orders;
  }, [stats, statusFilter, searchOrders]);

  const ordersPag = usePagination(filteredOrders);
  const reportsPag = usePagination(officeReports);

  const kpiCards = useMemo(() => stats ? [
    { label: t("admin.dashboard.kpi.total"), value: stats.total, color: "from-slate-600 to-slate-700", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg> },
    { label: t("admin.dashboard.kpi.delivered"), value: stats.delivered, color: "from-emerald-500 to-emerald-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { label: t("admin.dashboard.kpi.inTransit"), value: stats.in_transit, color: "from-blue-500 to-blue-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" /></svg> },
    { label: t("admin.dashboard.kpi.returned"), value: stats.returned, color: "from-orange-500 to-orange-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg> },
    { label: t("admin.dashboard.kpi.pending"), value: stats.pending, color: "from-amber-500 to-amber-600", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> },
    { label: t("admin.dashboard.kpi.successRate"), value: `${stats.successRate}%`, color: "from-[#E10600] to-[#B80500]", icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg> },
  ] : [], [stats, t]);

  return (
    <>
      <div className="p-3 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin.dashboard.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("admin.dashboard.subtitle")}</p>
          </div>
          <button onClick={() => { fetchStats(); fetchTopStats(); fetchOfficeReports(); }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors">
            <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            {t("admin.dashboard.refresh")}
          </button>
        </div>

        {/* Filter bar */}
        <div className="mb-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 shrink-0">Période :</span>
            {timePresetLabels.map((p) => (
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
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 md:grid-cols-5 gap-3">
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
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Agence</label>
                <select
                  value={formOffice}
                  onChange={(e) => setFormOffice(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white"
                >
                  <option value="">Toutes les agences</option>
                  {(topStats?.officeAgents ?? []).map((a: { name: string }) => (
                    <option key={a.name} value={a.name}>{a.name}</option>
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
                  {timePresetLabels.find((p) => p.value === timePreset)?.label ?? "Période personnalisée"}
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
              {filterOffice && (
                <span className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-[#E10600] font-semibold px-2.5 py-1 rounded-full">
                  Agence : {filterOffice}
                  <button onClick={() => { setFilterOffice(""); setFormOffice(""); }} className="ml-0.5 hover:text-red-800">×</button>
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
              <div key={card.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-5 flex items-center gap-3">
                <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${card.color} text-white flex items-center justify-center shrink-0 shadow-sm`}>
                  {card.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-lg sm:text-2xl font-bold text-gray-900 leading-none truncate">{card.value}</p>
                  <p className="text-xs text-gray-500 mt-1 font-medium leading-tight">{card.label}</p>
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
                  {s === "all" ? t("admin.dashboard.orders.filter.all") : t(`admin.dashboard.orders.status.${s}`)}
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

            {/* Search bar */}
            <div className="px-5 py-2.5 border-b border-gray-50">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchInput(v);
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                    searchDebounceRef.current = setTimeout(() => setSearchOrders(v), 300);
                  }}
                  placeholder={t("admin.dashboard.orders.filter.search")}
                  className="w-full pl-8 pr-8 py-1.5 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-gray-50/60"
                />
                {searchInput && (
                  <button onClick={() => { setSearchInput(""); setSearchOrders(""); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm leading-none">×</button>
                )}
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="py-20 text-center text-gray-400 text-sm">{t("admin.dashboard.orders.noData")}</div>
            ) : (
              <>
              {/* ── Mobile cards (< sm) ── */}
              <div className="sm:hidden divide-y divide-gray-100 overflow-y-auto max-h-[520px]">
                {ordersPag.paged.map((o) => (
                  <div key={o.id} className={`px-4 py-3 flex flex-col gap-2 ${o.source === "pdf" ? "bg-blue-50/20" : "hover:bg-gray-50/60"} transition-colors`}>
                    {/* Top row: tracking + status + actions */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                          {o.trackingNumber ?? `#${Math.abs(o.id)}`}
                        </span>
                        {o.source === "pdf" && (
                          <span className="text-xs text-blue-600 font-semibold flex items-center gap-0.5">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-1h8v1H8zm0-3v-1h8v1H8zm0-3V10h5v1H8z"/></svg>
                            PDF
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ORDER_STATUS_STYLE[o.status]}`}>
                          {t(`admin.dashboard.orders.status.${o.status}`)}
                        </span>
                        {o.source !== "pdf" ? (
                          <>
                            <button onClick={() => openEdit(o)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => deleteOrder(o.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {/* Detail grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px]">{t("admin.dashboard.orders.cols.sender")}</span>
                        <p className="text-gray-700 font-medium truncate">{o.senderName ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px]">{t("admin.dashboard.orders.cols.recipient")}</span>
                        <p className="text-gray-700 truncate">{o.recipientName ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px]">{t("admin.dashboard.orders.cols.origin")}</span>
                        <p className="text-gray-600 truncate">{o.originWilaya ?? "—"}</p>
                      </div>
                      <div>
                        <span className="text-gray-400 uppercase tracking-wide text-[10px]">{t("admin.dashboard.orders.cols.destination")}</span>
                        <p className="text-gray-700 font-medium truncate">{o.destinationWilaya ?? "—"}</p>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400 uppercase tracking-wide text-[10px]">{t("admin.dashboard.orders.cols.date")}</span>
                        <p className="text-gray-400">{fmtDate(o.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Desktop table (≥ sm) ── */}
              <div className="hidden sm:block overflow-x-auto overflow-y-auto max-h-[480px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">{t("admin.dashboard.orders.cols.tracking")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">{t("admin.dashboard.orders.cols.sender")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 hidden md:table-cell">{t("admin.dashboard.orders.cols.recipient")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 hidden lg:table-cell">{t("admin.dashboard.orders.cols.origin")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 hidden md:table-cell">{t("admin.dashboard.orders.cols.destination")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">{t("admin.dashboard.orders.cols.status")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 hidden lg:table-cell">{t("admin.dashboard.orders.cols.date")}</th>
                      <th className="w-16 px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {ordersPag.paged.map((o) => (
                      <tr key={o.id} className={`hover:bg-gray-50/60 transition-colors ${o.source === "pdf" ? "bg-blue-50/20" : ""}`}>
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded w-fit">
                              {o.trackingNumber ?? `#${Math.abs(o.id)}`}
                            </span>
                            {o.source === "pdf" && (
                              <span className="text-xs text-blue-600 font-semibold flex items-center gap-0.5">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM8 17v-1h8v1H8zm0-3v-1h8v1H8zm0-3V10h5v1H8z"/></svg>
                                PDF
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-700 text-xs max-w-[120px]">
                          <span className="block truncate">{o.senderName ?? "—"}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-xs hidden md:table-cell max-w-[100px]">
                          <span className="block truncate">{o.recipientName ?? "—"}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-500 text-xs hidden lg:table-cell max-w-[100px]">
                          <span className="block truncate">{o.originWilaya ?? "—"}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-700 text-xs hidden md:table-cell max-w-[120px]">
                          <span className="block truncate font-medium">{o.destinationWilaya ?? "—"}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ORDER_STATUS_STYLE[o.status]}`}>
                            {t(`admin.dashboard.orders.status.${o.status}`)}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-gray-400 hidden lg:table-cell whitespace-nowrap">{fmtDate(o.createdAt)}</td>
                        <td className="px-3 py-3">
                          {o.source !== "pdf" ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(o)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => deleteOrder(o.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-300 px-2">PDF</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
            {!loading && filteredOrders.length > 0 && <PaginationBar {...ordersPag} />}
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

              {/* Top wilayas — all wilayas with at least 1 parcel */}
              {stats && stats.byWilaya.filter((w) => w.total > 0).length > 0 && (
                <div className="w-full mt-4">
                  <p className="text-xs text-white/40 font-semibold uppercase tracking-widest px-1 mb-2">Top wilayas</p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                    {stats.byWilaya.filter((w) => w.total > 0).map((w) => {
                      const maxT = stats.byWilaya.filter((x) => x.total > 0)[0]?.total ?? 1;
                      return (
                        <div key={w.code} className="flex items-center gap-2">
                          <span className="text-xs text-white/60 w-28 truncate shrink-0">{w.name || w.code}</span>
                          <div className="flex-1 bg-white/10 rounded-full h-1.5">
                            <div
                              className="h-1.5 rounded-full transition-all"
                              style={{ width: `${Math.round((w.total / maxT) * 100)}%`, backgroundColor: wilayaHeatColor(w.total, maxT) }}
                            />
                          </div>
                          <span className="text-xs text-white/60 w-6 text-right shrink-0">{w.total}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {stats && stats.total === 0 && (
                <p className="mt-4 text-xs text-white/30 italic text-center">{t("admin.dashboard.map.noData")}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Top Sections */}
      {topStats && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Top Senders */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><span>🏆</span>{t("admin.office.charts.topSenders")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("admin.office.charts.fdrOnly")}</p>
              </div>
              {topSendersAll.length > 0 && (
                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">{topSendersAll.length}</span>
              )}
            </div>
            <div className="overflow-y-auto max-h-72 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
              <div className="p-4 space-y-3">
                {topSendersAll.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">{t("admin.office.charts.noSenders")}</p>
                ) : sendersPag.paged.map((s, i) => {
                  const globalRank = (sendersPag.page - 1) * sendersPag.pageSize + i + 1;
                  const maxS = Number(topSendersAll[0]?.count ?? 1);
                  const pct = Math.round((Number(s.count) / maxS) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="min-w-[1.5rem] h-5 rounded-full bg-gray-100 text-xs font-bold text-gray-500 flex items-center justify-center shrink-0 px-1">{globalRank}</span>
                      <span className="text-xs text-gray-700 flex-1 truncate font-medium">{s.name}</span>
                      <div className="w-12 bg-gray-100 rounded-full h-1.5 shrink-0">
                        <div className="h-1.5 rounded-full bg-[#E10600]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-900 min-w-[1.5rem] text-right shrink-0">{Number(s.count)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <PaginationBar
              page={sendersPag.page}
              totalPages={sendersPag.totalPages}
              totalItems={sendersPag.totalItems}
              pageSize={sendersPag.pageSize}
              setPage={sendersPag.setPage}
              setPageSize={sendersPag.setPageSize}
            />
          </div>

          {/* Top Clients — top recipients from FDR PDFs */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-2">
              <div>
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><span>⭐</span>{t("admin.office.charts.topClients")}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{t("admin.office.charts.fdrOnly")}</p>
              </div>
              {topRecipientsAll.length > 0 && (
                <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">{topRecipientsAll.length}</span>
              )}
            </div>
            <div className="overflow-y-auto max-h-72 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-200 [&::-webkit-scrollbar-thumb]:rounded-full">
              <div className="p-4 space-y-3">
                {topRecipientsAll.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">{t("admin.office.charts.noClients")}</p>
                ) : recipientsPag.paged.map((r, i) => {
                  const globalRank = (recipientsPag.page - 1) * recipientsPag.pageSize + i + 1;
                  const maxR = Number(topRecipientsAll[0]?.count ?? 1);
                  const pct = Math.round((Number(r.count) / maxR) * 100);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="min-w-[1.5rem] h-5 rounded-full bg-gray-100 text-xs font-bold text-gray-500 flex items-center justify-center shrink-0 px-1">{globalRank}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-700 font-medium truncate">{r.name}</p>
                        {r.phone && <p className="text-[10px] text-gray-400 truncate">{r.phone}</p>}
                      </div>
                      <div className="w-12 bg-gray-100 rounded-full h-1.5 shrink-0">
                        <div className="h-1.5 rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-bold text-gray-900 min-w-[1.5rem] text-right shrink-0">{Number(r.count)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <PaginationBar
              page={recipientsPag.page}
              totalPages={recipientsPag.totalPages}
              totalItems={recipientsPag.totalItems}
              pageSize={recipientsPag.pageSize}
              setPage={recipientsPag.setPage}
              setPageSize={recipientsPag.setPageSize}
            />
          </div>

          {/* Top Marketers — hidden */}
        </div>
      )}

      {/* ── Tous les rapports importés ─────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">📂</span>
            <h3 className="font-bold text-gray-900 text-base">Tous les rapports importés</h3>
            {officeReports.length > 0 && (
              <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {officeReports.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchOfficeReports}
              className="text-xs text-gray-400 hover:text-gray-700 flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
            >
              <svg className={`w-3.5 h-3.5 ${reportsLoading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualiser
            </button>
          </div>
        </div>
        {reportsLoading ? (
          <div className="py-10 flex justify-center">
            <svg className="animate-spin w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : officeReports.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">Aucun rapport importé</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Fichier</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Date rapport</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden sm:table-cell">Expéditeur / Station</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Colis</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden md:table-cell">Importé par</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3 hidden lg:table-cell">Importé le</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {reportsPag.paged.map((r) => {
                  const typeLabel = r.report_type === "delivery_receipt" ? { icon: "✅", label: "Décharge", badge: "bg-emerald-100 text-emerald-700" }
                    : r.report_type === "route_sheet" ? { icon: "🗺️", label: "Feuille de route", badge: "bg-blue-100 text-blue-700" }
                    : r.report_type === "returns_list" ? { icon: "↩️", label: "Retours", badge: "bg-orange-100 text-orange-700" }
                    : { icon: "❓", label: "Inconnu", badge: "bg-gray-100 text-gray-600" };
                  const displaySender = r.sender_name
                    ? (() => {
                        const parts = r.sender_name.split("|").filter(Boolean);
                        if (parts.length <= 1) return r.sender_name;
                        return parts.length <= 2
                          ? parts.join(", ")
                          : `${parts.slice(0, 2).join(", ")} (+${parts.length - 2} autres)`;
                      })()
                    : (r.station ?? "—");
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${typeLabel.badge}`}>
                          <span>{typeLabel.icon}</span> {typeLabel.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <span className="text-xs text-gray-600 truncate block font-mono">{r.file_name}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-semibold text-gray-700">
                          {r.report_date ? fmtDate(r.report_date) : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell max-w-[160px]">
                        <span className="text-xs text-gray-600 truncate block">{displaySender}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-bold text-gray-900">{r.total_parcels}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="text-xs text-gray-500 font-medium">{r.uploaded_by ?? "—"}</span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell whitespace-nowrap">
                        <span className="text-xs text-gray-400">{r.created_at ? fmtDate(String(r.created_at)) : "—"}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          <a
                            href={`${API_BASE}/api/office/reports/${r.id}/file?token=${encodeURIComponent(localStorage.getItem("admin_token") ?? "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Ouvrir le PDF"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
                          <button
                            onClick={async () => {
                              if (!confirm("Supprimer ce rapport PDF ?")) return;
                              try {
                                await fetch(`${API_BASE}/api/office/reports/${r.id}`, { method: "DELETE", headers: adminHeaders() });
                                fetchOfficeReports(); fetchStats(); fetchTopStats();
                              } catch { }
                            }}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!reportsLoading && officeReports.length > 0 && <PaginationBar {...reportsPag} />}
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

function PartnersView({ partners, loading, error, onRefresh, onUnauth, role, canChangeStatus }: {
  partners: Partner[]; loading: boolean; error: string; onRefresh: () => void; onUnauth: () => void; role: AdminRole; canChangeStatus?: boolean;
}) {
  const { t } = useTranslation();
  const isAdmin = role === "admin";
  const canEdit = isAdmin || (role === "commercial" && canChangeStatus === true);
  const [filter, setFilter] = useState<PartnerStatus | "all">("all");
  const [selected, setSelected] = useState<Partner | null>(null);
  const [editStatus, setEditStatus] = useState<PartnerStatus>("pending");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Add partner form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: "", lastName: "", email: "", phone: "", wilayaCode: "", address: "", parcelsPerMonth: "", password: "", status: "pending" as PartnerStatus, notes: "" });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState("");

  function openAdd() { setAddForm({ firstName: "", lastName: "", email: "", phone: "", wilayaCode: "", address: "", parcelsPerMonth: "", password: "", status: "pending", notes: "" }); setAddError(""); setShowAdd(true); }
  function setAdd<K extends keyof typeof addForm>(k: K, v: typeof addForm[K]) { setAddForm((f) => ({ ...f, [k]: v })); }

  async function addPartner() {
    if (!addForm.firstName || !addForm.lastName || !addForm.email || !addForm.phone || !addForm.wilayaCode || !addForm.address || !addForm.parcelsPerMonth) {
      setAddError(t("admin.partners.addError")); return;
    }
    setAddSaving(true); setAddError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/partners`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ ...addForm, city: WILAYA_LIST.find(w => w.code === addForm.wilayaCode)?.name ?? "", wilayaName: WILAYA_LIST.find(w => w.code === addForm.wilayaCode)?.name ?? "", password: addForm.password || null, notes: addForm.notes || null }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) { setShowAdd(false); onRefresh(); }
      else setAddError(t("admin.partners.addError"));
    } catch { setAddError(t("admin.partners.addError")); } finally { setAddSaving(false); }
  }

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
  const filtered = useMemo(
    () => filter === "all" ? partners : partners.filter((p) => p.status === filter),
    [partners, filter],
  );
  const pagedPartners = usePagination(filtered, 10);

  return (
    <>
      <div className="p-3 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin.partners.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("admin.partners.subtitle")}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={openAdd} className="flex items-center gap-2 text-sm font-semibold bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white px-4 py-2 rounded-xl shadow-sm shadow-red-200 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              {t("admin.partners.addPartner")}
            </button>
            <button onClick={onRefresh} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {t("admin.partners.refresh")}
            </button>
          </div>
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
              {pagedPartners.paged.map((p) => (
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
          {!loading && filtered.length > 0 && <PaginationBar {...pagedPartners} />}
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
                  [t("admin.partners.fields.wilaya"), selected.wilayaName || selected.city],
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
              {canEdit ? (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.statusLabel")}</label>
                    <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as PartnerStatus)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                      {(["pending", "reviewing", "approved", "rejected"] as const).map((s) => (
                        <option key={s} value={s}>{t(`admin.partners.statusOptions.${s}`)}</option>
                      ))}
                    </select>
                  </div>
                  {isAdmin && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.notesLabel")}</label>
                      <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] resize-none"
                        placeholder={t("admin.partners.notesPh")} />
                    </div>
                  )}
                  <div className="flex gap-2">
                    {isAdmin && (
                      <button onClick={() => remove(selected.id)} className="py-2.5 px-4 text-sm text-red-600 font-medium rounded-xl border border-red-200 hover:bg-red-50">
                        {t("admin.partners.delete")}
                      </button>
                    )}
                    <button onClick={() => setSelected(null)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.partners.cancel")}</button>
                    <button onClick={save} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                      {saving ? t("admin.partners.saving") : t("admin.partners.save")}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => setSelected(null)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.partners.cancel")}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Partner modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900">{t("admin.partners.addTitle")}</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.firstName")} *</label>
                  <input value={addForm.firstName} onChange={(e) => setAdd("firstName", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                    placeholder={t("admin.partners.fields.firstNamePh")} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.lastName")} *</label>
                  <input value={addForm.lastName} onChange={(e) => setAdd("lastName", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                    placeholder={t("admin.partners.fields.lastNamePh")} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.email")} *</label>
                <input type="email" value={addForm.email} onChange={(e) => setAdd("email", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                  placeholder="partenaire@email.com" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.phone")} *</label>
                  <input value={addForm.phone} onChange={(e) => setAdd("phone", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                    placeholder="06XXXXXXXX" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.wilaya")} *</label>
                  <select value={addForm.wilayaCode} onChange={(e) => setAdd("wilayaCode", e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                    <option value="">{t("admin.partners.fields.wilayaPh")}</option>
                    {WILAYA_LIST.map((w) => <option key={w.code} value={w.code}>{w.code.replace("DZ", "")} — {w.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.address")} *</label>
                <input value={addForm.address} onChange={(e) => setAdd("address", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                  placeholder={t("admin.partners.fields.addressPh")} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.parcels")} *</label>
                <input value={addForm.parcelsPerMonth} onChange={(e) => setAdd("parcelsPerMonth", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                  placeholder="50-100" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.fields.passwordOpt")}</label>
                <input type="text" value={addForm.password} onChange={(e) => setAdd("password", e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                  placeholder={t("admin.partners.fields.passwordOptPh")} />
              </div>
              {isAdmin && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.statusLabel")}</label>
                    <select value={addForm.status} onChange={(e) => setAdd("status", e.target.value as PartnerStatus)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                      {(["pending", "reviewing", "approved", "rejected"] as const).map((s) => (
                        <option key={s} value={s}>{t(`admin.partners.statusOptions.${s}`)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.partners.notesLabel")}</label>
                    <textarea value={addForm.notes} onChange={(e) => setAdd("notes", e.target.value)} rows={2}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] resize-none"
                      placeholder={t("admin.partners.notesPh")} />
                  </div>
                </>
              )}
              {addError && <p className="text-sm text-red-600 font-medium">{addError}</p>}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.partners.cancel")}</button>
                <button onClick={addPartner} disabled={addSaving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                  {addSaving ? t("admin.partners.saving") : t("admin.partners.addPartner")}
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
      <div className="p-3 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
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
                  <input type="text" value={form.wilayaNumber} onChange={(e) => setForm((f) => ({ ...f, wilayaNumber: e.target.value }))}
                    placeholder="ex: 16 ou 48.1"
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

// ── Expediteurs view ───────────────────────────────────────────────────────────

function ExpediteursView({ onUnauth, lockedHub }: { onUnauth: () => void; lockedHub?: string }) {
  const { t } = useTranslation();
  const [list, setList]         = useState<ExpéditeurUser[]>([]);
  const [loading, setLoading]   = useState(true);
  const [offices, setOffices]   = useState<Office[]>([]);

  // add form
  const [showAdd, setShowAdd]   = useState(false);
  const [addUser, setAddUser]   = useState("");
  const [addPass, setAddPass]   = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addHub, setAddHub]     = useState(lockedHub ?? "");
  const [saving, setSaving]     = useState(false);
  const [formErr, setFormErr]   = useState("");

  // edit form
  const [showEdit, setShowEdit]   = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [editUser, setEditUser]   = useState("");
  const [editPass, setEditPass]   = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editHub, setEditHub]     = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr]     = useState("");

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/expediteurs`, { headers: adminHeaders() });
      if (r.status === 401) { onUnauth(); return; }
      const d = await r.json();
      if (d.ok) setList(d.expediteurs ?? []);
    } finally { setLoading(false); }
  }, [onUnauth]);

  const fetchOffices = useCallback(async () => {
    const r = await fetch(`${API_BASE}/api/admin/offices`, { headers: adminHeaders() });
    const d = await r.json();
    if (d.ok) setOffices(d.offices ?? []);
  }, []);

  useEffect(() => { fetchList(); fetchOffices(); }, [fetchList, fetchOffices]);

  async function createExpediteur() {
    if (!addUser.trim() || addPass.length < 8) { setFormErr(t("admin.expediteurs.formError")); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/expediteurs`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ username: addUser.trim(), password: addPass, phone: addPhone, email: addEmail, office_hub: addHub }),
      });
      if (r.status === 401) { onUnauth(); return; }
      const d = await r.json();
      if (d.ok) {
        setShowAdd(false); setAddUser(""); setAddPass(""); setAddPhone(""); setAddEmail(""); setAddHub(lockedHub ?? "");
        fetchList();
      } else setFormErr(d.error === "username_taken" ? t("admin.expediteurs.usernameTaken") : t("admin.expediteurs.saveError"));
    } finally { setSaving(false); }
  }

  function openEdit(e: ExpéditeurUser) {
    setEditId(e.id); setEditUser(e.username); setEditPass(""); setEditPhone(e.phone ?? "");
    setEditEmail(e.email ?? ""); setEditHub(e.office_hub ?? ""); setEditErr(""); setShowEdit(true);
  }

  async function updateExpediteur() {
    if (!editUser.trim()) { setEditErr(t("admin.expediteurs.formError")); return; }
    if (editPass && editPass.length < 8) { setEditErr(t("admin.expediteurs.formError")); return; }
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = { username: editUser.trim(), phone: editPhone, email: editEmail, office_hub: editHub };
      if (editPass) body.password = editPass;
      const r = await fetch(`${API_BASE}/api/admin/expediteurs/${editId}`, { method: "PUT", headers: adminHeaders(), body: JSON.stringify(body) });
      if (r.status === 401) { onUnauth(); return; }
      const d = await r.json();
      if (d.ok) { setShowEdit(false); fetchList(); }
      else setEditErr(d.error === "username_taken" ? t("admin.expediteurs.usernameTaken") : t("admin.expediteurs.saveError"));
    } finally { setEditSaving(false); }
  }

  async function deleteExp(e: ExpéditeurUser) {
    if (!confirm(t("admin.expediteurs.deleteConfirm"))) return;
    await fetch(`${API_BASE}/api/admin/expediteurs/${e.id}`, { method: "DELETE", headers: adminHeaders() });
    fetchList();
  }

  const hubOptions = offices.map(o => `${o.wilaya}${o.commune ? ` — ${o.commune}` : ""}`);
  const roleColor = ROLE_COLOR.expediteur;
  // Office agents only see expediteurs linked to their own hub
  const visibleList = lockedHub ? list.filter(e => e.office_hub === lockedHub) : list;

  return (
    <>
      <div className="p-3 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("admin.expediteurs.title")}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t("admin.expediteurs.subtitle")}</p>
          </div>
          <button onClick={() => { setFormErr(""); setShowAdd(true); }} className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {t("admin.expediteurs.add")}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {visibleList.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-12">{t("admin.expediteurs.empty")}</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {visibleList.map(e => (
                  <div key={e.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/70 group transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs shrink-0">
                        {e.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm text-gray-900">{e.username}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${roleColor}`}>
                            {t("admin.roles.expediteur")}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {[e.phone, e.email, e.office_hub].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-3">
                      <button onClick={() => openEdit(e)} className="px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100 transition-colors">
                        {t("admin.expediteurs.edit")}
                      </button>
                      {!lockedHub && (
                        <button onClick={() => deleteExp(e)} className="px-2.5 py-1.5 text-xs font-semibold text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">{t("admin.expediteurs.addTitle")}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.admins.fields.username")}</label>
                <input value={addUser} onChange={e => setAddUser(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder="username" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.admins.fields.password")}</label>
                <input type="password" value={addPass} onChange={e => setAddPass(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.expediteurs.fields.phone")}</label>
                <input value={addPhone} onChange={e => setAddPhone(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder="+213..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.expediteurs.fields.email")}</label>
                <input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder="email@..." />
              </div>
              {!lockedHub && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.expediteurs.fields.officeHub")}</label>
                  <select value={addHub} onChange={e => setAddHub(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600] bg-white">
                    <option value="">—</option>
                    {hubOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}
              {formErr && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{formErr}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAdd(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                {t("admin.expediteurs.cancel")}
              </button>
              <button onClick={createExpediteur} disabled={saving} className="px-4 py-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl transition-colors disabled:opacity-60">
                {saving ? t("admin.expediteurs.saving") : t("admin.expediteurs.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">{t("admin.expediteurs.editTitle")}</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.admins.fields.username")}</label>
                <input value={editUser} onChange={e => setEditUser(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder="username" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.admins.fields.newPassword")}</label>
                <input type="password" value={editPass} onChange={e => setEditPass(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder={t("admin.admins.fields.passwordHint")} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.expediteurs.fields.phone")}</label>
                <input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder="+213..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.expediteurs.fields.email")}</label>
                <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600]" placeholder="email@..." />
              </div>
              {!lockedHub && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">{t("admin.expediteurs.fields.officeHub")}</label>
                  <select value={editHub} onChange={e => setEditHub(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#E10600] bg-white">
                    <option value="">—</option>
                    {hubOptions.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              )}
              {editErr && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{editErr}</p>}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">
                {t("admin.expediteurs.cancel")}
              </button>
              <button onClick={updateExpediteur} disabled={editSaving} className="px-4 py-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl transition-colors disabled:opacity-60">
                {editSaving ? t("admin.expediteurs.saving") : t("admin.expediteurs.save")}
              </button>
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
  const [newHub, setNewHub] = useState("");
  const [newAllowedStatuses, setNewAllowedStatuses] = useState<PartnerStatus[]>(["pending", "reviewing", "approved", "rejected"]);
  const [newCanChangeStatus, setNewCanChangeStatus] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [offices, setOffices] = useState<Office[]>([]);

  // Edit state
  const [showEdit, setShowEdit] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editRole, setEditRole] = useState<AdminRole>("office");
  const [editHub, setEditHub] = useState("");
  const [editAllowedStatuses, setEditAllowedStatuses] = useState<PartnerStatus[]>(["pending", "reviewing", "approved", "rejected"]);
  const [editCanChangeStatus, setEditCanChangeStatus] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const fetchAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; admins: AdminUser[] };
      if (data.ok) setAdmins(data.admins);
    } finally { setLoading(false); }
  }, [onUnauth]);

  const fetchOffices = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/offices`, { headers: adminHeaders() });
      const data = await res.json();
      if (data.ok) setOffices(data.offices ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchAdmins(); fetchOffices(); }, [fetchAdmins, fetchOffices]);

  async function createAdmin() {
    if (!newUsername.trim() || newPassword.length < 8) { setFormError(t("admin.admins.formError")); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ username: newUsername.trim(), password: newPassword, role: newRole, office_hub: newRole === "office" ? newHub : "", ...(newRole === "commercial" ? { allowed_partner_statuses: newAllowedStatuses, can_change_partner_status: newCanChangeStatus } : {}) }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) { setShowAdd(false); setNewUsername(""); setNewPassword(""); setNewRole("office"); setNewHub(""); setNewAllowedStatuses(["pending", "reviewing", "approved", "rejected"]); setNewCanChangeStatus(false); fetchAdmins(); }
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

  function openEdit(a: AdminUser) {
    setEditId(a.id);
    setEditUsername(a.username);
    setEditPassword("");
    setEditRole(a.role as AdminRole);
    setEditHub(a.office_hub ?? "");
    try { setEditAllowedStatuses(a.allowed_partner_statuses ? JSON.parse(a.allowed_partner_statuses) : ["pending", "reviewing", "approved", "rejected"]); } catch { setEditAllowedStatuses(["pending", "reviewing", "approved", "rejected"]); }
    setEditCanChangeStatus(a.can_change_partner_status === 1);
    setEditError("");
    setShowEdit(true);
  }

  async function updateAdmin() {
    if (!editUsername.trim()) { setEditError(t("admin.admins.formError")); return; }
    if (editPassword && editPassword.length < 8) { setEditError(t("admin.admins.formError")); return; }
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = { username: editUsername.trim(), role: editRole, office_hub: editRole === "office" ? editHub : "", ...(editRole === "commercial" ? { allowed_partner_statuses: editAllowedStatuses, can_change_partner_status: editCanChangeStatus } : {}) };
      if (editPassword) body.password = editPassword;
      const res = await fetch(`${API_BASE}/api/admin/admins/${editId}`, {
        method: "PUT", headers: adminHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) { setShowEdit(false); fetchAdmins(); }
      else setEditError(data.error === "username_taken" ? t("admin.admins.usernameTaken") : t("admin.admins.saveError"));
    } finally { setEditSaving(false); }
  }

  return (
    <>
      <div className="p-3 sm:p-6 lg:p-8">
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
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
              {admins.filter((a) => a.role !== "expediteur").map((a) => (
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
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_COLOR[a.role as AdminRole]}`}>{t(`admin.roles.${a.role}`)}</span>
                      {a.role === "office" && a.office_hub && (
                        <span className="text-[10px] text-gray-400 font-medium">{a.office_hub}</span>
                      )}
                    </div>
                    <button onClick={() => openEdit(a)} className="text-gray-300 hover:text-blue-500 p-1.5 rounded-lg hover:bg-blue-50 transition-colors" title={t("admin.admins.edit")}>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
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
                    {(["admin", "office", "finance", "commercial", "ticket_manager", "suivi"] as const).map((r) => (
                      <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
                    ))}
                  </select>
                </div>
                {newRole === "office" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">Hub / Agence</label>
                    <select value={newHub} onChange={e => setNewHub(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                      <option value="">— Choisir un hub —</option>
                      {offices.map(o => (
                        <option key={o.id} value={`${o.wilaya}${o.commune ? " — " + o.commune : ""}`}>{o.wilaya}{o.commune ? " — " + o.commune : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                {newRole === "commercial" && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.admins.fields.allowedStatuses")}</label>
                      <p className="text-xs text-gray-400 mb-2">{t("admin.admins.fields.allowedStatusesHint")}</p>
                      <div className="flex flex-wrap gap-2">
                        {(["pending", "reviewing", "approved", "rejected"] as PartnerStatus[]).map(s => (
                          <label key={s} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={newAllowedStatuses.includes(s)}
                              onChange={e => setNewAllowedStatuses(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                              className="rounded accent-[#E10600]" />
                            <span className="text-sm text-gray-700">{t(`admin.partners.statusOptions.${s}`)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={newCanChangeStatus} onChange={e => setNewCanChangeStatus(e.target.checked)} className="rounded accent-[#E10600]" />
                      <span className="text-sm font-medium text-gray-700">{t("admin.admins.fields.canChangeStatus")}</span>
                    </label>
                  </>
                )}
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

      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowEdit(false)} />
          <div className="relative bg-white w-full max-w-sm rounded-2xl shadow-2xl mx-4 overflow-hidden">
            {/* Brand header bar */}
            <div className="bg-gradient-to-r from-[#E10600] to-[#B80500] px-6 pt-5 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base leading-tight">{t("admin.admins.editTitle")}</h3>
                    <p className="text-white/70 text-xs">{editUsername}</p>
                  </div>
                </div>
                <button onClick={() => setShowEdit(false)} className="text-white/70 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-xl leading-none">×</button>
              </div>
            </div>

            <div className="px-6 py-5">
              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {editError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{t("admin.admins.fields.username")}</label>
                  <input type="text" value={editUsername} onChange={(e) => setEditUsername(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{t("admin.admins.fields.newPassword")}</label>
                  <input type="password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)}
                    placeholder={t("admin.admins.fields.passwordHint")}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-colors" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{t("admin.admins.fields.role")}</label>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value as AdminRole)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white transition-colors">
                    {(["admin", "office", "finance", "commercial", "ticket_manager", "suivi"] as const).map((r) => (
                      <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>
                    ))}
                  </select>
                </div>
                {editRole === "office" && (
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">Hub / Agence</label>
                    <select value={editHub} onChange={e => setEditHub(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white transition-colors">
                      <option value="">— Choisir un hub —</option>
                      {offices.map(o => (
                        <option key={o.id} value={`${o.wilaya}${o.commune ? " — " + o.commune : ""}`}>{o.wilaya}{o.commune ? " — " + o.commune : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                {editRole === "commercial" && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">{t("admin.admins.fields.allowedStatuses")}</label>
                      <p className="text-xs text-gray-400 mb-2">{t("admin.admins.fields.allowedStatusesHint")}</p>
                      <div className="flex flex-wrap gap-2">
                        {(["pending", "reviewing", "approved", "rejected"] as PartnerStatus[]).map(s => (
                          <label key={s} className="flex items-center gap-1.5 cursor-pointer select-none">
                            <input type="checkbox" checked={editAllowedStatuses.includes(s)}
                              onChange={e => setEditAllowedStatuses(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                              className="rounded accent-[#E10600]" />
                            <span className="text-sm text-gray-700">{t(`admin.partners.statusOptions.${s}`)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                      <input type="checkbox" checked={editCanChangeStatus} onChange={e => setEditCanChangeStatus(e.target.checked)} className="rounded accent-[#E10600]" />
                      <span className="text-sm font-medium text-gray-700">{t("admin.admins.fields.canChangeStatus")}</span>
                    </label>
                  </>
                )}
              </div>
              <div className="flex gap-2.5 mt-6">
                <button onClick={() => setShowEdit(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors">{t("admin.admins.cancel")}</button>
                <button onClick={updateAdmin} disabled={editSaving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60 transition-all flex items-center justify-center gap-2">
                  {editSaving ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{t("admin.admins.saving")}</>
                  ) : t("admin.admins.save")}
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

function ChangePasswordModal({ onClose, role }: { onClose: () => void; role: string }) {
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
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem(role === "expediteur" ? "exp_token" : "admin_token") ?? ""}`, "Content-Type": "application/json" },
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

// ── Notification prompt banner ─────────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function NotificationBanner({ role }: { role: string }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState<boolean>(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;
    if (localStorage.getItem("push_enabled") === "1") return false;
    if (Notification.permission === "denied") return false;
    const dismissedAt = localStorage.getItem("notif_prompted_at");
    if (dismissedAt) {
      const ms = Date.now() - parseInt(dismissedAt, 10);
      if (ms < SEVEN_DAYS_MS) return false;
    }
    return true;
  });
  const [loading, setLoading] = useState(false);

  function dismiss() {
    localStorage.setItem("notif_prompted_at", String(Date.now()));
    setVisible(false);
  }

  async function handleEnable() {
    if (loading) return;
    if (Notification.permission === "denied") { dismiss(); return; }
    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { dismiss(); return; }
      const reg = await navigator.serviceWorker.ready;
      const _tok = localStorage.getItem(role === "expediteur" ? "exp_token" : "admin_token") ?? "";
      const vapidRes = await fetch(`${API_BASE}/api/push/vapid-public-key`, { headers: { Authorization: `Bearer ${_tok}`, "Content-Type": "application/json" } });
      const { key: vapidKey } = (await vapidRes.json()) as { key: string };
      if (!vapidKey) { dismiss(); return; }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${_tok}`, "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      localStorage.setItem("push_enabled", "1");
      localStorage.setItem("notif_prompted_at", String(Date.now()));
      setVisible(false);
    } catch (err) {
      console.error("NotificationBanner enable error:", err);
      dismiss();
    } finally {
      setLoading(false);
    }
  }

  if (!visible) return null;

  return (
    <div className="mx-4 mt-4 mb-0 md:mx-6 md:mt-5 flex items-start gap-3 bg-[#0F172A] text-white rounded-xl px-4 py-3 shadow-lg">
      {/* Bell icon */}
      <span className="mt-0.5 shrink-0 text-[#E10600]">
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6V11c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug">{t("admin.notifBanner.title")}</p>
        <p className="text-xs text-white/60 mt-0.5 leading-snug">{t("admin.notifBanner.desc")}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 mt-0.5">
        <button
          onClick={handleEnable}
          disabled={loading}
          className="text-xs font-bold bg-[#E10600] hover:bg-[#C50500] text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
        >
          {loading && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {t("admin.notifBanner.enable")}
        </button>
        <button
          onClick={dismiss}
          className="text-xs text-white/50 hover:text-white/80 px-2 py-1.5 rounded-lg transition-colors"
        >
          {t("admin.notifBanner.notNow")}
        </button>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [location, navigate] = useLocation();
  // Expediteur sessions use separate localStorage keys (exp_*) so admins can visit
  // /expediteurs and log in as an expediteur without touching their admin session.
  const isSuiviPath = location.startsWith("/suivi");
  const isExpediteurPath = location.startsWith("/expediteurs");
  const portal = isSuiviPath ? "suivi" : isExpediteurPath ? "expediteur" : "admin";
  const roleRaw = localStorage.getItem(isSuiviPath ? "suivi_role" : isExpediteurPath ? "exp_role" : "admin_role") ?? (isSuiviPath ? "suivi" : isExpediteurPath ? "expediteur" : "admin");
  const isTeam = localStorage.getItem(isExpediteurPath ? "exp_is_team" : "admin_is_team") === "1";
  const role = (roleRaw === "admin" && isTeam) ? "admin_team" : roleRaw as AdminRole;
  const username = localStorage.getItem(isSuiviPath ? "suivi_username" : isExpediteurPath ? "exp_username" : "admin_username") ?? "user";
  const teamPerms: string[] = isTeam ? (() => { try { return JSON.parse(localStorage.getItem(isExpediteurPath ? "exp_permissions" : "admin_permissions") ?? "[]"); } catch { return []; } })() : [];
  const effectiveTeamPerms = teamPerms.includes("ecotrack") && !teamPerms.includes("ecotrack-dashboard")
    ? ["ecotrack-dashboard", ...teamPerms]
    : teamPerms;

  // For team sub-accounts, restrict allowed sections to what the parent granted
  const EXPEDITEUR_SECTIONS: SidebarView[] = HOSTINGER_PUBLIC_BUILD
    ? ["queue", "payouts", "team"]
    : ["ecotrack-dashboard", "ecotrack", "ecotrack-desks", "ecotrack-fees", "ecotrack-products", "ecotrack-reports", "ecotrack-delays", "queue", "payouts", "team", "ecotrack-settings"];
  const EXPEDITEUR_TEAM_SECTIONS: SidebarView[] = HOSTINGER_PUBLIC_BUILD
    ? ["queue", "payouts", "team"]
    : ["ecotrack-dashboard", "ecotrack", "ecotrack-desks", "ecotrack-fees", "ecotrack-products", "ecotrack-reports", "ecotrack-delays", "queue", "payouts", "team"];
  const OFFICE_SECTIONS: SidebarView[] = ["office-dashboard", "queue", "returns", "merchants", "payouts", "messaging", "team", "analytics"];
  const allowedSections: SidebarView[] = (role === "expediteur" && isTeam)
    ? (teamPerms.length > 0
      ? EXPEDITEUR_TEAM_SECTIONS.filter(s => effectiveTeamPerms.includes(s))
      : EXPEDITEUR_TEAM_SECTIONS)
    : role === "office" && isTeam && teamPerms.length > 0
    ? OFFICE_SECTIONS.filter(s => teamPerms.includes(s))
    : role === "office" ? OFFICE_SECTIONS : EXPEDITEUR_SECTIONS;

  function expAllowed(section: SidebarView): boolean {
    return role !== "expediteur" || !isTeam || allowedSections.includes(section);
  }

  const defaultView: SidebarView = role === "finance" ? "charges"
    : role === "commercial" ? "partners"
    : role === "ticket_manager" ? "queue"
    : role === "suivi" ? "ecotrack-delays"
    : role === "admin_team"
      ? (teamPerms.includes("ecotrack") ? "ecotrack-delays" : (teamPerms[0] as SidebarView | undefined) ?? "queue")
    : role === "office" || role === "expediteur" ? (allowedSections[0] ?? "queue")
    : "dashboard";
  const viewStorageKey = `weasy:${isSuiviPath ? "suivi" : isExpediteurPath ? "expediteur" : "admin"}:${username}:dashboard-view`;
  const permittedViews = useMemo<SidebarView[]>(() => {
    if (role === "admin") return ["dashboard", "partners", "agent-applications", "offices", "admins", "performance", "ecotrack-delays", "ecotrack-delay-configuration", "charges", "commissions", "settings", "workers", "decharges", "queue", "returns", "expediteurs", "payouts", "messaging", "team", "analytics"];
    if (role === "office") return allowedSections;
    if (role === "finance") return ["charges", "commissions", "workers", "decharges"];
    if (role === "commercial") return ["partners"];
    if (role === "ticket_manager") return ["queue"];
    if (role === "suivi") return ["ecotrack-delays", "ecotrack-failures"];
    if (role === "admin_team") {
      const views = teamPerms
        .map((permission) => permission === "ecotrack" ? "ecotrack-delays" : permission)
        .filter((permission): permission is SidebarView =>
          ["ecotrack-delays", "expediteurs", "queue", "payouts", "team", "returns", "merchants", "messaging", "analytics"].includes(permission),
        );
      return views;
    }
    return allowedSections;
  }, [role, allowedSections, teamPerms]);

  const isPermitted = useCallback((v: string) => {
    if (role === "expediteur" && v === "profile") return true;
    if ((permittedViews as string[]).includes(v)) return true;
    if (v.startsWith("ecotrack-status-") && (permittedViews as string[]).includes("ecotrack")) return true;
    if (v === "ecotrack-history" && (permittedViews as string[]).includes("ecotrack")) return true;
    return false;
  }, [permittedViews, role]);

  const [view, setViewState] = useState<string>(() => {
    const saved = localStorage.getItem(viewStorageKey) as string | null;
    return saved && isPermitted(saved) ? saved : defaultView;
  });
  const setView = useCallback((next: string) => {
    const safe = isPermitted(next) ? next : defaultView;
    localStorage.setItem(viewStorageKey, safe);
    setViewState(safe);
  }, [defaultView, isPermitted, viewStorageKey]);
  useEffect(() => {
    if (window.location.pathname.includes("/payout-confirm/") && view !== "payouts") {
      setView("payouts");
      return;
    }
    const returnTo = localStorage.getItem("exp_return_to");
    if (returnTo && window.location.pathname === "/expediteurs") {
      localStorage.removeItem("exp_return_to");
      navigate(returnTo, { replace: true });
      return;
    }
    if (!isPermitted(view)) setView(defaultView);
  }, [view, isPermitted, defaultView, setView, navigate]);
  const [showChangePass, setShowChangePass] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return localStorage.getItem("admin_sidebar_collapsed") === "1";
  });
  const toggleCollapse = useCallback(() => {
    setIsCollapsed(prev => {
      const next = !prev;
      localStorage.setItem("admin_sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [partnersError, setPartnersError] = useState("");
  const [agentApplications, setAgentApplications] = useState<Array<{ id: number; status: PartnerStatus }>>([]);
  const [canChangePartnerStatus, setCanChangePartnerStatus] = useState(
    role === "commercial" && localStorage.getItem("admin_can_change_status") === "1"
  );

  const [offices, setOffices] = useState<Office[]>([]);
  const [officesLoading, setOfficesLoading] = useState(true);
  const [officesError, setOfficesError] = useState("");

  async function unauth() {
    // Unsubscribe from push BEFORE clearing the session.
    // We await it (with a 3-second safety timeout) so the fetch completes
    // before navigate() is called — fire-and-forget was getting aborted.
    const pushToken = isSuiviPath
      ? localStorage.getItem("suivi_token")
      : isExpediteurPath
      ? localStorage.getItem("exp_token")
      : localStorage.getItem("admin_token");

    if (role !== "suivi") {
      try {
        if ("serviceWorker" in navigator && "PushManager" in window && pushToken) {
          const reg = await navigator.serviceWorker.ready;
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await Promise.race([
              (async () => {
                await fetch(`${API_BASE}/api/push/unsubscribe`, {
                  method: "DELETE",
                  headers: { Authorization: `Bearer ${pushToken}`, "Content-Type": "application/json" },
                  body: JSON.stringify({ endpoint: sub.endpoint }),
                  keepalive: true,   // survives navigation
                });
                await sub.unsubscribe(); // revoke browser endpoint
              })(),
              new Promise<void>(resolve => setTimeout(resolve, 3000)), // never block logout > 3 s
            ]);
          }
        }
      } catch { /* never block logout on push errors */ }

      // Remember that push was on so we can re-subscribe after the next login.
      if (localStorage.getItem("push_enabled") === "1") {
        localStorage.setItem(
          isExpediteurPath ? "push_was_enabled_exp" : "push_was_enabled_admin",
          "1",
        );
      }
      localStorage.removeItem("push_enabled");
    }

    localStorage.removeItem(viewStorageKey);

    if (isSuiviPath) {
      localStorage.removeItem("suivi_token");
      localStorage.removeItem("suivi_role");
      localStorage.removeItem("suivi_username");
      navigate("/suivi/login");
    } else if (isExpediteurPath) {
      if (window.location.pathname.includes("/payout-confirm/")) {
        localStorage.setItem("exp_return_to", `${window.location.pathname}${window.location.search}`);
      }
      localStorage.removeItem("exp_token");
      localStorage.removeItem("exp_role");
      localStorage.removeItem("exp_username");
      localStorage.removeItem("exp_is_team");
      localStorage.removeItem("exp_permissions");
      navigate("/expediteurs/login");
    } else {
      localStorage.removeItem("admin_token");
      localStorage.removeItem("admin_role");
      localStorage.removeItem("admin_username");
      navigate("/admin/login");
    }
  }

  const fetchPartners = useCallback(async () => {
    setPartnersLoading(true); setPartnersError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/partners`, { headers: adminHeaders() });
      if (res.status === 401) { unauth(); return; }
      const data = (await res.json()) as { ok: boolean; partners: Partner[]; canChangePartnerStatus?: boolean };
      if (data.ok) {
        setPartners(data.partners);
        if (data.canChangePartnerStatus !== undefined) setCanChangePartnerStatus(data.canChangePartnerStatus);
      }
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

  const fetchAgentApplications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/agent-applications`, { headers: adminHeaders() });
      if (res.status === 401) { unauth(); return; }
      const data = (await res.json()) as { ok: boolean; applications?: Array<{ id: number; status: PartnerStatus }> };
      if (data.ok) setAgentApplications(data.applications ?? []);
    } catch { /* The dedicated view displays the load error. */ }
  }, []);

  useEffect(() => {
    // Each path checks its own separate token — admin and expediteur sessions are independent
    const token = localStorage.getItem(isSuiviPath ? "suivi_token" : isExpediteurPath ? "exp_token" : "admin_token");
    if (!token) {
      if (isExpediteurPath && window.location.pathname.includes("/payout-confirm/")) {
        localStorage.setItem("exp_return_to", `${window.location.pathname}${window.location.search}`);
      }
      navigate(isSuiviPath ? "/suivi/login" : isExpediteurPath ? "/expediteurs/login" : "/admin/login");
      return;
    }
    if (role === "admin") { fetchPartners(); fetchOffices(); fetchAgentApplications(); }
    else if (role === "commercial") { fetchPartners(); }
  }, [fetchPartners, fetchOffices, fetchAgentApplications, navigate, role, location, isSuiviPath, isExpediteurPath]);

  // Register service worker for push notifications
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {/* SW not critical */});
    }
  }, []);

  // Auto-resubscribe if the user had notifications on before they logged out.
  // The flag (push_was_enabled_exp / push_was_enabled_admin) is saved by unauth()
  // so it survives the session wipe, then we consume it silently here after login.
  useEffect(() => {
    const flagKey = isExpediteurPath ? "push_was_enabled_exp" : "push_was_enabled_admin";
    if (localStorage.getItem(flagKey) !== "1") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (!("Notification" in window) || Notification.permission !== "granted") {
      // Permission was revoked — forget the preference
      localStorage.removeItem(flagKey);
      return;
    }
    // Consume the flag immediately so retries don't stack
    localStorage.removeItem(flagKey);

    const tok = localStorage.getItem(isExpediteurPath ? "exp_token" : "admin_token") ?? "";
    if (!tok) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const vapidRes = await fetch(`${API_BASE}/api/push/vapid-public-key`, {
          headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        });
        const { key: vapidKey } = (await vapidRes.json()) as { key: string };
        if (!vapidKey) return;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        await fetch(`${API_BASE}/api/push/subscribe`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        localStorage.setItem("push_enabled", "1");
      } catch (err) {
        console.warn("Auto-resubscribe failed:", err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpediteurPath]);

  const isAdmin = role === "admin";

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="ltr">
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-[#0F172A] flex items-center px-4 shadow-lg">
        <button
          onClick={() => setSidebarOpen(true)}
          className="text-white/70 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-all"
          aria-label="Open menu"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <img src={logoWhitePath} alt="Weasy Express" className="h-7 w-auto object-contain ml-3" />
      </div>
      {/* Backdrop for mobile sidebar */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar
        view={view} setView={setView} role={role} username={username}
        onLogout={unauth} onChangePassword={() => setShowChangePass(true)}
        partnerCount={partners.filter((p) => p.status === "pending").length}
        agentApplicationCount={agentApplications.filter((application) => application.status === "pending").length}
        officeCount={offices.length}
        isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)}
        isCollapsed={isCollapsed} toggleCollapse={toggleCollapse} isPermitted={isPermitted}
      />
      <main className={`flex-1 min-h-screen overflow-y-auto pt-14 md:pt-0 transition-all duration-300 ${isCollapsed ? "md:ml-[72px]" : "md:ml-64"}`}>
        <NotificationBanner role={role} />
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400 text-sm">Chargement…</div>}>
          {role === "expediteur" ? (
            view === "profile" ? <ProfileView username={username} onChangePassword={() => setShowChangePass(true)} /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-dashboard" && EcotrackDashboardView ? <EcotrackDashboardView /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack" && EcotrackWorkspaceView ? <EcotrackWorkspaceView mode="commands" initialStatus="prete_a_expedier" onOpenSettings={() => setView("ecotrack-settings")} /> :
            !HOSTINGER_PUBLIC_BUILD && view.startsWith("ecotrack-status-") && EcotrackWorkspaceView ? <EcotrackWorkspaceView mode="commands" initialStatus={view.replace("ecotrack-status-", "")} onOpenSettings={() => setView("ecotrack-settings")} /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-history" && EcotrackWorkspaceView ? <EcotrackWorkspaceView mode="history" onOpenSettings={() => setView("ecotrack-settings")} /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-desks" && EcotrackWorkspaceView ? <EcotrackWorkspaceView mode="desks" onOpenSettings={() => setView("ecotrack-settings")} /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-fees" && EcotrackWorkspaceView ? <EcotrackWorkspaceView mode="fees" onOpenSettings={() => setView("ecotrack-settings")} /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-products" && EcotrackWorkspaceView ? <EcotrackWorkspaceView mode="products" onOpenSettings={() => setView("ecotrack-settings")} /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-reports" && EcotrackReportsView ? <EcotrackReportsView /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-delays" && EcotrackDelaysView ? <EcotrackDelaysView role="expediteur" /> :
            view === "payouts"    ? <PayoutsRequestView onUnauth={unauth} /> :
            view === "team"       ? <TeamView onUnauth={unauth} /> :
            view === "analytics"  ? <AnalyticsView onUnauth={unauth} /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-settings" && EcotrackSettingsView ? <EcotrackSettingsView /> :
            <QueueView />
          ) : role === "office" ? (
            view === "queue"     ? <QueueView /> :
            view === "returns"   ? <ComingSoonView section="returns" /> :
            view === "merchants" ? <ExpediteursView onUnauth={unauth} lockedHub={localStorage.getItem("admin_office_hub") ?? undefined} /> :
            view === "payouts"   ? <PayoutsRequestView onUnauth={unauth} /> :
            view === "messaging" ? <ComingSoonView section="messaging" /> :
            view === "team"         ? <TeamView onUnauth={unauth} /> :
            view === "analytics"    ? <AnalyticsView onUnauth={unauth} /> :
            <OfficeDashboardView onUnauth={unauth} isAdmin={false} />
          ) : role === "finance" ? (
            view === "commissions" ? <CommissionsView /> :
            view === "workers" ? <WorkersView /> :
            view === "decharges" ? <DechargesView /> :
            <ChargesView onUnauth={unauth} />
          ) : role === "ticket_manager" ? (
            <QueueView />
          ) : role === "suivi" ? (
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-delays" && EcotrackDelaysView ? <EcotrackDelaysView role="suivi" /> :
            !HOSTINGER_PUBLIC_BUILD && view === "ecotrack-failures" && EcotrackFailuresView ? <EcotrackFailuresView /> :
            <EmptyRoleView role={role} />
          ) : role === "commercial" ? (
            <PartnersView partners={partners} loading={partnersLoading} error={partnersError} onRefresh={fetchPartners} onUnauth={unauth} role={role} canChangeStatus={canChangePartnerStatus} />
          ) : (!isAdmin && role !== "admin_team") ? (
            <EmptyRoleView role={role} />
          ) : view === "dashboard" ? (
            <DashboardView onUnauth={unauth} onRefreshBadge={fetchPartners} />
          ) : view === "partners" ? (
            <PartnersView partners={partners} loading={partnersLoading} error={partnersError} onRefresh={fetchPartners} onUnauth={unauth} role={role} />
          ) : view === "agent-applications" ? (
            <AgentApplicationsView onUnauth={unauth} />
          ) : view === "offices" ? (
            <OfficesView offices={offices} loading={officesLoading} error={officesError} onRefresh={fetchOffices} onUnauth={unauth} />
          ) : view === "performance" ? (
            <PerformanceView onUnauth={unauth} />
          ) : view === "ecotrack-delays" && EcotrackDelaysView && !HOSTINGER_PUBLIC_BUILD ? (
            <EcotrackDelaysView role="admin" />
          ) : view === "ecotrack-delay-configuration" && EcotrackDelaysView && !HOSTINGER_PUBLIC_BUILD && isAdmin ? (
            <EcotrackDelaysView role="admin" section="configuration" />
          ) : view === "charges" ? (
            <ChargesView onUnauth={unauth} />
          ) : view === "commissions" ? (
            <CommissionsView />
          ) : view === "settings" ? (
            <SettingsView />
          ) : view === "workers" ? (
            <WorkersView />
          ) : view === "decharges" ? (
            <DechargesView />
          ) : view === "office-dashboard" ? (
            <OfficeDashboardView onUnauth={unauth} isAdmin={true} />
          ) : view === "queue" ? (
            <QueueView />
          ) : view === "returns" ? (
            <ComingSoonView section="returns" />
          ) : view === "merchants" ? (
            <ComingSoonView section="merchants" />
          ) : view === "payouts" ? (
            <PayoutsRequestView onUnauth={unauth} />
          ) : view === "messaging" ? (
            <ComingSoonView section="messaging" />
          ) : view === "team" ? (
            <TeamView onUnauth={unauth} />
          ) : view === "analytics" ? (
            <AnalyticsView onUnauth={unauth} />
          ) : view === "expediteurs" ? (
            <ExpediteursView onUnauth={unauth} />
          ) : (
            <AdminsView currentUsername={username} onUnauth={unauth} />
          )}
        </Suspense>
      </main>
      {showChangePass && <ChangePasswordModal onClose={() => setShowChangePass(false)} role={role} />}
    </div>
  );
}
