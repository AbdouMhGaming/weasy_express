import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { User, Key, Mail } from "lucide-react";
import { API_BASE, adminHeaders, authenticatedFetch, readApiJson } from "@/lib/api";

export default function ProfileView({ username, onChangePassword }: { username: string; onChangePassword: () => void }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setEmail(null);
    authenticatedFetch(`${API_BASE}/api/admin/profile`, { headers: adminHeaders(), signal: controller.signal })
      .then(async (res) => {
        const body = await readApiJson(res);
        if (!res.ok || !body.ok) throw new Error(body.error || "load_failed");
        if (!controller.signal.aborted) setEmail(body.profile?.email || null);
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message || "load_failed"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [username]);
  return (
    <div className="max-w-2xl mx-auto p-6 md:p-8">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500 shrink-0">
            <User className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{t("admin.sidebar.profile")}</h2>
            <p className="text-sm text-gray-500">{t("admin.roles.expediteur")}</p>
          </div>
        </div>
        
        <div className="space-y-6">
          <div>
            <label className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-2">
              <User className="w-4 h-4"/> {t("admin.admins.fields.username")}
            </label>
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 font-medium">{username}</div>
          </div>

          <div>
              <label className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4"/> Email
              </label>
              <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-gray-900 font-medium">{loading ? "…" : error ? t("admin.ecotrackPortal.common.error") : email || "—"}</div>
          </div>
          
          <div className="pt-4 border-t border-gray-100">
            <label className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-3">
              <Key className="w-4 h-4"/> {t("admin.sidebar.settings")}
            </label>
            <button 
              onClick={onChangePassword} 
              className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-xl transition-colors"
            >
              {t("admin.sidebar.changePassword")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}