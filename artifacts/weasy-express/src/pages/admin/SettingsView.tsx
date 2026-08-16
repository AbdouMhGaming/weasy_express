import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
interface Category { id: number; cat_key: string; name: string; icon: string; sort_order: number; parent_id: number | null; }

// ── Constants ──────────────────────────────────────────────────────────────────
const EMOJI_PRESETS = [
  "📣","👥","💻","📦","💰","🏭","📋","🚗","✈️","🏠","🔧","📊","🎯","💡","🛒","🤝","📱","🖨️","⚡","🌐",
  "🧾","📈","🏦","💳","🔑","🗂️","📝","🎁","🔒","📌",
  "🚚","🚛","🚢","🚁","🛳️","🚂","🚌","🏍️","🛵","🚲","⛽","🅿️","🛣️","🛤️","📍","🗺️","🌍","🧭",
  "🖥️","⌨️","🖱️","📷","📸","📞","☎️","📟","📠","🖊️","✒️","📐","📏","✂️","🔍","🔎","📎","🖇️",
  "👤","👨‍💼","👩‍💼","👨‍🔧","👩‍🔧","👨‍💻","👩‍💻","👨‍🚚","🧑‍🤝‍🧑","🤵","👷","👨‍⚕️","🧑‍🏫",
  "💵","💶","💷","💴","💸","💹","🏧","🪙","💎","🏆","🥇","📉","🤑","💲","🪝",
  "🏢","🏪","🏬","🏗️","🏨","🏦","🏫","🏥","⛪","🕌","🏰","🏯","🕍","🏟️",
  "🔨","⚙️","🛠️","⛏️","🔩","🧲","🔋","💿","💾","📀","🖲️","🗜️","📡","🔭","🧪","🧫",
  "🌱","🌿","🍃","♻️","🌊","🌟","☀️","🌙","❄️","🔥","💧","🌬️",
];

type Section = "categories" | "positions" | "reasons" | "services";

function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}

// ── Section nav config ─────────────────────────────────────────────────────────
interface NavItem { id: Section; titleKey: string; subtitleKey: string; color: string; bgColor: string; icon: React.ReactNode; }

const NAV: NavItem[] = [
  {
    id: "categories",
    titleKey: "admin.settings.categories.title",
    subtitleKey: "admin.settings.categories.subtitle",
    color: "text-[#E10600]",
    bgColor: "bg-[#E10600]/10",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>,
  },
  {
    id: "positions",
    titleKey: "admin.settings.positions.title",
    subtitleKey: "admin.settings.positions.subtitle",
    color: "text-violet-600",
    bgColor: "bg-violet-50",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  },
  {
    id: "reasons",
    titleKey: "admin.settings.ticketReasons.title",
    subtitleKey: "admin.settings.ticketReasons.subtitle",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    id: "services",
    titleKey: "admin.settings.supportServices.title",
    subtitleKey: "admin.settings.supportServices.subtitle",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  },
];

// ── Chip list editor (positions / reasons / services) ─────────────────────────
interface ChipEditorProps {
  items: string[]; loading: boolean; saving: boolean; error: string;
  newVal: string; setNewVal: (v: string) => void;
  onAdd: () => void; onRemove: (v: string) => void;
  addLabel: string; placeholder: string; emptyText: string; color: string;
}
function ChipEditor({ items, loading, saving, error, newVal, setNewVal, onAdd, onRemove, addLabel, placeholder, emptyText, color }: ChipEditorProps) {
  return (
    <div>
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onAdd(); }}
            placeholder={placeholder}
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-all"
          />
        </div>
        <button
          onClick={onAdd}
          disabled={saving || !newVal.trim()}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#E10600] hover:bg-[#C50500] rounded-xl shadow-sm disabled:opacity-50 transition-all shrink-0"
        >
          {saving ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>}
          {addLabel}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-2 font-medium">{error}</p>}
      <div className="mt-5">
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-4"><Spinner /><span>…</span></div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 border-2 border-dashed border-gray-100 rounded-2xl">
            <p className="text-sm text-gray-400">{emptyText}</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item, idx) => (
              <span key={idx} className={`inline-flex items-center gap-2 pl-3.5 pr-2 py-2 rounded-xl text-sm font-medium border transition-all group ${color}`}>
                {item}
                <button
                  onClick={() => onRemove(item)}
                  className="w-5 h-5 rounded-lg flex items-center justify-center text-current opacity-40 hover:opacity-100 hover:bg-black/5 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SettingsView() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Section>("categories");

  // ── Categories ──────────────────────────────────────────────────────────────
  const [cats, setCats] = useState<Category[]>([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catMode, setCatMode] = useState<"main" | "sub">("main");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📋");
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // ── Positions ───────────────────────────────────────────────────────────────
  const [positions, setPositions] = useState<string[]>([]);
  const [posLoading, setPosLoading] = useState(true);
  const [newPosition, setNewPosition] = useState("");
  const [posSaving, setPosSaving] = useState(false);
  const [posError, setPosError] = useState("");

  // ── Reasons ─────────────────────────────────────────────────────────────────
  const [reasons, setReasons] = useState<string[]>([]);
  const [reasonsLoading, setReasonsLoading] = useState(true);
  const [newReason, setNewReason] = useState("");
  const [reasonsSaving, setReasonsSaving] = useState(false);
  const [reasonsError, setReasonsError] = useState("");

  // ── Services ────────────────────────────────────────────────────────────────
  const [services, setServices] = useState<string[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [newService, setNewService] = useState("");
  const [servicesSaving, setServicesSaving] = useState(false);
  const [servicesError, setServicesError] = useState("");

  // ── Fetch ────────────────────────────────────────────────────────────────────
  const fetchCats = useCallback(async () => {
    setCatsLoading(true);
    try {
      const d = await (await fetch(`${API_BASE}/api/admin/categories`, { headers: adminHeaders() })).json();
      if (d.ok) setCats(d.categories ?? []);
    } finally { setCatsLoading(false); }
  }, []);

  const fetchSetting = useCallback(async (key: string, setter: (v: string[]) => void, setLoad: (v: boolean) => void) => {
    setLoad(true);
    try {
      const d = await (await fetch(`${API_BASE}/api/admin/settings/${key}`, { headers: adminHeaders() })).json();
      if (d.ok && d.value) { try { setter(JSON.parse(d.value)); } catch { setter([]); } }
    } finally { setLoad(false); }
  }, []);

  useEffect(() => {
    fetchCats();
    fetchSetting("worker_positions", setPositions, setPosLoading);
    fetchSetting("ticket_reasons", setReasons, setReasonsLoading);
    fetchSetting("support_services", setServices, setServicesLoading);
  }, [fetchCats, fetchSetting]);

  // ── Save list setting ────────────────────────────────────────────────────────
  async function saveList(
    key: string, updated: string[],
    setter: (v: string[]) => void,
    setSaving: (v: boolean) => void,
    setError: (v: string) => void,
    errKey: string,
  ) {
    setSaving(true); setError("");
    try {
      const d = await (await fetch(`${API_BASE}/api/admin/settings/${key}`, {
        method: "PUT", headers: adminHeaders(),
        body: JSON.stringify({ value: JSON.stringify(updated) }),
      })).json();
      if (!d.ok) setError(t(errKey));
      else setter(updated);
    } catch { setError(t(errKey)); } finally { setSaving(false); }
  }

  // ── Positions ────────────────────────────────────────────────────────────────
  function addPosition() {
    const v = newPosition.trim();
    if (!v) return;
    if (positions.includes(v)) { setPosError(t("admin.settings.positions.duplicate")); return; }
    setPosError(""); setNewPosition("");
    saveList("worker_positions", [...positions, v], setPositions, setPosSaving, setPosError, "admin.settings.positions.saveError");
  }
  function removePosition(pos: string) {
    saveList("worker_positions", positions.filter(p => p !== pos), setPositions, setPosSaving, setPosError, "admin.settings.positions.saveError");
  }

  // ── Reasons ──────────────────────────────────────────────────────────────────
  function addReason() {
    const v = newReason.trim();
    if (!v) return;
    if (reasons.includes(v)) { setReasonsError(t("admin.settings.ticketReasons.duplicate")); return; }
    setReasonsError(""); setNewReason("");
    saveList("ticket_reasons", [...reasons, v], setReasons, setReasonsSaving, setReasonsError, "admin.settings.ticketReasons.saveError");
  }
  function removeReason(r: string) {
    saveList("ticket_reasons", reasons.filter(x => x !== r), setReasons, setReasonsSaving, setReasonsError, "admin.settings.ticketReasons.saveError");
  }

  // ── Services ─────────────────────────────────────────────────────────────────
  function addService() {
    const v = newService.trim();
    if (!v) return;
    if (services.includes(v)) { setServicesError(t("admin.settings.supportServices.duplicate")); return; }
    setServicesError(""); setNewService("");
    saveList("support_services", [...services, v], setServices, setServicesSaving, setServicesError, "admin.settings.supportServices.saveError");
  }
  function removeService(s: string) {
    saveList("support_services", services.filter(x => x !== s), setServices, setServicesSaving, setServicesError, "admin.settings.supportServices.saveError");
  }

  // ── Categories ───────────────────────────────────────────────────────────────
  const parentCats = cats.filter(c => !c.parent_id);

  async function addCategory() {
    if (!newName.trim()) { setCatError(t("admin.settings.categories.nameRequired")); return; }
    if (catMode === "sub" && !newParentId) { setCatError(t("admin.settings.categories.chooseParent")); return; }
    setCatSaving(true); setCatError("");
    try {
      const d = await (await fetch(`${API_BASE}/api/admin/categories`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ name: newName.trim(), icon: newIcon, parent_id: catMode === "sub" ? newParentId : null }),
      })).json();
      if (d.ok) { setNewName(""); setNewIcon("📋"); setNewParentId(null); fetchCats(); }
      else setCatError(d.error ?? "error");
    } catch { setCatError("connection error"); } finally { setCatSaving(false); }
  }

  async function deleteCategory(id: number, name: string) {
    if (!confirm(t("admin.settings.categories.deleteConfirm", { name }))) return;
    try { await fetch(`${API_BASE}/api/admin/categories/${id}`, { method: "DELETE", headers: adminHeaders() }); fetchCats(); } catch {}
  }

  // ── Count badges ─────────────────────────────────────────────────────────────
  const counts: Record<Section, number> = {
    categories: cats.filter(c => !c.parent_id).length,
    positions:  positions.length,
    reasons:    reasons.length,
    services:   services.length,
  };

  const activeNav = NAV.find(n => n.id === active)!;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* ── Left sidebar nav ── */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r border-gray-100 p-4 gap-1 pt-8">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-3 mb-3">
          {t("admin.settings.title")}
        </p>
        {NAV.map(n => {
          const isActive = active === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setActive(n.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all group ${
                isActive
                  ? `${n.bgColor} ${n.color}`
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              }`}
            >
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                isActive ? `${n.bgColor} ${n.color}` : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
              }`}>
                {n.icon}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{t(n.titleKey)}</p>
              </div>
              {counts[n.id] > 0 && (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  isActive ? "bg-white/50" : "bg-gray-100 text-gray-500"
                }`}>
                  {counts[n.id]}
                </span>
              )}
            </button>
          );
        })}
      </aside>

      {/* ── Mobile tab bar ── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 flex">
        {NAV.map(n => {
          const isActive = active === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setActive(n.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-all ${
                isActive ? n.color : "text-gray-400"
              }`}
            >
              <span className="w-5 h-5">{n.icon}</span>
              <span className="text-[9px] font-bold truncate max-w-[50px]">{t(n.titleKey).split(" ")[0]}</span>
            </button>
          );
        })}
      </div>

      {/* ── Main content ── */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8 overflow-y-auto">
        {/* Section header */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${activeNav.bgColor} ${activeNav.color}`}>
            {activeNav.icon}
          </div>
          <div>
            <h1 className="text-xl font-black text-gray-900">{t(activeNav.titleKey)}</h1>
            <p className="text-sm text-gray-400">{t(activeNav.subtitleKey)}</p>
          </div>
        </div>

        {/* ─── Categories ─── */}
        {active === "categories" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Add form */}
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
              {/* Mode toggle */}
              <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
                {(["main", "sub"] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => { setCatMode(m); setNewParentId(null); }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      catMode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {m === "main" ? t("admin.settings.categories.mainCat") : t("admin.settings.categories.subCat")}
                  </button>
                ))}
              </div>

              {catMode === "sub" && (
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 mb-2">{t("admin.settings.categories.subCatOf")}</label>
                  {parentCats.length === 0 ? (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      {t("admin.settings.categories.empty")}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {parentCats.map(p => (
                        <button key={p.id} onClick={() => setNewParentId(p.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                            newParentId === p.id
                              ? "border-[#E10600] bg-[#E10600]/5 text-[#E10600]"
                              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                          }`}
                        >
                          <span>{p.icon}</span>{p.name}
                          {newParentId === p.id && <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-end gap-3 flex-wrap">
                {/* Emoji picker */}
                <div className="relative">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("admin.settings.categories.icon")}</label>
                  <button onClick={() => setShowEmojiPicker(v => !v)}
                    className="w-12 h-10 border border-gray-200 rounded-xl text-xl flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm"
                  >{newIcon}</button>
                  {showEmojiPicker && (
                    <div className="absolute top-14 left-0 z-30 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 grid grid-cols-8 gap-1.5 w-80 max-h-60 overflow-y-auto">
                      {EMOJI_PRESETS.map(e => (
                        <button key={e} onClick={() => { setNewIcon(e); setShowEmojiPicker(false); }}
                          className="text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100"
                        >{e}</button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    {catMode === "sub" ? t("admin.settings.categories.subCatName") : t("admin.settings.categories.name")}
                  </label>
                  <input
                    type="text" value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") addCategory(); }}
                    placeholder={catMode === "sub" ? t("admin.settings.categories.subCatNamePh") : t("admin.settings.categories.namePh")}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-all"
                  />
                </div>
                <button
                  onClick={addCategory}
                  disabled={catSaving || !newName.trim() || (catMode === "sub" && !newParentId)}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#E10600] hover:bg-[#C50500] rounded-xl shadow-sm disabled:opacity-50 transition-all shrink-0"
                >
                  {catSaving ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>}
                  {catMode === "sub" ? t("admin.settings.categories.addSub") : t("admin.settings.categories.add")}
                </button>
              </div>
              {catError && <p className="text-xs text-red-500 mt-2 font-medium">{catError}</p>}
            </div>

            {/* Category list */}
            {catsLoading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />{t("admin.settings.loading")}</div>
            ) : cats.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-4xl mb-3">🗂️</p>
                <p className="text-sm text-gray-400">{t("admin.settings.categories.empty")}</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {parentCats.map(parent => {
                  const children = cats.filter(c => c.parent_id === parent.id);
                  return (
                    <div key={parent.id}>
                      <div className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50/40 transition-colors">
                        <span className="text-2xl w-8 text-center shrink-0">{parent.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800">{parent.name}</p>
                          <p className="text-xs text-gray-400 font-mono">{parent.cat_key}</p>
                        </div>
                        {children.length > 0 && (
                          <span className="text-xs text-[#E10600]/80 bg-[#E10600]/5 border border-[#E10600]/10 px-2 py-0.5 rounded-full font-semibold shrink-0">
                            {children.length}
                          </span>
                        )}
                        <button onClick={() => deleteCategory(parent.id, parent.name)}
                          className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                      {children.map((child, idx) => (
                        <div key={child.id} className={`pl-16 pr-6 py-2.5 flex items-center gap-3 bg-gray-50/40 hover:bg-gray-50/70 transition-colors ${idx === 0 ? "border-t border-gray-50" : ""}`}>
                          <span className="text-gray-300">↳</span>
                          <span className="text-base">{child.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-600">{child.name}</p>
                            <p className="text-xs text-gray-400 font-mono">{child.cat_key}</p>
                          </div>
                          <button onClick={() => deleteCategory(child.id, child.name)}
                            className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Positions ─── */}
        {active === "positions" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <ChipEditor
              items={positions} loading={posLoading} saving={posSaving} error={posError}
              newVal={newPosition} setNewVal={setNewPosition}
              onAdd={addPosition} onRemove={removePosition}
              addLabel={t("admin.settings.positions.add")}
              placeholder={t("admin.settings.positions.placeholder")}
              emptyText={t("admin.settings.positions.empty")}
              color="bg-violet-50 text-violet-700 border-violet-100"
            />
          </div>
        )}

        {/* ─── Ticket Reasons ─── */}
        {active === "reasons" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <ChipEditor
              items={reasons} loading={reasonsLoading} saving={reasonsSaving} error={reasonsError}
              newVal={newReason} setNewVal={setNewReason}
              onAdd={addReason} onRemove={removeReason}
              addLabel={t("admin.settings.ticketReasons.add")}
              placeholder={t("admin.settings.ticketReasons.placeholder")}
              emptyText={t("admin.settings.ticketReasons.empty")}
              color="bg-amber-50 text-amber-700 border-amber-100"
            />
          </div>
        )}

        {/* ─── Support Services ─── */}
        {active === "services" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <ChipEditor
              items={services} loading={servicesLoading} saving={servicesSaving} error={servicesError}
              newVal={newService} setNewVal={setNewService}
              onAdd={addService} onRemove={removeService}
              addLabel={t("admin.settings.supportServices.add")}
              placeholder={t("admin.settings.supportServices.placeholder")}
              emptyText={t("admin.settings.supportServices.empty")}
              color="bg-blue-50 text-blue-700 border-blue-100"
            />
          </div>
        )}
      </main>
    </div>
  );
}
