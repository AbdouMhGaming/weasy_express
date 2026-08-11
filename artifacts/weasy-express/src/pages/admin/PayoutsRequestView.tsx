import { useState, useEffect, useCallback } from "react";
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

const STATUS_STYLES: Record<PayoutStatus, string> = {
  pending:  "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  refused:  "bg-red-100 text-red-800",
  delayed:  "bg-orange-100 text-orange-800",
  paid:     "bg-green-100 text-green-800",
};

const today = new Date().toISOString().split("T")[0];

export default function PayoutsRequestView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();
  const role     = localStorage.getItem("admin_role") ?? "expediteur";
  const username = localStorage.getItem("admin_username") ?? "";

  const [payouts, setPayouts] = useState<PayoutRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PayoutStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Create form (expediteur only)
  const [showCreate, setShowCreate]   = useState(false);
  const [amount, setAmount]           = useState("");
  const [reqDate, setReqDate]         = useState(today);
  const [notes, setNotes]             = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating]       = useState(false);

  // Status update form (office/admin)
  const [updateId, setUpdateId]     = useState<number | null>(null);
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

  const filtered = filterStatus === "all" ? payouts : payouts.filter((p) => p.status === filterStatus);
  const selected = selectedId != null ? payouts.find((p) => p.id === selectedId) : null;

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
      if (data.ok) { setUpdateId(null); setAdminNotes(""); fetchPayouts(); }
    } finally { setUpdating(false); }
  }

  const canUpdate = role === "admin" || role === "office";
  const canCreate = role === "expediteur";

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      {/* Header */}
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {t("admin.payoutsRequest.newRequest")}
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-5">
        {(["all", "pending", "accepted", "refused", "delayed", "paid"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filterStatus === s ? "bg-[#E10600] text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
            }`}
          >
            {s === "all" ? t("admin.payoutsRequest.statusAll") : t(`admin.payoutsRequest.status.${s}`)}
          </button>
        ))}
      </div>

      {/* Create form modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t("admin.payoutsRequest.newRequest")}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.amount")}</label>
                  <input
                    type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30"
                    placeholder="0 DZD"
                  />
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
                <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.payoutsRequest.cancel")}</button>
                <button onClick={createPayout} disabled={creating} className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60">
                  {creating ? "…" : t("admin.payoutsRequest.send")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status update modal */}
      {updateId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t("admin.payoutsRequest.updateStatus")}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.status")}</label>
                  <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as PayoutStatus)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30">
                    {(["accepted", "refused", "delayed", "paid"] as PayoutStatus[]).map((s) => (
                      <option key={s} value={s}>{t(`admin.payoutsRequest.status.${s}`)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.payoutsRequest.fields.adminNotes")}</label>
                  <textarea
                    value={adminNotes} onChange={(e) => setAdminNotes(e.target.value)} rows={3}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setUpdateId(null)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.payoutsRequest.cancel")}</button>
                <button onClick={updateStatus} disabled={updating} className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60">
                  {updating ? "…" : t("admin.payoutsRequest.confirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          <p className="text-sm font-medium">{t("admin.payoutsRequest.empty")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  {(role === "admin" || role === "office") && (
                    <p className="text-xs text-gray-500 mb-1">{t("admin.payoutsRequest.from")}: <span className="font-semibold text-gray-700">{p.expediteur_username}</span></p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-lg font-bold text-gray-900">{p.amount_dzd.toLocaleString()} DZD</p>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[p.status]}`}>
                      {t(`admin.payoutsRequest.status.${p.status}`)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {t("admin.payoutsRequest.requestedFor")}: <span className="font-medium">{p.requested_date}</span>
                    {" · "}
                    {t("admin.payoutsRequest.hub")}: <span className="font-medium">{p.office_hub}</span>
                  </p>
                  {p.expediteur_notes && <p className="text-xs text-gray-600 mt-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">{p.expediteur_notes}</p>}
                  {p.admin_notes && <p className="text-xs text-blue-700 mt-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5">{p.admin_notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canUpdate && p.status !== "paid" && (
                    <button
                      onClick={() => { setUpdateId(p.id); setNewStatus("accepted"); setAdminNotes(p.admin_notes ?? ""); }}
                      className="text-xs font-semibold text-[#E10600] hover:bg-red-50 px-3 py-1.5 rounded-lg border border-[#E10600]/30 transition-colors"
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
