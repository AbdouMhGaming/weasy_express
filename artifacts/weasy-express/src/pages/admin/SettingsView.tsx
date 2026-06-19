import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

function Spinner() {
  return <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>;
}

interface Category { id: number; cat_key: string; name: string; icon: string; sort_order: number; parent_id: number | null; }

const EMOJI_PRESETS = [
  // Business & Finance
  "📣","👥","💻","📦","💰","🏭","📋","🚗","✈️","🏠","🔧","📊","🎯","💡","🛒","🤝","📱","🖨️","⚡","🌐",
  "🧾","📈","🏦","💳","🔑","🗂️","📝","🎁","🔒","📌",
  // Transport & Logistics
  "🚚","🚛","🚢","🚁","🛳️","🚂","🚌","🏍️","🛵","🚲","⛽","🅿️","🛣️","🛤️","📍","🗺️","🌍","🧭",
  // Office & Work
  "🖥️","⌨️","🖱️","📷","📸","📞","☎️","📟","📠","🖊️","✒️","📐","📏","✂️","🔍","🔎","📎","🖇️",
  // People & Teams
  "👤","👨‍💼","👩‍💼","👨‍🔧","👩‍🔧","👨‍💻","👩‍💻","👨‍🚚","🧑‍🤝‍🧑","🤵","👷","👨‍⚕️","🧑‍🏫",
  // Money & Payments
  "💵","💶","💷","💴","💸","💹","🏧","🪙","💎","🏆","🥇","📉","🤑","💲","🪝",
  // Buildings & Places
  "🏢","🏪","🏬","🏗️","🏨","🏦","🏫","🏥","⛪","🕌","🏰","🏯","🕍","🏟️",
  // Misc Tools
  "🔨","⚙️","🛠️","⛏️","🔩","🧲","🔋","💿","💾","📀","🖲️","🗜️","📡","🔭","🧪","🧫",
  // Nature & Environment
  "🌱","🌿","🍃","♻️","🌊","🌟","☀️","🌙","❄️","🔥","💧","🌬️",
];

export default function SettingsView() {
  const { t } = useTranslation();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"main" | "sub">("main");
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📋");
  const [newParentId, setNewParentId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [catsOpen, setCatsOpen] = useState(false);

  // Worker positions
  const [positions, setPositions] = useState<string[]>([]);
  const [posLoading, setPosLoading] = useState(true);
  const [newPosition, setNewPosition] = useState("");
  const [posSaving, setPosSaving] = useState(false);
  const [posError, setPosError] = useState("");
  const [posOpen, setPosOpen] = useState(false);

  const fetchCats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/categories`, { headers: adminHeaders() });
      const d = await res.json();
      if (d.ok) setCats(d.categories ?? []);
    } catch { } finally { setLoading(false); }
  }, []);

  const fetchPositions = useCallback(async () => {
    setPosLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings/worker_positions`, { headers: adminHeaders() });
      const d = await res.json();
      if (d.ok && d.value) {
        try { setPositions(JSON.parse(d.value)); } catch { setPositions([]); }
      }
    } catch { } finally { setPosLoading(false); }
  }, []);

  async function savePositions(updated: string[]) {
    setPosSaving(true); setPosError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/settings/worker_positions`, {
        method: "PUT", headers: adminHeaders(),
        body: JSON.stringify({ value: JSON.stringify(updated) }),
      });
      const d = await res.json();
      if (!d.ok) setPosError(t("admin.settings.positions.saveError"));
      else setPositions(updated);
    } catch { setPosError(t("admin.settings.positions.saveError")); } finally { setPosSaving(false); }
  }

  function addPosition() {
    const trimmed = newPosition.trim();
    if (!trimmed) return;
    if (positions.includes(trimmed)) { setPosError(t("admin.settings.positions.duplicate")); return; }
    setPosError("");
    setNewPosition("");
    savePositions([...positions, trimmed]);
  }

  function removePosition(pos: string) {
    savePositions(positions.filter(p => p !== pos));
  }

  useEffect(() => { fetchCats(); fetchPositions(); }, [fetchCats, fetchPositions]);

  const parentCats = cats.filter(c => !c.parent_id);

  async function addCategory() {
    if (!newName.trim()) { setError(t("admin.settings.categories.nameRequired")); return; }
    if (mode === "sub" && !newParentId) { setError(t("admin.settings.categories.chooseParent")); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/categories`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ name: newName.trim(), icon: newIcon, parent_id: mode === "sub" ? newParentId : null }),
      });
      const d = await res.json();
      if (d.ok) { setNewName(""); setNewIcon("📋"); setNewParentId(null); fetchCats(); }
      else setError(d.error ?? "error");
    } catch { setError("connection error"); } finally { setSaving(false); }
  }

  async function deleteCategory(id: number, name: string) {
    if (!confirm(t("admin.settings.categories.deleteConfirm", { name }))) return;
    try {
      await fetch(`${API_BASE}/api/admin/categories/${id}`, { method: "DELETE", headers: adminHeaders() });
      fetchCats();
    } catch { }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.settings.title")}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t("admin.settings.subtitle")}</p>
      </div>

      {/* Categories Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-6">
        <button
          type="button"
          onClick={() => setCatsOpen(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50/50 transition-colors text-left"
        >
          <div>
            <h2 className="font-bold text-gray-900">{t("admin.settings.categories.title")}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{t("admin.settings.categories.subtitle")}{!catsOpen && cats.length > 0 && <span className="ml-2 text-[#E10600]/70 font-semibold">{cats.filter(c => !c.parent_id).length} catégorie{cats.filter(c => !c.parent_id).length !== 1 ? "s" : ""}</span>}</p>
          </div>
          <svg className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${catsOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {catsOpen && <div>
        {/* Add Category Form */}
        <div className="px-6 pt-5 pb-4 border-b border-gray-100 bg-gradient-to-b from-gray-50/80 to-white">
          {/* Mode toggle */}
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit mb-5">
            <button
              type="button"
              onClick={() => { setMode("main"); setNewParentId(null); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === "main"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              {t("admin.settings.categories.mainCat")}
            </button>
            <button
              type="button"
              onClick={() => setMode("sub")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                mode === "sub"
                  ? "bg-white text-[#E10600] shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {t("admin.settings.categories.subCat")}
            </button>
          </div>

          {/* Parent picker (sub-category mode) */}
          {mode === "sub" && (
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                {t("admin.settings.categories.subCatOf")}
              </label>
              {parentCats.length === 0 ? (
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  Créez d'abord une catégorie principale.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {parentCats.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNewParentId(p.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-sm font-medium transition-all ${
                        newParentId === p.id
                          ? "border-[#E10600] bg-[#E10600]/5 text-[#E10600] shadow-sm"
                          : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-base">{p.icon}</span>
                      {p.name}
                      {newParentId === p.id && (
                        <svg className="w-3.5 h-3.5 text-[#E10600] ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Name + Icon + Add */}
          <div className="flex items-end gap-3 flex-wrap">
            {/* Icon picker */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.settings.categories.icon")}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(v => !v)}
                  className="w-12 h-10 border border-gray-200 rounded-xl text-xl flex items-center justify-center hover:bg-gray-100 transition-colors shadow-sm"
                >
                  {newIcon}
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-30 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 grid grid-cols-8 gap-1.5 w-80 max-h-64 overflow-y-auto">
                    {EMOJI_PRESETS.map(e => (
                      <button key={e} type="button"
                        onClick={() => { setNewIcon(e); setShowEmojiPicker(false); }}
                        className="text-xl w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors"
                      >{e}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Name input */}
            <div className="flex-1 min-w-[140px]">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                {mode === "sub" ? t("admin.settings.categories.subCatName") : t("admin.settings.categories.name")}
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                placeholder={mode === "sub" ? t("admin.settings.categories.subCatNamePh") : t("admin.settings.categories.namePh")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] shadow-sm"
              />
            </div>

            {/* Add button */}
            <button
              onClick={addCategory}
              disabled={saving || !newName.trim() || (mode === "sub" && !newParentId)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm disabled:opacity-60 transition-all shrink-0 ${
                mode === "sub"
                  ? "bg-[#E10600] hover:bg-[#C50500]"
                  : "bg-gray-900 hover:bg-gray-700"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              {mode === "sub" ? t("admin.settings.categories.addSub") : t("admin.settings.categories.add")}
            </button>
          </div>

          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>

        {/* Category List */}
        {loading ? (
          <div className="py-12 flex items-center justify-center text-gray-400 text-sm">
            <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            {t("admin.settings.loading")}
          </div>
        ) : cats.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">{t("admin.settings.categories.empty")}</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {cats.filter(c => !c.parent_id).map((parent) => {
              const children = cats.filter(c => c.parent_id === parent.id);
              return (
                <div key={parent.id}>
                  {/* Parent row */}
                  <div className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                    <span className="text-2xl w-8 text-center shrink-0">{parent.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800">{parent.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{parent.cat_key}</p>
                    </div>
                    {children.length > 0 && (
                      <span className="text-xs text-[#E10600]/70 bg-[#E10600]/5 border border-[#E10600]/10 px-2 py-0.5 rounded-full font-semibold shrink-0">
                        {children.length} {children.length === 1 ? "sous-cat." : "sous-cats."}
                      </span>
                    )}
                    <button
                      onClick={() => deleteCategory(parent.id, parent.name)}
                      className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {/* Children rows */}
                  {children.map((child, idx) => (
                    <div key={child.id} className={`pl-14 pr-6 py-2.5 flex items-center gap-3 hover:bg-gray-50/30 transition-colors bg-gray-50/30 ${idx === 0 ? "border-t border-gray-50" : ""}`}>
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center text-gray-300">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                        </svg>
                      </div>
                      <span className="text-base w-6 text-center shrink-0">{child.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-600">{child.name}</p>
                        <p className="text-xs text-gray-400 font-mono">{child.cat_key}</p>
                      </div>
                      <button
                        onClick={() => deleteCategory(child.id, child.name)}
                        className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
        </div>}
      </div>

      {/* Worker Positions Section */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-6">
        <button
          type="button"
          onClick={() => setPosOpen(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between border-b border-gray-100 hover:bg-gray-50/50 transition-colors text-left"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#E10600] to-[#B80500] flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">{t("admin.settings.positions.title")}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t("admin.settings.positions.subtitle")}{!posOpen && positions.length > 0 && <span className="ml-2 text-[#E10600]/70 font-semibold">{positions.length} poste{positions.length !== 1 ? "s" : ""}</span>}</p>
            </div>
          </div>
          <svg className={`w-5 h-5 text-gray-400 shrink-0 transition-transform duration-200 ${posOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {posOpen && <div className="p-6">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.settings.positions.newLabel")}</label>
              <input
                type="text"
                value={newPosition}
                onChange={e => setNewPosition(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addPosition(); }}
                placeholder={t("admin.settings.positions.placeholder")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] shadow-sm"
              />
            </div>
            <button
              onClick={addPosition}
              disabled={posSaving || !newPosition.trim()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold text-white bg-[#E10600] hover:bg-[#C50500] rounded-xl shadow-sm disabled:opacity-60 transition-all shrink-0"
            >
              {posSaving ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>}
              {t("admin.settings.positions.add")}
            </button>
          </div>
          {posError && <p className="text-xs text-red-500 mt-2">{posError}</p>}

          <div className="mt-4">
            {posLoading ? (
              <div className="py-8 flex items-center justify-center text-gray-400 text-sm gap-2"><Spinner />{t("admin.settings.loading")}</div>
            ) : positions.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">{t("admin.settings.positions.empty")}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {positions.map((pos, idx) => (
                  <span key={idx} className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm font-medium text-gray-700 group transition-colors">
                    <svg className="w-3.5 h-3.5 text-[#E10600]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    {pos}
                    <button
                      onClick={() => removePosition(pos)}
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all ml-1 text-sm leading-none"
                      title={t("admin.settings.positions.remove")}
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>}
      </div>
    </div>
  );
}
