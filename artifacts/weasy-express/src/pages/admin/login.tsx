import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import logoPath from "@assets/logo-removebg-preview_1777142961208.png";
import { API_BASE } from "@/lib/api";
import i18n, { SUPPORTED_LANGUAGES } from "@/lib/i18n";

const LANG_LABELS: Record<string, string> = { fr: "FR", ar: "ع", en: "EN" };

export default function AdminLogin() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { ok: boolean; token?: string; role?: string };
      if (!res.ok || !data.ok || !data.token) {
        setError(t("admin.login.wrongCredentials"));
        return;
      }
      localStorage.setItem("admin_token", data.token);
      localStorage.setItem("admin_role", data.role ?? "admin");
      localStorage.setItem("admin_username", username);
      navigate("/admin");
    } catch {
      setError(t("admin.login.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center p-4" dir="ltr">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-[#E10600] to-[#B80500]" />
          <div className="px-8 py-10">
            {/* Logo + lang switcher */}
            <div className="flex items-center justify-between mb-8">
              <img src={logoPath} alt="Weasy Express" className="h-12 w-auto object-contain" />
              <div className="flex items-center gap-1">
                {SUPPORTED_LANGUAGES.map((lng) => (
                  <button
                    key={lng}
                    onClick={() => i18n.changeLanguage(lng)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      i18n.language === lng
                        ? "bg-[#E10600] text-white"
                        : "text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {LANG_LABELS[lng]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-8 text-center">
              <h1 className="text-2xl font-bold text-gray-900">{t("admin.login.title")}</h1>
              <p className="text-sm text-gray-500 mt-1">{t("admin.login.subtitle")}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t("admin.login.username")}</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] transition-all"
                    placeholder="admin"
                    required autoFocus autoComplete="username"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">{t("admin.login.password")}</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </span>
                  <input
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-11 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] transition-all"
                    required autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowPass((v) => !v)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass
                      ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                      : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    }
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t("admin.login.submitting")}
                  </span>
                ) : t("admin.login.submit")}
              </button>
            </form>
          </div>
        </div>
        <p className="text-center text-xs text-gray-400 mt-6">{t("admin.login.footer")}</p>
      </div>
    </div>
  );
}
