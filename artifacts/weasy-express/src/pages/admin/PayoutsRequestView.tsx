import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

type PayoutStatus = "pending" | "accepted" | "refused" | "delayed" | "paid";

interface PayoutRequest {
  id: number;
  expediteur_username: string;
  office_hub: string;
  amount_dzd: number;
  requested_date: string;
  status: PayoutStatus;
  expediteur_notes: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLES: Record<PayoutStatus, { pill: string; dot: string }> = {
  pending:  { pill: "bg-amber-50 text-amber-700 ring-amber-200",   dot: "bg-amber-400" },
  accepted: { pill: "bg-blue-50 text-blue-700 ring-blue-200",      dot: "bg-blue-400" },
  refused:  { pill: "bg-red-50 text-red-700 ring-red-200",         dot: "bg-red-400" },
  delayed:  { pill: "bg-orange-50 text-orange-700 ring-orange-200",dot: "bg-orange-400" },
  paid:     { pill: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-400" },
};

const PAGE_SIZES = [20, 50, 100] as const;

const today = new Date().toISOString().split("T")[0];

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusPill({ status, label }: { status: PayoutStatus; label: string }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function PayoutsRequestView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();
  const role     = localStorage.getItem("admin_role") ?? "expediteur";

  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PayoutStatus | "all">("all");

  // Pagination
  const [pageSize, setPageSize] = useState<20 | 50 | 100>(20);
  const [page, setPage]         = useState(1);

  // Create form (expediteur only)
  const [showCreate, setShowCreate]   = useState(false);
  const [amount, setAmount]           = useState("");
  const [reqDate, setReqDate]         = useState(today);
  const [notes, setNotes]             = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating]       = useState(false);

  // Status update modal (office/admin)
  const [updateId, setUpdateId]     = useState<number | null>(null);
  const [updateTarget, setUpdateTarget] = useState<PayoutRequest | null>(null);
  const [newStatus, setNewStatus]   = useState<PayoutStatus>("accepted");
  const [adminNotes, setAdminNotes] = useState("");
  const [updating, setUpdating]     = useState(false);

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/expediteur/payouts`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) setPayouts(data.payouts);
    } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [filterStatus, pageSize]);

  const filtered = useMemo(
    () => filterStatus === "all" ? payouts : payouts.filter((p) => p.status === filterStatus),
    [payouts, filterStatus]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged      = filtered.slice((page - 1) * pageSize, page * pageSize);

  // Status counts for filter bar
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: payouts.length };
    payouts.forEach(p => { m[p.status] = (m[p.status] ?? 0) + 1; });
    return m;
  }, [payouts]);

  // Total amount of filtered set
  const totalAmount = useMemo(() => filtered.reduce((s, p) => s + p.amount_dzd, 0), [filtered]);

  async function createPayout() {
    const amt = parseInt(amount, 10);
    if (!amt || amt <= 0 || !reqDate) { setCreateError(t("admin.payoutsRequest.formError")); return; }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/expediteur/payouts`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ amount_dzd: amt, requested_date: reqDate, expediteur_notes: notes }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) { setShowCreate(false); setAmount(""); setNotes(""); setReqDate(today); fetchPayouts(); }
      else setCreateError(data.error === "no_office_linked" ? t("admin.payoutsRequest.noOffice") : t("admin.payoutsRequest.saveError"));
    } finally { setCreating(false); }
  }

  async function deletePayout(id: number) {
    if (!confirm("Supprimer ce virement ? Cette action est irréversible.")) return;
    try {
      await fetch(`${API_BASE}/api/expediteur/payouts/${id}`, { method: "DELETE", headers: adminHeaders() });
      fetchPayouts();
    } catch { }
  }

  async function updateStatus() {
    if (!updateId) return;
    setUpdating(true);
    try {
      const res = await fetch(`${API_BASE}/api/expediteur/payouts/${updateId}`, {
        method: "PUT", headers: adminHeaders(),
        body: JSON.stringify({ status: newStatus, admin_notes: adminNotes }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) { setUpdateId(null); setUpdateTarget(null); setAdminNotes(""); fetchPayouts(); }
    } finally { setUpdating(false); }
  }

  function openUpdate(p: PayoutRequest) {
    setUpdateId(p.id);
    setUpdateTarget(p);
    setNewStatus("accepted");
    setAdminNotes(p.admin_notes ?? "");
  }

  const canUpdate = role === "admin" || role === "office";
  const canCreate = role === "expediteur";

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-6xl mx-auto">

      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.payoutsRequest.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {role === "admin" ? t("admin.payoutsRequest.subtitleAdmin") :
             role === "office" ? t("admin.payoutsRequest.subtitleOffice") :
             t("admin.payoutsRequest.subtitleExpediteur")}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => { setCreateError(""); setShowCreate(true); }}
            className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            {t("admin.payoutsRequest.newRequest")}
          </button>
        )}
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(["all", "pending", "accepted", "refused", "delayed", "paid"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === s
                ? "bg-[#E10600] text-white shadow-sm"
                : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {s === "all" ? t("admin.payoutsRequest.statusAll") : t(`admin.payoutsRequest.status.${s}`)}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              filterStatus === s ? "bg-white/25 text-white" : "bg-gray-100 text-gray-500"
            }`}>
              {counts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* ── Create form modal ── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl bg-[#E10600]/10 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[#E10600]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-gray-900">{t("admin.payoutsRequest.newRequest")}</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.amount")}</label>
                  <div className="relative">
                    <input
                      type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30"
                      placeholder="0"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">DZD</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.date")}</label>
                  <input
                    type="date" value={reqDate} onChange={(e) => setReqDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.notes")}</label>
                  <textarea
                    value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 resize-none"
                    placeholder={t("admin.payoutsRequest.fields.notesPlaceholder")}
                  />
                </div>
                {createError && <p className="text-xs text-red-600 font-medium">{createError}</p>}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                  {t("admin.payoutsRequest.cancel")}
                </button>
                <button onClick={createPayout} disabled={creating} className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60 flex items-center justify-center gap-2">
                  {creating ? <><Spinner />{" "}…</> : t("admin.payoutsRequest.send")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Status update modal ── */}
      {updateId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">{t("admin.payoutsRequest.updateStatus")}</h2>
                  {updateTarget && (
                    <p className="text-xs text-gray-500">
                      {updateTarget.expediteur_username} · {updateTarget.amount_dzd.toLocaleString()} DZD
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4 mt-5">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.status")}</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["accepted", "refused", "delayed", "paid"] as PayoutStatus[]).map((s) => (
                      <button
                        key={s}
                        onClick={() => setNewStatus(s)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          newStatus === s
                            ? "border-[#E10600] bg-[#E10600]/5 text-[#E10600]"
                            : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${STATUS_STYLES[s].dot}`} />
                        {t(`admin.payoutsRequest.status.${s}`)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.adminNotes")}</label>
                  <textarea
                    value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 resize-none"
                    placeholder="Note optionnelle…"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setUpdateId(null); setUpdateTarget(null); }}
                  className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50"
                >
                  {t("admin.payoutsRequest.cancel")}
                </button>
                <button
                  onClick={updateStatus} disabled={updating}
                  className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {updating ? <><Spinner />{" "}…</> : t("admin.payoutsRequest.confirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24 gap-2 text-gray-400 text-sm">
          <Spinner /> Chargement…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-gray-400">
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <p className="text-sm font-medium">{t("admin.payoutsRequest.empty")}</p>
        </div>
      ) : (
        <>
          {/* Summary bar */}
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <p className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{filtered.length}</span> demande{filtered.length !== 1 ? "s" : ""}
              {filterStatus !== "all" && (
                <> · Total : <span className="font-semibold text-gray-700">{totalAmount.toLocaleString()} DZD</span></>
              )}
            </p>

            {/* Page size picker */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Afficher :</span>
              {PAGE_SIZES.map(n => (
                <button
                  key={n}
                  onClick={() => setPageSize(n)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    pageSize === n
                      ? "bg-gray-900 text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/70">
                  {(role === "admin" || role === "office") && (
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Expéditeur</th>
                  )}
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Montant</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Statut</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Hub</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Date demandée</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Créé le</th>
                  <th className="px-5 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paged.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors group">
                    {(role === "admin" || role === "office") && (
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                            {p.expediteur_username.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-800 text-sm">{p.expediteur_username}</span>
                        </div>
                      </td>
                    )}
                    <td className="px-5 py-3.5">
                      <span className="text-base font-bold text-gray-900">{p.amount_dzd.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-1">DZD</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="space-y-1">
                        <StatusPill status={p.status} label={t(`admin.payoutsRequest.status.${p.status}`)} />
                        {p.admin_notes && (
                          <p className="text-[11px] text-gray-400 max-w-[180px] truncate">{p.admin_notes}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-600">{p.office_hub}</td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 whitespace-nowrap">{fmtDate(p.requested_date)}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-400 whitespace-nowrap">{fmtDate(p.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        {canUpdate && p.status !== "paid" && (
                          <button
                            onClick={() => openUpdate(p)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-[#E10600] hover:bg-red-50 rounded-lg border border-[#E10600]/20 transition-colors"
                          >
                            {t("admin.payoutsRequest.action")}
                          </button>
                        )}
                        {role === "admin" && (
                          <button
                            onClick={() => deletePayout(p.id)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Supprimer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Note row */}
            {paged.some(p => p.expediteur_notes) && (
              <div className="border-t border-gray-50 px-5 py-3 space-y-1.5">
                {paged.filter(p => p.expediteur_notes).map(p => (
                  <p key={p.id} className="text-xs text-gray-500">
                    <span className="font-semibold text-gray-600">{p.expediteur_username}</span>
                    {" : "}{p.expediteur_notes}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {paged.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {(role === "admin" || role === "office") && (
                        <p className="text-xs font-semibold text-gray-500 mb-1.5">{p.expediteur_username}</p>
                      )}
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="text-xl font-bold text-gray-900">{p.amount_dzd.toLocaleString()} <span className="text-sm font-medium text-gray-400">DZD</span></span>
                        <StatusPill status={p.status} label={t(`admin.payoutsRequest.status.${p.status}`)} />
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                        <p className="text-xs text-gray-400">📍 {p.office_hub}</p>
                        <p className="text-xs text-gray-400">📅 {fmtDate(p.requested_date)}</p>
                        <p className="text-xs text-gray-400">🕐 {fmtDate(p.created_at)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {canUpdate && p.status !== "paid" && (
                        <button
                          onClick={() => openUpdate(p)}
                          className="text-xs font-semibold text-[#E10600] hover:bg-red-50 px-2.5 py-1.5 rounded-lg border border-[#E10600]/20 transition-colors"
                        >
                          {t("admin.payoutsRequest.action")}
                        </button>
                      )}
                      {role === "admin" && (
                        <button
                          onClick={() => deletePayout(p.id)}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Supprimer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                  {p.expediteur_notes && (
                    <p className="text-xs text-gray-600 mt-2.5 bg-gray-50 rounded-lg px-2.5 py-1.5">{p.expediteur_notes}</p>
                  )}
                  {p.admin_notes && (
                    <p className="text-xs text-blue-700 mt-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5">{p.admin_notes}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-5 flex-wrap gap-3">
              <p className="text-xs text-gray-400">
                Page {page} / {totalPages} · {filtered.length} résultats
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  «
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  ‹ Préc.
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce<(number | "…")[]>((acc, n, i, arr) => {
                    if (i > 0 && n - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, i) =>
                    item === "…"
                      ? <span key={`e${i}`} className="px-1 text-xs text-gray-400">…</span>
                      : (
                        <button
                          key={item}
                          onClick={() => setPage(item as number)}
                          className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
                            page === item
                              ? "bg-gray-900 text-white"
                              : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          {item}
                        </button>
                      )
                  )
                }
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  Suiv. ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="px-2 py-1.5 rounded-lg text-xs font-semibold text-gray-500 border border-gray-200 disabled:opacity-40 hover:bg-gray-50 transition-colors"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
