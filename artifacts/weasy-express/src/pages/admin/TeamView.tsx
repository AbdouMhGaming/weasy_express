import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamAccount {
  id: number;
  username: string;
  role: string;
  permissions: string | null;
  createdAt: string;
  parent_username?: string;
  parent_role?: string;
  parent_hub?: string;
}

interface ParentUser {
  id: number;
  username: string;
  role: string;
  office_hub: string | null;
}

// ── Section definitions per role ───────────────────────────────────────────────

const SECTIONS_BY_ROLE: Record<string, { key: string; label: string }[]> = {
  expediteur: [
    { key: "queue",   label: "Queue" },
    { key: "payouts", label: "Payouts" },
    { key: "team",    label: "Team" },
    { key: "analytics", label: "Analytics" },
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
};

function parsePerm(raw: string | null): string[] {
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

const inputCls =
  "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] transition-all";

// ── Role badge ─────────────────────────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const cfg: Record<string, string> = {
    office:      "bg-blue-50 text-blue-700 border-blue-100",
    expediteur:  "bg-violet-50 text-violet-700 border-violet-100",
    admin:       "bg-gray-50 text-gray-700 border-gray-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide ${cfg[role] ?? cfg.admin}`}>
      {role}
    </span>
  );
}

// ── Permissions checklist ──────────────────────────────────────────────────────

function PermChecklist({
  sections, selected, onChange,
}: {
  sections: { key: string; label: string }[];
  selected: string[];
  onChange: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{t("admin.team.fields.permissions")}</label>
      <p className="text-xs text-gray-400 mb-2">{t("admin.team.fields.permissionsHint")}</p>
      {sections.length === 0 ? (
        <p className="text-xs text-gray-400 italic">—</p>
      ) : (
        <div className="space-y-2 bg-gray-50 rounded-xl p-3">
          {sections.map((sec) => (
            <label key={sec.key} className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={selected.includes(sec.key)}
                onChange={() => onChange(sec.key)}
                className="w-4 h-4 accent-[#E10600] rounded"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">{sec.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Modal wrapper ──────────────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children, footer }: {
  title: string; subtitle?: string; onClose: () => void;
  children: React.ReactNode; footer: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-gray-50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 font-mono">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">{children}</div>
        {/* Footer */}
        <div className="px-6 pb-6 pt-3 border-t border-gray-50 flex gap-3">{footer}</div>
      </div>
    </div>
  );
}

// ── Add modal ──────────────────────────────────────────────────────────────────

function AddModal({
  isAdmin, myRole, allParents, onClose, onCreated, onUnauth,
}: {
  isAdmin: boolean;
  myRole: string;
  allParents: ParentUser[];
  onClose: () => void;
  onCreated: () => void;
  onUnauth: () => void;
}) {
  const { t } = useTranslation();

  // Admin-only: type selection
  const [linkType, setLinkType] = useState<"office" | "expediteur" | "">("");
  const [parentUsername, setParentUsername] = useState("");

  const [username, setUsername]   = useState("");
  const [password, setPassword]   = useState("");
  const [perms, setPerms]         = useState<string[]>([]);
  const [error, setError]         = useState("");
  const [saving, setSaving]       = useState(false);

  // Determine which role/sections to show for permissions
  const effectiveRole = isAdmin
    ? (linkType || "office")
    : myRole;
  const sections = SECTIONS_BY_ROLE[effectiveRole] ?? [];

  // Reset parent selection & perms when linkType changes
  function handleLinkType(t: "office" | "expediteur") {
    setLinkType(t);
    setParentUsername("");
    setPerms([]);
  }

  const filteredParents = useMemo(
    () => allParents.filter(p => p.role === linkType),
    [allParents, linkType]
  );

  // Auto-select if only one parent
  useEffect(() => {
    if (filteredParents.length === 1 && !parentUsername) {
      setParentUsername(filteredParents[0].username);
    }
  }, [filteredParents, parentUsername]);

  function togglePerm(key: string) {
    setPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function submit() {
    if (!username.trim() || password.length < 8) { setError(t("admin.team.formError")); return; }
    if (isAdmin && !parentUsername) { setError(t("admin.team.parentRequired")); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        username: username.trim(), password, permissions: perms,
      };
      if (isAdmin) body.parent_username = parentUsername;

      const res = await fetch(`${API_BASE}/api/admin/team`, {
        method: "POST", headers: adminHeaders(), body: JSON.stringify(body),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) { onCreated(); }
      else if (data.error === "username_taken")    setError(t("admin.team.usernameTaken"));
      else if (data.error === "parent_required")   setError(t("admin.team.parentRequired"));
      else if (data.error === "parent_not_found")  setError(t("admin.team.parentNotFound"));
      else setError(t("admin.team.saveError"));
    } finally { setSaving(false); }
  }

  // Selected parent info (for hint)
  const selectedParent = allParents.find(p => p.username === parentUsername);

  return (
    <Modal
      title={t("admin.team.addTitle")}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
            {t("admin.team.cancel")}
          </button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60">
            {saving ? "…" : t("admin.team.save")}
          </button>
        </>
      }
    >
      {/* Step 1 (admin only): pick type */}
      {isAdmin && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-2">{t("admin.team.linkType")}</label>
          <div className="grid grid-cols-2 gap-2">
            {(["office", "expediteur"] as const).map(type => (
              <button
                key={type}
                onClick={() => handleLinkType(type)}
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border-2 text-sm font-semibold text-left transition-all ${
                  linkType === type
                    ? "border-[#E10600] bg-[#E10600]/5 text-[#E10600]"
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {type === "office" ? (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                )}
                <div>
                  <p>{type === "office" ? t("admin.team.linkOffice") : t("admin.team.linkExpediteur")}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 (admin only): pick specific parent */}
      {isAdmin && linkType && (
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            {linkType === "office" ? t("admin.team.linkOffice") : t("admin.team.linkExpediteur")}
          </label>
          {filteredParents.length === 0 ? (
            <p className="text-sm text-gray-400 italic py-2">{t("admin.analytics.empty")}</p>
          ) : (
            <select value={parentUsername} onChange={e => setParentUsername(e.target.value)} className={inputCls}>
              <option value="">{t("admin.team.selectParent")}</option>
              {filteredParents.map(p => (
                <option key={p.username} value={p.username}>
                  {p.username}{p.office_hub ? ` — ${p.office_hub}` : ""}
                </option>
              ))}
            </select>
          )}
          {selectedParent?.office_hub && (
            <p className="text-xs text-gray-400 mt-1">
              🏢 Hub: <span className="font-semibold text-gray-600">{selectedParent.office_hub}</span>
            </p>
          )}
        </div>
      )}

      {/* Step 3: username + password */}
      {(!isAdmin || (linkType && parentUsername)) && (
        <>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.team.fields.username")}</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)}
              className={inputCls} placeholder="username" autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.team.fields.password")}</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className={inputCls} placeholder="Min. 8 characters" autoComplete="new-password"
            />
          </div>
          <PermChecklist sections={sections} selected={perms} onChange={togglePerm} />
        </>
      )}

      {error && <p className="text-xs text-red-600 font-medium bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
    </Modal>
  );
}

// ── Edit modal ─────────────────────────────────────────────────────────────────

function EditModal({
  account, isAdmin, allParents, onClose, onSaved, onUnauth,
}: {
  account: TeamAccount;
  isAdmin: boolean;
  allParents: ParentUser[];
  onClose: () => void;
  onSaved: () => void;
  onUnauth: () => void;
}) {
  const { t } = useTranslation();

  const [password, setPassword]         = useState("");
  const [perms, setPerms]               = useState<string[]>(parsePerm(account.permissions));
  const [parentUsername, setParentUsername] = useState(account.parent_username ?? "");
  const [changingParent, setChangingParent] = useState(false);
  const [error, setError]               = useState("");
  const [saving, setSaving]             = useState(false);

  // Effective role for sections: follow the (possibly changed) parent's role
  const selectedParent = allParents.find(p => p.username === parentUsername);
  const effectiveRole  = selectedParent?.role ?? account.parent_role ?? account.role;
  const sections       = SECTIONS_BY_ROLE[effectiveRole] ?? [];

  // When parent changes, keep existing perms that are still valid
  function handleParentChange(uname: string) {
    setParentUsername(uname);
    const newParent = allParents.find(p => p.username === uname);
    if (newParent) {
      const newSections = (SECTIONS_BY_ROLE[newParent.role] ?? []).map(s => s.key);
      setPerms(prev => prev.filter(k => newSections.includes(k)));
    }
  }

  function togglePerm(key: string) {
    setPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function submit() {
    if (password && password.length < 8) { setError(t("admin.team.formError")); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = { permissions: perms };
      if (password) body.password = password;
      if (isAdmin && changingParent && parentUsername) body.parent_username = parentUsername;

      const res = await fetch(`${API_BASE}/api/admin/team/${account.id}`, {
        method: "PUT", headers: adminHeaders(), body: JSON.stringify(body),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) { onSaved(); }
      else if (data.error === "parent_not_found") setError(t("admin.team.parentNotFound"));
      else setError(t("admin.team.saveEditError"));
    } finally { setSaving(false); }
  }

  const currentParentRole = account.parent_role ?? account.role;
  const filteredParents = allParents.filter(p => p.role === currentParentRole);

  return (
    <Modal
      title={t("admin.team.editTitle")}
      subtitle={account.username}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
            {t("admin.team.cancel")}
          </button>
          <button onClick={submit} disabled={saving} className="flex-1 py-2.5 text-sm font-semibold bg-[#E10600] text-white rounded-xl hover:bg-[#C50500] disabled:opacity-60">
            {saving ? "…" : t("admin.team.saveEdit")}
          </button>
        </>
      }
    >
      {/* Current linked parent (admin view) */}
      {isAdmin && account.parent_username && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{t("admin.team.linkedTo")}</p>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center">
                <span className="text-gray-600 text-xs font-bold uppercase">{account.parent_username[0]}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{account.parent_username}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <RoleBadge role={currentParentRole} />
                  {account.parent_hub && (
                    <span className="text-[10px] text-gray-400">🏢 {account.parent_hub}</span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setChangingParent(v => !v)}
              className="text-xs text-[#E10600] font-semibold hover:underline shrink-0"
            >
              {changingParent ? t("admin.team.cancel") : t("admin.team.changeLink")}
            </button>
          </div>

          {/* Change parent dropdown */}
          {changingParent && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <select
                value={parentUsername}
                onChange={e => handleParentChange(e.target.value)}
                className={inputCls}
              >
                <option value="">{t("admin.team.selectParent")}</option>
                {filteredParents.map(p => (
                  <option key={p.username} value={p.username}>
                    {p.username}{p.office_hub ? ` — ${p.office_hub}` : ""}
                  </option>
                ))}
              </select>
              {selectedParent && selectedParent.username !== account.parent_username && (
                <p className="text-xs text-amber-600 mt-1.5 font-medium">
                  ⚠ Permissions will be adjusted to match {selectedParent.role} sections.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Password */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          {t("admin.team.fields.newPassword")}
          <span className="ml-1 font-normal text-gray-400">({t("admin.team.optional")})</span>
        </label>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          className={inputCls} placeholder="Leave blank to keep current" autoComplete="new-password"
        />
      </div>

      {/* Permissions */}
      <PermChecklist sections={sections} selected={perms} onChange={togglePerm} />

      {error && <p className="text-xs text-red-600 font-medium bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
    </Modal>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TeamView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();
  const role    = localStorage.getItem("admin_role") ?? "expediteur";
  const isAdmin = role === "admin";

  const [accounts, setAccounts]     = useState<TeamAccount[]>([]);
  const [allParents, setAllParents] = useState<ParentUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showAdd, setShowAdd]       = useState(false);
  const [editTarget, setEditTarget] = useState<TeamAccount | null>(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/team`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) setAccounts(data.accounts);
    } finally { setLoading(false); }
  }, [onUnauth]);

  // For admin: also fetch all potential parent users
  const fetchParents = useCallback(async () => {
    if (!isAdmin) return;
    const res = await fetch(`${API_BASE}/api/admin/users`, { headers: adminHeaders() });
    if (!res.ok) return;
    const data = await res.json();
    if (data.ok) {
      setAllParents((data.users ?? []).filter((u: ParentUser) =>
        ["office", "expediteur"].includes(u.role)
      ));
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchAccounts();
    fetchParents();
  }, [fetchAccounts, fetchParents]);

  function handleCreated() { setShowAdd(false); fetchAccounts(); }
  function handleSaved()   { setEditTarget(null); fetchAccounts(); }

  async function removeAccount(id: number) {
    if (!confirm(t("admin.team.confirmDelete"))) return;
    const res = await fetch(`${API_BASE}/api/admin/team/${id}`, {
      method: "DELETE", headers: adminHeaders(),
    });
    if (res.status === 401) { onUnauth(); return; }
    fetchAccounts();
  }

  return (
    <div className="p-3 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.team.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.team.subtitle")}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          {t("admin.team.add")}
        </button>
      </div>

      {/* Modals */}
      {showAdd && (
        <AddModal
          isAdmin={isAdmin} myRole={role} allParents={allParents}
          onClose={() => setShowAdd(false)} onCreated={handleCreated} onUnauth={onUnauth}
        />
      )}
      {editTarget && (
        <EditModal
          account={editTarget} isAdmin={isAdmin} allParents={allParents}
          onClose={() => setEditTarget(null)} onSaved={handleSaved} onUnauth={onUnauth}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
          <svg className="w-12 h-12 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <p className="text-sm font-medium">{t("admin.team.empty")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {accounts.map((a, i) => {
            const perms = parsePerm(a.permissions);
            return (
              <div key={a.id} className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? "border-t border-gray-50" : ""}`}>
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#E10600]/10 flex items-center justify-center shrink-0">
                  <span className="text-[#E10600] text-sm font-bold uppercase">{a.username[0]}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900">{a.username}</p>
                    <RoleBadge role={a.role} />
                  </div>

                  {/* Permissions */}
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {perms.length > 0 ? perms.join(", ") : t("admin.team.noPerms")}
                  </p>

                  {/* Linked parent (admin view) */}
                  {isAdmin && a.parent_username && (
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] text-gray-400 font-medium">{t("admin.team.linkedTo")}:</span>
                      <span className="text-[10px] font-semibold text-gray-600">{a.parent_username}</span>
                      {a.parent_hub && (
                        <span className="text-[10px] text-gray-400">🏢 {a.parent_hub}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => setEditTarget(a)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                    title={t("admin.team.edit")}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeAccount(a.id)}
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                    title={t("admin.team.delete")}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
