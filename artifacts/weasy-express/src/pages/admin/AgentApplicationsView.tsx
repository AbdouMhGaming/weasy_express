import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

type AgentStatus = "pending" | "reviewing" | "approved" | "rejected";

export interface AgentApplication {
  id: number;
  fullName: string;
  wilayaCode: string;
  wilayaName: string;
  commune: string;
  phone: string;
  email: string;
  previousExperience: number;
  experienceYears: number | null;
  hasCommercialSpace: number;
  startAvailability: string;
  status: AgentStatus;
  notes: string | null;
  createdAt: string;
}

export default function AgentApplicationsView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();
  const [applications, setApplications] = useState<AgentApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<AgentStatus | "all">("all");
  const [selected, setSelected] = useState<AgentApplication | null>(null);
  const [editStatus, setEditStatus] = useState<AgentStatus>("pending");
  const [editNotes, setEditNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE}/api/admin/agent-applications`, { headers: adminHeaders() });
      if (response.status === 401) { onUnauth(); return; }
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error("load_failed");
      setApplications(data.applications ?? []);
    } catch {
      setError("Unable to load agent requests.");
    } finally {
      setLoading(false);
    }
  }, [onUnauth]);

  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  const counts = useMemo(() => ({
    pending: applications.filter((item) => item.status === "pending").length,
    reviewing: applications.filter((item) => item.status === "reviewing").length,
    approved: applications.filter((item) => item.status === "approved").length,
    rejected: applications.filter((item) => item.status === "rejected").length,
  }), [applications]);
  const visible = filter === "all" ? applications : applications.filter((item) => item.status === filter);

  const open = (application: AgentApplication) => {
    setSelected(application);
    setEditStatus(application.status);
    setEditNotes(application.notes ?? "");
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/agent-applications/${selected.id}`, {
        method: "PATCH",
        headers: adminHeaders(),
        body: JSON.stringify({ status: editStatus, notes: editNotes }),
      });
      if (response.status === 401) { onUnauth(); return; }
      if (!response.ok) throw new Error("save_failed");
      setSelected(null);
      await fetchApplications();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm(t("admin.agentApplications.deleteConfirm"))) return;
    const response = await fetch(`${API_BASE}/api/admin/agent-applications/${id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    if (response.status === 401) { onUnauth(); return; }
    if (response.ok) {
      setSelected((current) => current?.id === id ? null : current);
      await fetchApplications();
    }
  };

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.agentApplications.title")}</h1>
          <p className="text-sm text-gray-500 mt-1">{t("admin.agentApplications.subtitle")}</p>
        </div>
        <button onClick={fetchApplications} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
          <span className={loading ? "animate-spin" : ""}>↻</span>{t("admin.agentApplications.refresh")}
        </button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {(["pending", "reviewing", "approved", "rejected"] as const).map((status) => (
          <button key={status} onClick={() => setFilter(filter === status ? "all" : status)}
            className={`bg-white rounded-2xl border p-4 text-left shadow-sm hover:shadow-md transition-all ${filter === status ? "border-[#E10600] ring-1 ring-[#E10600]" : "border-gray-100"}`}>
            <p className="text-3xl font-bold text-gray-900">{counts[status]}</p>
            <p className="text-xs text-gray-500 mt-1">{t(`admin.agentApplications.status.${status}`)}</p>
          </button>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 text-sm text-gray-500">
          {visible.length} {t("admin.agentApplications.title").toLowerCase()}
        </div>
        {loading ? (
          <div className="py-20 text-center text-gray-400 text-sm">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center text-gray-400 text-sm">{t("admin.agentApplications.noData")}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {visible.map((application) => (
              <div key={application.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#E10600] to-[#B80500] flex items-center justify-center shrink-0 text-xs font-bold text-white">
                    {application.fullName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm truncate">{application.fullName}</p>
                    <p className="text-xs text-gray-400 truncate">{application.email} · {application.wilayaName}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`hidden sm:inline-flex text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass(application.status)}`}>
                    {t(`admin.agentApplications.status.${application.status}`)}
                  </span>
                  <button onClick={() => open(application)} className="text-xs text-[#E10600] font-semibold bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg">
                    {t("admin.agentApplications.details")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{selected.fullName}</h3>
                <p className="text-xs text-gray-500">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-2xl">×</button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Detail label={t("admin.agentApplications.fields.wilaya")} value={`${selected.wilayaName} (${selected.wilayaCode.replace("DZ", "")})`} />
                <Detail label={t("admin.agentApplications.fields.commune")} value={selected.commune} />
                <Detail label={t("admin.agentApplications.fields.phone")} value={selected.phone} />
                <Detail label={t("admin.agentApplications.fields.experience")} value={selected.previousExperience ? t("agent.yes") : t("agent.no")} />
                <Detail label={t("admin.agentApplications.fields.years")} value={selected.previousExperience ? `${selected.experienceYears ?? 0}` : "—"} />
                <Detail label={t("admin.agentApplications.fields.commercialSpace")} value={selected.hasCommercialSpace ? t("agent.yes") : t("agent.no")} />
                <Detail label={t("admin.agentApplications.fields.availability")} value={availabilityLabel(selected.startAvailability, t)} />
                <Detail label={t("admin.agentApplications.fields.date")} value={new Date(selected.createdAt).toLocaleDateString()} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.agentApplications.statusLabel")}</label>
                <select value={editStatus} onChange={(event) => setEditStatus(event.target.value as AgentStatus)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white">
                  {(["pending", "reviewing", "approved", "rejected"] as const).map((status) => <option key={status} value={status}>{t(`admin.agentApplications.statusOptions.${status}`)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.agentApplications.notesLabel")}</label>
                <textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} placeholder={t("admin.agentApplications.notesPlaceholder")} rows={4} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#E10600]/20" />
              </div>
              <div className="flex justify-between gap-2">
                <button onClick={() => remove(selected.id)} className="text-sm font-semibold text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg">{t("admin.agentApplications.delete")}</button>
                <div className="flex gap-2">
                  <button onClick={() => setSelected(null)} className="text-sm font-medium text-gray-600 px-3 py-2">{t("admin.agentApplications.cancel")}</button>
                  <button onClick={save} disabled={saving} className="text-sm font-bold bg-[#E10600] text-white px-4 py-2 rounded-lg disabled:opacity-60">{saving ? t("admin.agentApplications.saving") : t("admin.agentApplications.save")}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-semibold text-gray-500 mb-1">{label}</p><p className="text-sm text-gray-900 break-words">{value}</p></div>;
}

function statusClass(status: AgentStatus) {
  return { pending: "bg-amber-100 text-amber-800", reviewing: "bg-blue-100 text-blue-800", approved: "bg-emerald-100 text-emerald-800", rejected: "bg-red-100 text-red-800" }[status];
}

function availabilityLabel(value: string, t: (key: string) => string) {
  return value === "immediately" ? t("agent.start.immediately") : value === "after_week" ? t("agent.start.afterWeek") : t("agent.start.afterMonth");
}