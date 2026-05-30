import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import logoWhitePath from "@assets/weasy_logo_white_no_bg.png";
import { API_BASE, adminHeaders } from "@/lib/api";
import i18n, { SUPPORTED_LANGUAGES } from "@/lib/i18n";

// ── Types ──────────────────────────────────────────────────────────────────────

type PartnerStatus = "pending" | "reviewing" | "approved" | "rejected";
type AdminRole = "admin" | "office" | "finance" | "commercial";

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_COLOR: Record<PartnerStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  reviewing: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800",
};
const ROLE_COLOR: Record<AdminRole, string> = {
  admin: "bg-purple-100 text-purple-800",
  office: "bg-blue-100 text-blue-800",
  finance: "bg-emerald-100 text-emerald-800",
  commercial: "bg-orange-100 text-orange-800",
};
const LANG_LABELS: Record<string, string> = { fr: "FR", ar: "ع", en: "EN" };

// ── Sidebar ────────────────────────────────────────────────────────────────────

type SidebarView = "partners" | "offices" | "admins";

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

      {/* Role badge + username */}
      <div className="px-5 py-3 border-b border-white/5">
        <p className="text-white/80 text-xs font-semibold truncate">{username}</p>
        <span className={`inline-flex text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${ROLE_COLOR[role]}`}>
          {t(`admin.roles.${role}`)}
        </span>
      </div>

      {isAdmin ? (
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
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
        {/* Language switcher */}
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
            <div className="px-6 py-5 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: t("admin.partners.fields.email"), value: selected.email, full: true },
                  { label: t("admin.partners.fields.phone"), value: selected.phone, full: false },
                  { label: t("admin.partners.fields.city"), value: selected.city, full: false },
                  { label: t("admin.partners.fields.parcels"), value: selected.parcelsPerMonth, full: false },
                  { label: t("admin.partners.fields.date"), value: fmtDate(selected.createdAt), full: true },
                  { label: t("admin.partners.fields.address"), value: selected.address, full: true },
                ].map(({ label, value, full }) => (
                  <div key={label} className={full ? "col-span-2" : ""}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className="text-sm font-medium text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">{t("admin.partners.passwordLabel")}</p>
                  <button onClick={() => setShowPassword((v) => !v)} className="text-xs text-amber-600 hover:text-amber-800 font-medium flex items-center gap-1">
                    {showPassword ? t("admin.partners.passwordHide") : t("admin.partners.passwordShow")}
                  </button>
                </div>
                <p className="font-mono text-sm font-bold text-gray-900 break-all">
                  {showPassword ? (selected.password || <span className="text-gray-400 font-normal italic">{t("admin.partners.passwordEmpty")}</span>) : "••••••••••"}
                </p>
                <p className="text-xs text-amber-600 mt-2">{t("admin.partners.passwordNote")}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t("admin.partners.statusLabel")}</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as PartnerStatus)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]">
                  {(["pending","reviewing","approved","rejected"] as const).map((s) => (
                    <option key={s} value={s}>{t(`admin.partners.statusOptions.${s}`)}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">{t("admin.partners.notesLabel")}</label>
                <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] resize-none"
                  placeholder={t("admin.partners.notesPh")} />
              </div>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 flex items-center justify-between px-6 py-4">
              <button onClick={() => remove(selected.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">{t("admin.partners.delete")}</button>
              <div className="flex gap-2">
                <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.partners.cancel")}</button>
                <button onClick={save} disabled={saving} className="px-5 py-2 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
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

const EMPTY_OFFICE_FORM = { wilayaNumber: "", wilaya: "", commune: "", address: "", phone: "", mapsUrl: "", isPrincipal: false };

function OfficesView({ offices, loading, error, onRefresh, onUnauth }: {
  offices: Office[]; loading: boolean; error: string; onRefresh: () => void; onUnauth: () => void;
}) {
  const { t } = useTranslation();
  const [modal, setModal] = useState<null | "add" | Office>(null);
  const [form, setForm] = useState(EMPTY_OFFICE_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  function openAdd() { setForm(EMPTY_OFFICE_FORM); setFormError(""); setModal("add"); }
  function openEdit(o: Office) {
    setForm({ wilayaNumber: String(o.wilayaNumber), wilaya: o.wilaya, commune: o.commune ?? "", address: o.address, phone: o.phone ?? "", mapsUrl: o.mapsUrl, isPrincipal: o.isPrincipal });
    setFormError(""); setModal(o);
  }

  async function saveOffice() {
    if (!form.wilaya.trim() || !form.address.trim() || !form.mapsUrl.trim() || !form.wilayaNumber) {
      setFormError(t("admin.offices.formError")); return;
    }
    setSaving(true); setFormError("");
    try {
      const isEdit = modal !== "add" && modal !== null;
      const url = isEdit ? `${API_BASE}/api/admin/offices/${(modal as Office).id}` : `${API_BASE}/api/admin/offices`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST", headers: adminHeaders(),
        body: JSON.stringify({ wilayaNumber: parseInt(String(form.wilayaNumber), 10), wilaya: form.wilaya.trim(), commune: form.commune.trim() || undefined, address: form.address.trim(), phone: form.phone.trim() || undefined, mapsUrl: form.mapsUrl.trim(), isPrincipal: form.isPrincipal }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean };
      if (data.ok) { onRefresh(); setModal(null); } else setFormError(t("admin.offices.saveError"));
    } finally { setSaving(false); }
  }

  async function deleteOffice(id: number) {
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
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} className="text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            </button>
            <button onClick={openAdd} className="flex items-center gap-2 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold px-4 py-2 rounded-xl shadow-md shadow-red-200 transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
              {t("admin.offices.add")}
            </button>
          </div>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}
        {loading ? (
          <div className="flex items-center justify-center py-24 text-gray-400 text-sm gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          </div>
        ) : offices.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-200 py-24 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
            </div>
            <p className="text-gray-500 font-medium">{t("admin.offices.noData")}</p>
            <button onClick={openAdd} className="text-sm text-[#E10600] font-semibold hover:underline">{t("admin.offices.addFirst")}</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {offices.map((o) => (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-24 bg-gradient-to-br from-[#E10600] to-[#B80500] flex flex-col items-center justify-center gap-1 relative px-4">
                  <svg className="w-6 h-6 text-white/50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold bg-white/20 text-white px-2 py-0.5 rounded">{String(o.wilayaNumber).padStart(2,"0")}</span>
                    <span className="text-white font-bold text-sm">{o.commune ?? o.wilaya}</span>
                  </div>
                  {o.isPrincipal && <span className="absolute top-2 right-2 text-xs bg-white text-[#E10600] font-bold px-2 py-0.5 rounded-full">★ {t("admin.offices.principal")}</span>}
                </div>
                <div className="p-4">
                  <p className="text-sm font-semibold text-gray-800 mb-1">{o.commune ? `${o.commune}, ${o.wilaya}` : o.wilaya}</p>
                  <p className="text-xs text-gray-500 mb-1">{o.address}</p>
                  {o.phone && <p className="text-xs text-gray-500">{o.phone}</p>}
                  <div className="flex items-center gap-2 mt-4">
                    <a href={o.mapsUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-xs text-center text-[#E10600] border border-[#E10600]/20 hover:bg-red-50 py-1.5 rounded-lg font-medium">{t("admin.offices.maps")}</a>
                    <button onClick={() => openEdit(o)} className="flex-1 text-xs text-center text-gray-600 border border-gray-200 hover:bg-gray-50 py-1.5 rounded-lg font-medium">{t("admin.offices.edit")}</button>
                    <button onClick={() => deleteOffice(o.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between rounded-t-3xl sm:rounded-t-2xl">
              <h3 className="font-bold text-gray-900">{modal === "add" ? t("admin.offices.addTitle") : t("admin.offices.editTitle")}</h3>
              <button onClick={() => setModal(null)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {formError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.offices.fields.wilayaNumber")}</label>
                  <input type="number" value={form.wilayaNumber} onChange={(e) => setForm((f) => ({ ...f, wilayaNumber: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                    placeholder={t("admin.offices.placeholders.wilayaNumber")} min={1} max={58} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.offices.fields.wilaya")}</label>
                  <input type="text" value={form.wilaya} onChange={(e) => setForm((f) => ({ ...f, wilaya: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                    placeholder={t("admin.offices.placeholders.wilaya")} />
                </div>
              </div>
              {[
                { key: "commune", type: "text" }, { key: "address", type: "text" },
                { key: "phone", type: "tel" }, { key: "mapsUrl", type: "url" },
              ].map(({ key, type }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t(`admin.offices.fields.${key}`)}</label>
                  <input type={type} value={(form as Record<string,unknown>)[key] as string}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                    placeholder={t(`admin.offices.placeholders.${key}`)} />
                </div>
              ))}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input type="checkbox" checked={form.isPrincipal} onChange={(e) => setForm((f) => ({ ...f, isPrincipal: e.target.checked }))} className="w-4 h-4 rounded accent-[#E10600]" />
                <span className="text-sm font-medium text-gray-700">{t("admin.offices.fields.isPrincipal")}</span>
              </label>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-gray-100 flex items-center justify-end gap-2 px-6 py-4">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.offices.cancel")}</button>
              <button onClick={saveOffice} disabled={saving} className="px-5 py-2 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60">
                {saving ? t("admin.offices.saving") : modal === "add" ? t("admin.offices.save") : t("admin.offices.saveEdit")}
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
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "office" as AdminRole });
  const [showNewPass, setShowNewPass] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const fetchAdmins = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins`, { headers: adminHeaders() });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; admins: AdminUser[] };
      if (data.ok) setAdmins(data.admins);
    } catch { setError("Erreur de chargement."); } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

  async function createAdmin() {
    if (!form.username.trim() || form.password.length < 8) { setFormError(t("admin.admins.formError")); return; }
    setSaving(true); setFormError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/admins`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ username: form.username.trim(), password: form.password, role: form.role }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) { fetchAdmins(); setShowAdd(false); setForm({ username: "", password: "", role: "office" }); }
      else if (data.error === "username_taken") setFormError(t("admin.admins.usernameTaken"));
      else setFormError(t("admin.admins.saveError"));
    } finally { setSaving(false); }
  }

  async function deleteAdmin(id: number) {
    if (!confirm(t("admin.admins.deleteConfirm"))) return;
    const res = await fetch(`${API_BASE}/api/admin/admins/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    const data = (await res.json()) as { ok: boolean; error?: string };
    if (data.error === "cannot_delete_self") { alert(t("admin.admins.cannotDeleteSelf")); return; }
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
          <button onClick={() => { setShowAdd(true); setForm({ username: "", password: "", role: "office" }); setFormError(""); }}
            className="flex items-center gap-2 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold px-4 py-2 rounded-xl shadow-md shadow-red-200 transition-all">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
            {t("admin.admins.add")}
          </button>
        </div>
        {error && <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4">{error}</div>}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400 text-sm gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            </div>
          ) : admins.length === 0 ? (
            <div className="py-20 text-center text-gray-400 text-sm">{t("admin.admins.noData")}</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {admins.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50/60">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-xs font-bold text-white uppercase">
                      {a.username.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm flex items-center gap-2">
                        {a.username}
                        {a.username === currentUsername && <span className="text-xs text-gray-400 font-normal">(vous)</span>}
                      </p>
                      <p className="text-xs text-gray-400">{t("admin.admins.fields.role")} · {fmtDate(a.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${ROLE_COLOR[a.role]}`}>{t(`admin.roles.${a.role}`)}</span>
                    {a.username !== currentUsername && (
                      <button onClick={() => deleteAdmin(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl mx-4">
            <div className="h-1.5 bg-gradient-to-r from-[#E10600] to-[#B80500] rounded-t-2xl" />
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-gray-900 text-lg">{t("admin.admins.addTitle")}</h3>
                <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-700 text-2xl leading-none w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100">×</button>
              </div>
              {formError && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-700 mb-4">{formError}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.admins.fields.username")}</label>
                  <input type="text" value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                    autoComplete="off" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.admins.fields.password")} <span className="text-gray-400 font-normal">(min. 8)</span></label>
                  <div className="relative">
                    <input type={showNewPass ? "text" : "password"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                      className="w-full border border-gray-200 rounded-xl px-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                      autoComplete="new-password" />
                    <button type="button" onClick={() => setShowNewPass((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNewPass
                        ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/></svg>
                        : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                      }
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.admins.fields.role")}</label>
                  <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as AdminRole }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]">
                    {(["admin","office","finance","commercial"] as const).map((r) => (
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
  const [view, setView] = useState<SidebarView>("partners");
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
