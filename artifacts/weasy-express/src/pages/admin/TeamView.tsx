import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

interface TeamAccount {
  id: number;
  username: string;
  role: string;
  permissions: string | null;
  createdAt: string;
  parent_username?: string;
}

// All possible section keys for the admin dashboard sidebar
const ALL_SECTIONS_BY_ROLE: Record<string, { key: string; label: string }[]> = {
  expediteur: [
    { key: "queue",   label: "Queue" },
    { key: "payouts", label: "Payouts" },
    { key: "team",    label: "Team" },
  ],
  office: [
    { key: "office-dashboard", label: "Dashboard" },
    { key: "expediteurs",      label: "Expediteurs" },
    { key: "queue",            label: "Queue" },
    { key: "payouts",          label: "Payouts" },
    { key: "team",             label: "Team" },
    { key: "returns",          label: "Returns" },
    { key: "merchants",        label: "Merchants" },
    { key: "messaging",        label: "Messaging" },
    { key: "analytics",        label: "Analytics" },
  ],
  admin: [
    { key: "queue",   label: "Queue" },
    { key: "payouts", label: "Payouts" },
    { key: "team",    label: "Team" },
  ],
};

function parsePerm(raw: string | null): string[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

export default function TeamView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();
  const role = localStorage.getItem("admin_role") ?? "expediteur";

  const [accounts, setAccounts] = useState<TeamAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // create form
  const [showAdd, setShowAdd]             = useState(false);
  const [newUser, setNewUser]             = useState("");
  const [newPass, setNewPass]             = useState("");
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [formError, setFormError]         = useState("");
  const [saving, setSaving]               = useState(false);

  // edit form
  const [editTarget, setEditTarget]           = useState<TeamAccount | null>(null);
  const [editPass, setEditPass]               = useState("");
  const [editPerms, setEditPerms]             = useState<string[]>([]);
  const [editError, setEditError]             = useState("");
  const [editSaving, setEditSaving]           = useState(false);

  const availSections = ALL_SECTIONS_BY_ROLE[role] ?? ALL_SECTIONS_BY_ROLE.expediteur;

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/team`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) setAccounts(data.accounts);
    } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  function togglePerm(key: string) {
    setSelectedPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function toggleEditPerm(key: string) {
    setEditPerms((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function openEdit(a: TeamAccount) {
    setEditTarget(a);
    setEditPerms(parsePerm(a.permissions));
    setEditPass("");
    setEditError("");
  }

  async function createAccount() {
    if (!newUser.trim() || newPass.length < 8) { setFormError(t("admin.team.formError")); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/team`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ username: newUser.trim(), password: newPass, permissions: selectedPerms }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) {
        setShowAdd(false); setNewUser(""); setNewPass(""); setSelectedPerms([]);
        fetchAccounts();
      } else {
        setFormError(data.error === "username_taken" ? t("admin.team.usernameTaken") : t("admin.team.saveError"));
      }
    } finally { setSaving(false); }
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (editPass && editPass.length < 8) { setEditError(t("admin.team.formError")); return; }
    setEditSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/team/${editTarget.id}`, {
        method: "PUT", headers: adminHeaders(),
        body: JSON.stringify({ password: editPass || undefined, permissions: editPerms }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) {
        setEditTarget(null);
        fetchAccounts();
      } else {
        setEditError(data.error === "password_too_short" ? t("admin.team.formError") : t("admin.team.saveError"));
      }
    } finally { setEditSaving(false); }
  }

  async function removeAccount(id: number) {
    if (!confirm(t("admin.team.confirmDelete"))) return;
    const res = await fetch(`${API_BASE}/api/admin/team/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchAccounts();
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.team.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.team.subtitle")}</p>
        </div>
        <button
          onClick={() => { setFormError(""); setShowAdd(true); }}
          className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          {t("admin.team.add")}
        </button>
      </div>

      {/* Create modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">{t("admin.team.addTitle")}</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.team.fields.username")}</label>
                  <input
                    type="text" value={newUser} onChange={(e) => setNewUser(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30"
                    placeholder="username"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.team.fields.password")}</label>
                  <input
                    type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30"
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.team.fields.permissions")}</label>
                  <p className="text-xs text-gray-400 mb-2">{t("admin.team.fields.permissionsHint")}</p>
                  <div className="space-y-2">
                    {availSections.map((sec) => (
                      <label key={sec.key} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedPerms.includes(sec.key)}
                          onChange={() => togglePerm(sec.key)}
                          className="w-4 h-4 accent-[#E10600] rounded"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">{sec.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {formError && <p className="text-xs text-red-600 font-medium">{formError}</p>}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setShowAdd(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.team.cancel")}</button>
                <button onClick={createAccount} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60">
                  {saving ? "…" : t("admin.team.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">{t("admin.team.editTitle") || "Modifier le compte"}</h2>
              <p className="text-xs text-gray-400 mb-4 font-mono">{editTarget.username}</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    {t("admin.team.fields.newPassword") || "Nouveau mot de passe"}
                    <span className="ml-1 font-normal text-gray-400">({t("admin.team.optional") || "optionnel"})</span>
                  </label>
                  <input
                    type="password" value={editPass} onChange={(e) => setEditPass(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30"
                    placeholder="Laisser vide pour conserver"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.team.fields.permissions")}</label>
                  <div className="space-y-2">
                    {availSections.map((sec) => (
                      <label key={sec.key} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={editPerms.includes(sec.key)}
                          onChange={() => toggleEditPerm(sec.key)}
                          className="w-4 h-4 accent-[#E10600] rounded"
                        />
                        <span className="text-sm text-gray-700 group-hover:text-gray-900">{sec.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                {editError && <p className="text-xs text-red-600 font-medium">{editError}</p>}
              </div>
              <div className="flex gap-3 mt-5">
                <button onClick={() => setEditTarget(null)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.team.cancel")}</button>
                <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60">
                  {editSaving ? "…" : t("admin.team.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Accounts list */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
          <p className="text-sm font-medium">{t("admin.team.empty")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {accounts.map((a, i) => {
            const perms = parsePerm(a.permissions);
            return (
              <div key={a.id} className={`flex items-center gap-4 px-4 py-3 ${i > 0 ? "border-t border-gray-50" : ""}`}>
                <div className="w-9 h-9 rounded-full bg-[#E10600]/10 flex items-center justify-center shrink-0">
                  <span className="text-[#E10600] text-sm font-bold uppercase">{a.username[0]}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{a.username}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {perms.length > 0 ? perms.join(", ") : t("admin.team.noPerms")}
                  </p>
                  {a.parent_username && (
                    <p className="text-xs text-gray-400">{t("admin.team.parent")}: {a.parent_username}</p>
                  )}
                </div>
                {/* Edit */}
                <button
                  onClick={() => openEdit(a)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                  title={t("admin.team.edit") || "Modifier"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                {/* Delete */}
                <button
                  onClick={() => removeAccount(a.id)}
                  className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title={t("admin.team.delete")}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
