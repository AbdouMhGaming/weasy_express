import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

interface Category { id: number; cat_key: string; name: string; icon: string; sort_order: number; }

const EMOJI_PRESETS = ["📣","👥","💻","📦","💰","🏭","📋","🚗","✈️","🏠","🔧","📊","🎯","💡","🛒","🤝","📱","🖨️","⚡","🌐"];

export default function SettingsView() {
  const { t } = useTranslation();
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📋");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const fetchCats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/categories`, { headers: adminHeaders() });
      const d = await res.json();
      if (d.ok) setCats(d.categories ?? []);
    } catch { } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCats(); }, [fetchCats]);

  async function addCategory() {
    if (!newName.trim()) { setError(t("admin.settings.categories.nameRequired")); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/categories`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ name: newName.trim(), icon: newIcon }),
      });
      const d = await res.json();
      if (d.ok) { setNewName(""); setNewIcon("📋"); fetchCats(); }
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
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-900">{t("admin.settings.categories.title")}</h2>
          <p className="text-xs text-gray-400 mt-0.5">{t("admin.settings.categories.subtitle")}</p>
        </div>

        {/* Add Category Form */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.settings.categories.icon")}</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(v => !v)}
                  className="w-12 h-10 border border-gray-200 rounded-xl text-xl flex items-center justify-center hover:bg-gray-100 transition-colors"
                >
                  {newIcon}
                </button>
                {showEmojiPicker && (
                  <div className="absolute top-12 left-0 z-30 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 grid grid-cols-5 gap-2 w-52">
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
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.settings.categories.name")}</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }}
                placeholder={t("admin.settings.categories.namePh")}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
              />
            </div>
            <button
              onClick={addCategory}
              disabled={saving || !newName.trim()}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
              {t("admin.settings.categories.add")}
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
            {cats.map((cat) => (
              <div key={cat.id} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50/40 transition-colors">
                <span className="text-2xl w-8 text-center shrink-0">{cat.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{cat.name}</p>
                  <p className="text-xs text-gray-400 font-mono">{cat.cat_key}</p>
                </div>
                <button
                  onClick={() => deleteCategory(cat.id, cat.name)}
                  className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
