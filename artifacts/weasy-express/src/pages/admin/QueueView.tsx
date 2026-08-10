import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";
import { usePagination, PaginationBar } from "@/components/Pagination";

// ── Types ──────────────────────────────────────────────────────────────────

interface Ticket {
  id: number;
  ticket_ref: string;
  destination_type: "merchant" | "central_team" | "pickup_desk";
  recipient_username: string | null;
  support_service: string | null;
  reason: string;
  custom_reason: string | null;
  comment: string | null;
  parcel_numbers: string | null;
  status: string;
  handled_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AdminUser { id: number; username: string; office_hub: string | null; }

// ── Constants ──────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { dot: string; badge: string }> = {
  open:           { dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-700 border-blue-200" },
  claimed:        { dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  in_progress:    { dot: "bg-amber-500",  badge: "bg-amber-50 text-amber-700 border-amber-200" },
  resolved:       { dot: "bg-green-500",  badge: "bg-green-50 text-green-700 border-green-200" },
  pending_close:  { dot: "bg-orange-400", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  pending_accept: { dot: "bg-orange-400", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  closed:         { dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-500 border-gray-200" },
};

const DEST_CFG = {
  merchant:     { icon: "🏪", color: "bg-blue-50 text-blue-600" },
  central_team: { icon: "🎯", color: "bg-purple-50 text-purple-600" },
  pickup_desk:  { icon: "🏢", color: "bg-green-50 text-green-600" },
};

const AVATAR_COLORS = [
  "bg-red-500","bg-blue-500","bg-green-500","bg-purple-500",
  "bg-amber-500","bg-pink-500","bg-indigo-500","bg-teal-500",
];

const STATUS_TABS = ["all","open","claimed","in_progress","resolved","pending_close","pending_accept","closed"] as const;
const DIRECTION_TABS = ["all","incoming","outgoing"] as const;

const DEFAULT_FORM = {
  destination: "merchant" as "merchant"|"central_team"|"pickup_desk",
  recipientUsername: "",
  supportService: "",
  reason: "",
  customReason: "",
  comment: "",
  parcels: [""],
  multiParcel: false,
};

// ── Mini helpers ───────────────────────────────────────────────────────────

function avatarColor(s: string) { return AVATAR_COLORS[s.charCodeAt(0) % AVATAR_COLORS.length]; }
function initials(s: string) { return s.substring(0, 2).toUpperCase(); }
function fmtDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-DZ", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.open;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border whitespace-nowrap ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
      {t(`admin.queue.status.${status}`, { defaultValue: status })}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function QueueView() {
  const { t } = useTranslation();
  const role  = localStorage.getItem("admin_role") ?? "";
  const username = localStorage.getItem("admin_username") ?? "";
  const isAdmin = role === "admin";

  // data
  const [tickets, setTickets]               = useState<Ticket[]>([]);
  const [loading, setLoading]               = useState(true);
  const [commercialUsers, setCommercialUsers] = useState<AdminUser[]>([]);
  const [officeUsers, setOfficeUsers]       = useState<AdminUser[]>([]);
  const [ticketReasons, setTicketReasons]   = useState<string[]>([]);
  const [supportServices, setSupportServices] = useState<string[]>([]);

  // filters
  const [statusFilter, setStatusFilter]     = useState("all");
  const [dirFilter, setDirFilter]           = useState("all");
  const [search, setSearch]                 = useState("");

  // new‑ticket modal
  const [showNew, setShowNew]               = useState(false);
  const [form, setForm]                     = useState({ ...DEFAULT_FORM });
  const [submitting, setSubmitting]         = useState(false);
  const [submitError, setSubmitError]       = useState("");
  const [submitSuccess, setSubmitSuccess]   = useState("");

  // detail panel
  const [selected, setSelected]             = useState<Ticket | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/tickets`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setTickets(d.tickets ?? []);
    } catch { } finally { setLoading(false); }
  }, []);

  const fetchMeta = useCallback(async () => {
    try {
      const [cu, ou, tr, ss] = await Promise.all([
        fetch(`${API_BASE}/api/admin/users/commercial`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/users/office`,     { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/settings/ticket_reasons`,   { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/settings/support_services`, { headers: adminHeaders() }),
      ]);
      const [cd, od, td, sd] = await Promise.all([cu.json(), ou.json(), tr.json(), ss.json()]);
      if (cd.ok) setCommercialUsers(cd.users ?? []);
      if (od.ok) setOfficeUsers(od.users ?? []);
      if (td.ok && td.value) try { setTicketReasons(JSON.parse(td.value)); } catch { setTicketReasons([]); }
      if (sd.ok && sd.value) try { setSupportServices(JSON.parse(sd.value)); } catch { setSupportServices([]); }
    } catch { }
  }, []);

  useEffect(() => { fetchTickets(); fetchMeta(); }, [fetchTickets, fetchMeta]);

  // ── Filter ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => tickets.filter(tk => {
    if (statusFilter !== "all" && tk.status !== statusFilter) return false;
    if (isAdmin) {
      if (dirFilter === "incoming" && tk.created_by === username) return false;
      if (dirFilter === "outgoing" && tk.created_by !== username) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      if (
        !tk.ticket_ref.toLowerCase().includes(q) &&
        !tk.reason.toLowerCase().includes(q) &&
        !(tk.recipient_username?.toLowerCase().includes(q)) &&
        !(tk.created_by.toLowerCase().includes(q)) &&
        !(tk.comment?.toLowerCase().includes(q))
      ) return false;
    }
    return true;
  }), [tickets, statusFilter, dirFilter, search, isAdmin, username]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: tickets.length };
    tickets.forEach(tk => { m[tk.status] = (m[tk.status] ?? 0) + 1; });
    if (isAdmin) {
      m.incoming = tickets.filter(tk => tk.created_by !== username).length;
      m.outgoing = tickets.filter(tk => tk.created_by === username).length;
    }
    return m;
  }, [tickets, isAdmin, username]);

  // ── Actions ────────────────────────────────────────────────────────────

  async function submitTicket() {
    if (!form.reason) { setSubmitError(t("admin.queue.newModal.reasonRequired")); return; }
    if (form.destination !== "central_team" && !form.recipientUsername)
      { setSubmitError(t("admin.queue.newModal.recipientRequired")); return; }
    if (form.destination === "central_team" && !form.supportService)
      { setSubmitError(t("admin.queue.newModal.serviceRequired")); return; }

    const parcels = form.multiParcel
      ? form.parcels.filter(p => p.trim())
      : form.parcels[0]?.trim() ? [form.parcels[0]] : [];

    setSubmitting(true); setSubmitError(""); setSubmitSuccess("");
    try {
      const r = await fetch(`${API_BASE}/api/tickets`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({
          destination_type:    form.destination,
          recipient_username:  form.recipientUsername || null,
          support_service:     form.supportService || null,
          reason:              form.reason === "other" ? (form.customReason || "other") : form.reason,
          custom_reason:       form.reason === "other" ? form.customReason : null,
          comment:             form.comment || null,
          parcel_numbers:      parcels,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setSubmitSuccess(`${t("admin.queue.newModal.success")} ${d.ref}`);
        setTimeout(() => {
          setShowNew(false);
          setForm({ ...DEFAULT_FORM });
          setSubmitSuccess("");
          fetchTickets();
        }, 1400);
      } else setSubmitError(d.error ?? t("admin.queue.newModal.error"));
    } catch { setSubmitError(t("admin.queue.newModal.error")); } finally { setSubmitting(false); }
  }

  async function updateStatus(ticket: Ticket, status: string) {
    setUpdatingStatus(true);
    try {
      await fetch(`${API_BASE}/api/tickets/${ticket.id}/status`, {
        method: "PUT", headers: adminHeaders(),
        body: JSON.stringify({ status }),
      });
      setSelected(prev => prev ? { ...prev, status } : null);
      fetchTickets();
    } finally { setUpdatingStatus(false); }
  }

  async function claimTicket(ticket: Ticket, e?: React.MouseEvent) {
    e?.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/tickets/${ticket.id}/claim`, {
        method: "PUT", headers: adminHeaders(),
      });
      setSelected(prev => prev ? { ...prev, status: "claimed", handled_by: username } : null);
      fetchTickets();
    } catch { }
  }

  const pag = usePagination(filtered, 20);

  // ── Render ─────────────────────────────────────────────────────────────

  const filterTabCls = (active: boolean) =>
    `flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
      active ? "bg-[#E10600] text-white shadow-sm" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
    }`;

  const countBadge = (key: string, active: boolean) =>
    counts[key] > 0 ? (
      <span className={`text-[10px] px-1.5 rounded-full font-bold ${active ? "bg-white/25 text-white" : "bg-gray-200 text-gray-500"}`}>
        {counts[key]}
      </span>
    ) : null;

  return (
    <div className="p-6 lg:p-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.queue.title")}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{t("admin.queue.subtitle")}</p>
        </div>
        {isAdmin && (
          <button
            onClick={() => { setShowNew(true); setForm({ ...DEFAULT_FORM }); setSubmitError(""); setSubmitSuccess(""); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#E10600] hover:bg-[#C50500] text-white text-sm font-bold rounded-xl shadow-sm transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t("admin.queue.newTicket")}
          </button>
        )}
      </div>

      {/* ── Direction filter (admin) ── */}
      {isAdmin && (
        <div className="flex items-center gap-1 mb-3 flex-wrap">
          {DIRECTION_TABS.map(d => (
            <button key={d} onClick={() => setDirFilter(d)} className={filterTabCls(dirFilter === d)}>
              {t(`admin.queue.filters.${d}`)}
              {countBadge(d, dirFilter === d)}
            </button>
          ))}
        </div>
      )}

      {/* ── Status filter ── */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {STATUS_TABS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={filterTabCls(statusFilter === s)}>
            {t(`admin.queue.filters.${s === "all" ? "all" : s}`, { defaultValue: s })}
            {countBadge(s, statusFilter === s)}
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t("admin.queue.search")}
          className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white"
        />
      </div>

      {/* ── Ticket table ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24 gap-2 text-gray-400 text-sm">
            <Spinner />{t("admin.queue.loading")}
          </div>
        ) : pag.paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <svg className="w-12 h-12 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 10h16M4 14h10M4 18h10" />
            </svg>
            <p className="text-gray-400 text-sm">{t("admin.queue.noTickets")}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    {["ticket","status","reason","destination","createdAt","updatedAt"].map(col => (
                      <th key={col} className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {t(`admin.queue.cols.${col}`)}
                      </th>
                    ))}
                    <th className="px-4 py-3 w-24" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pag.paged.map(tk => {
                    const dest = DEST_CFG[tk.destination_type] ?? DEST_CFG.merchant;
                    return (
                      <tr
                        key={tk.id}
                        onClick={() => setSelected(tk)}
                        className="hover:bg-gray-50/70 cursor-pointer transition-colors"
                      >
                        {/* Ticket */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${avatarColor(tk.created_by)}`}>
                              {initials(tk.created_by)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 text-sm font-mono">{tk.ticket_ref}</p>
                              <p className="text-xs text-gray-400 truncate max-w-[180px]">
                                {tk.created_by}
                                {tk.comment ? ` · ${tk.comment.slice(0, 35)}${tk.comment.length > 35 ? "…" : ""}` : ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3"><StatusBadge status={tk.status} /></td>
                        {/* Reason */}
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-700 max-w-[160px] truncate block">{tk.custom_reason || tk.reason}</span>
                        </td>
                        {/* Destination */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${dest.color}`}>{dest.icon}</span>
                            <span className="text-sm text-gray-600 font-medium max-w-[120px] truncate">
                              {tk.destination_type === "central_team"
                                ? (tk.support_service ?? t("admin.queue.newModal.centralTeam"))
                                : (tk.recipient_username ?? "—")}
                            </span>
                          </div>
                        </td>
                        {/* Created at */}
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(tk.created_at)}</td>
                        {/* Updated at */}
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fmtDate(tk.updated_at)}</td>
                        {/* Claim */}
                        <td className="px-4 py-3 text-right">
                          {tk.status === "open" && (
                            <button
                              onClick={e => claimTicket(tk, e)}
                              className="px-3 py-1.5 bg-[#E10600] hover:bg-[#C50500] text-white text-xs font-bold rounded-lg transition-all"
                            >
                              {t("admin.queue.claim")}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-gray-50">
              {pag.paged.map(tk => {
                const dest = DEST_CFG[tk.destination_type] ?? DEST_CFG.merchant;
                return (
                  <div key={tk.id} onClick={() => setSelected(tk)} className="p-4 hover:bg-gray-50/70 cursor-pointer transition-colors">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-white text-[11px] font-bold shrink-0 ${avatarColor(tk.created_by)}`}>
                        {initials(tk.created_by)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p className="font-bold text-gray-900 text-sm font-mono">{tk.ticket_ref}</p>
                          <StatusBadge status={tk.status} />
                        </div>
                        <p className="text-xs text-gray-600 mb-0.5">{tk.custom_reason || tk.reason}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-400">
                          <span className={`w-4 h-4 rounded flex items-center justify-center text-xs ${dest.color}`}>{dest.icon}</span>
                          <span>{tk.recipient_username ?? tk.support_service ?? "—"}</span>
                          <span>·</span>
                          <span>{fmtDate(tk.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <PaginationBar {...pag} />
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          NEW TICKET MODAL (right‑side panel)
      ══════════════════════════════════════════════ */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowNew(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col z-10" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-5 flex items-center justify-between bg-gradient-to-r from-[#0F172A] to-[#1E293B] shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#E10600] flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-base font-bold text-white">{t("admin.queue.newModal.title")}</h2>
              </div>
              <button onClick={() => setShowNew(false)} className="text-white/50 hover:text-white transition-colors p-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Destination tabs */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">
                  {t("admin.queue.newModal.destination")}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "merchant",     icon: "🏪", label: t("admin.queue.newModal.merchant") },
                    { key: "central_team", icon: "🎯", label: t("admin.queue.newModal.centralTeam") },
                    { key: "pickup_desk",  icon: "🏢", label: t("admin.queue.newModal.pickupDesk") },
                  ].map(dest => (
                    <button
                      key={dest.key} type="button"
                      onClick={() => setForm(f => ({ ...f, destination: dest.key as any, recipientUsername: "", supportService: "" }))}
                      className={`flex flex-col items-center gap-1.5 p-3.5 rounded-xl border-2 text-xs font-semibold transition-all ${
                        form.destination === dest.key
                          ? "border-[#E10600] bg-[#E10600]/5 text-[#E10600]"
                          : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <span className="text-2xl">{dest.icon}</span>
                      <span className="text-center leading-tight">{dest.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Merchant select */}
              {form.destination === "merchant" && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    {t("admin.queue.newModal.merchant")}
                  </label>
                  <select
                    value={form.recipientUsername}
                    onChange={e => setForm(f => ({ ...f, recipientUsername: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white"
                  >
                    <option value="">{t("admin.queue.newModal.selectMerchant")}</option>
                    {commercialUsers.map(u => (
                      <option key={u.id} value={u.username}>
                        {u.username}{u.office_hub ? ` (${u.office_hub})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Office agent select */}
              {form.destination === "pickup_desk" && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    {t("admin.queue.newModal.pickupDesk")}
                  </label>
                  <select
                    value={form.recipientUsername}
                    onChange={e => setForm(f => ({ ...f, recipientUsername: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white"
                  >
                    <option value="">{t("admin.queue.newModal.selectOffice")}</option>
                    {officeUsers.map(u => (
                      <option key={u.id} value={u.username}>
                        {u.username}{u.office_hub ? ` (${u.office_hub})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Support service select */}
              {form.destination === "central_team" && (
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                    {t("admin.queue.newModal.supportService")}
                  </label>
                  {supportServices.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                      {t("admin.queue.newModal.noServices")}
                    </p>
                  ) : (
                    <select
                      value={form.supportService}
                      onChange={e => setForm(f => ({ ...f, supportService: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white"
                    >
                      <option value="">{t("admin.queue.newModal.selectSupportService")}</option>
                      {supportServices.map((s, i) => <option key={i} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Ticket reason */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  {t("admin.queue.newModal.ticketReason")}
                </label>
                {ticketReasons.length === 0 ? (
                  <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
                    {t("admin.queue.newModal.noReasons")}
                  </p>
                ) : (
                  <select
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value, customReason: "" }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] bg-white"
                  >
                    <option value="">{t("admin.queue.newModal.selectReason")}</option>
                    {ticketReasons.map((r, i) => <option key={i} value={r}>{r}</option>)}
                    <option value="other">{t("admin.queue.newModal.other")}</option>
                  </select>
                )}
                {form.reason === "other" && (
                  <input
                    type="text" value={form.customReason}
                    onChange={e => setForm(f => ({ ...f, customReason: e.target.value }))}
                    placeholder={t("admin.queue.newModal.otherReasonPh")}
                    className="mt-2 w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                  />
                )}
              </div>

              {/* Comment */}
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  {t("admin.queue.newModal.comment")}
                </label>
                <textarea
                  value={form.comment}
                  onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                  placeholder={t("admin.queue.newModal.commentPh")}
                  rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] resize-none"
                />
              </div>

              {/* Parcel numbers */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide">
                    {t("admin.queue.newModal.parcelNumber")}
                  </label>
                  <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
                    <input
                      type="checkbox" checked={form.multiParcel}
                      onChange={e => setForm(f => ({ ...f, multiParcel: e.target.checked }))}
                      className="rounded accent-[#E10600]"
                    />
                    {t("admin.queue.newModal.multiParcel")}
                  </label>
                </div>

                {!form.multiParcel ? (
                  <input
                    type="text" value={form.parcels[0]}
                    onChange={e => setForm(f => ({ ...f, parcels: [e.target.value] }))}
                    placeholder={t("admin.queue.newModal.parcelNumberPh")}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                  />
                ) : (
                  <div className="space-y-2">
                    {form.parcels.map((p, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text" value={p}
                          onChange={e => {
                            const next = [...form.parcels];
                            next[idx] = e.target.value;
                            setForm(f => ({ ...f, parcels: next }));
                          }}
                          placeholder={t("admin.queue.newModal.parcelNumberPh")}
                          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                        />
                        {form.parcels.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, parcels: f.parcels.filter((_, i) => i !== idx) }))}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, parcels: [...f.parcels, ""] }))}
                      className="flex items-center gap-1.5 text-xs font-semibold text-[#E10600] hover:text-[#C50500] transition-colors mt-1"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                      </svg>
                      {t("admin.queue.newModal.addParcel")}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Feedback */}
            {submitError && (
              <div className="px-6 py-3 bg-red-50 border-t border-red-100 text-xs text-red-600 shrink-0">{submitError}</div>
            )}
            {submitSuccess && (
              <div className="px-6 py-3 bg-green-50 border-t border-green-100 text-xs text-green-700 font-semibold shrink-0">{submitSuccess}</div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
              <button
                onClick={() => setShowNew(false)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-xl transition-all"
              >
                {t("admin.queue.newModal.cancel")}
              </button>
              <button
                onClick={submitTicket} disabled={submitting}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#E10600] hover:bg-[#C50500] text-white text-sm font-bold rounded-xl shadow-sm disabled:opacity-60 transition-all"
              >
                {submitting && <Spinner />}
                {submitting ? t("admin.queue.newModal.submitting") : t("admin.queue.newModal.submit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          TICKET DETAIL PANEL
      ══════════════════════════════════════════════ */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col z-10" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="px-6 py-5 flex items-start justify-between bg-gradient-to-r from-[#0F172A] to-[#1E293B] shrink-0">
              <div>
                <p className="text-white/40 text-xs font-mono mb-1">{selected.ticket_ref}</p>
                <h2 className="text-base font-bold text-white">{t("admin.queue.detail.title")}</h2>
                <div className="mt-2"><StatusBadge status={selected.status} /></div>
              </div>
              <button onClick={() => setSelected(null)} className="text-white/50 hover:text-white transition-colors p-1 mt-0.5">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: t("admin.queue.detail.destination"),
                    value: selected.destination_type === "central_team"
                      ? (selected.support_service ?? t("admin.queue.newModal.centralTeam"))
                      : (selected.recipient_username ?? "—"),
                    icon: DEST_CFG[selected.destination_type]?.icon },
                  { label: t("admin.queue.detail.createdBy"), value: selected.created_by },
                  { label: t("admin.queue.detail.createdAt"), value: fmtDate(selected.created_at) },
                  { label: t("admin.queue.detail.handledBy"),
                    value: selected.handled_by ?? t("admin.queue.detail.unassigned") },
                ].map((item, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                      {item.icon && <span>{item.icon}</span>}
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* Reason */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-bold text-gray-400 mb-1.5">{t("admin.queue.detail.reason")}</p>
                <p className="text-sm font-semibold text-gray-800">{selected.custom_reason || selected.reason}</p>
              </div>

              {/* Comment */}
              {selected.comment && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-400 mb-1.5">{t("admin.queue.detail.comment")}</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{selected.comment}</p>
                </div>
              )}

              {/* Parcels */}
              {selected.parcel_numbers && (() => {
                try {
                  const parsed: string[] = JSON.parse(selected.parcel_numbers);
                  if (!Array.isArray(parsed) || parsed.length === 0) return null;
                  return (
                    <div className="bg-gray-50 rounded-xl p-4">
                      <p className="text-xs font-bold text-gray-400 mb-2">{t("admin.queue.detail.parcels")}</p>
                      <div className="flex flex-wrap gap-2">
                        {parsed.map((p, i) => (
                          <span key={i} className="font-mono text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1 text-gray-700">{p}</span>
                        ))}
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}

              {/* Status actions */}
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">{t("admin.queue.detail.changeStatus")}</p>
                <div className="flex flex-wrap gap-2">
                  {selected.status === "open" && (
                    <button
                      onClick={() => claimTicket(selected)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 border border-purple-200 text-purple-700 text-xs font-bold rounded-xl hover:bg-purple-100 transition-all"
                    >
                      {t("admin.queue.detail.claim")}
                    </button>
                  )}
                  {["open","claimed"].includes(selected.status) && (
                    <button
                      onClick={() => updateStatus(selected, "in_progress")} disabled={updatingStatus}
                      className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-all disabled:opacity-50"
                    >
                      {t("admin.queue.detail.markInProgress")}
                    </button>
                  )}
                  {["open","claimed","in_progress"].includes(selected.status) && (
                    <button
                      onClick={() => updateStatus(selected, "resolved")} disabled={updatingStatus}
                      className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-xl hover:bg-green-100 transition-all disabled:opacity-50"
                    >
                      {t("admin.queue.detail.markResolved")}
                    </button>
                  )}
                  {["open","claimed","in_progress","resolved"].includes(selected.status) && (
                    <button
                      onClick={() => updateStatus(selected, "pending_close")} disabled={updatingStatus}
                      className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-bold rounded-xl hover:bg-orange-100 transition-all disabled:opacity-50"
                    >
                      {t("admin.queue.filters.pending_close")}
                    </button>
                  )}
                  {selected.status !== "closed" && (
                    <button
                      onClick={() => updateStatus(selected, "closed")} disabled={updatingStatus}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border border-gray-200 text-gray-500 text-xs font-bold rounded-xl hover:bg-gray-200 transition-all disabled:opacity-50"
                    >
                      {t("admin.queue.detail.markClosed")}
                    </button>
                  )}
                  {updatingStatus && <Spinner />}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
