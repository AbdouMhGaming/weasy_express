import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE, expediteurHeaders, readApiJson } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ConnectionState = {
  connected: boolean;
  tokenHint: string | null;
  status: string;
  lastValidatedAt: string | null;
};

export default function EcotrackSettingsView() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [connection, setConnection] = useState<ConnectionState | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/expediteur/ecotrack/settings`, {
        headers: expediteurHeaders(),
      });
      const body = await readApiJson(response);
      if (!response.ok || !body.ok) throw new Error(body.error ?? "load_failed");
      setConnection(body);
    } catch {
      setMessage({ type: "error", text: t("admin.ecotrack.loadError") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!token.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/expediteur/ecotrack/settings`, {
        method: "PUT",
        headers: expediteurHeaders(),
        body: JSON.stringify({ token: token.trim() }),
      });
      const body = await readApiJson(response);
      if (!response.ok || !body.ok) {
        const key = body.error === "ecotrack_not_allowed"
          ? "notAllowed"
          : body.error === "root_account_required" || response.status === 403
            ? "rootAccountRequired"
          : body.error === "ecotrack_unavailable"
            ? "unavailable"
            : "invalid";
        throw new Error(key);
      }
      setToken("");
      setShowToken(false);
      queryClient.removeQueries({ queryKey: ["ecotrack"] });
      setMessage({ type: "success", text: t("admin.ecotrack.saved") });
      await load();
    } catch (error) {
      const allowedKeys = new Set(["notAllowed", "rootAccountRequired", "unavailable", "invalid"]);
      const errorKey = error instanceof Error ? error.message : "invalid";
      const key = allowedKeys.has(errorKey)
        ? errorKey
        : errorKey === "server_update_required" || errorKey === "invalid_server_response"
          ? "serverUpdateRequired"
          : "invalid";
      setMessage({ type: "error", text: t(`admin.ecotrack.${key}`) });
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(t("admin.ecotrack.disconnectConfirm"))) return;
    setRemoving(true);
    setMessage(null);
    try {
      const response = await fetch(`${API_BASE}/api/expediteur/ecotrack/settings`, {
        method: "DELETE",
        headers: expediteurHeaders(),
      });
      if (!response.ok) throw new Error();
      queryClient.removeQueries({ queryKey: ["ecotrack"] });
      setConnection({ connected: false, tokenHint: null, status: "disconnected", lastValidatedAt: null });
      setMessage({ type: "success", text: t("admin.ecotrack.disconnected") });
    } catch {
      setMessage({ type: "error", text: t("admin.ecotrack.removeError") });
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto w-full">
      <div className="mb-7">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{t("admin.ecotrack.title")}</h1>
        <p className="text-slate-500 mt-1">{t("admin.ecotrack.subtitle")}</p>
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex gap-4 items-start">
          <div className="h-11 w-11 shrink-0 rounded-xl bg-red-50 text-[#E10600] flex items-center justify-center">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900">{t("admin.ecotrack.connectionTitle")}</h2>
            <p className="text-sm text-slate-500 mt-1">{t("admin.ecotrack.connectionDescription")}</p>
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-5">
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#E10600]" /></div>
          ) : (
            <>
              {connection?.connected && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                  <div className="flex-1">
                    <p className="font-semibold text-emerald-900">{t("admin.ecotrack.connected")}</p>
                    <p className="text-sm text-emerald-700">
                      {t("admin.ecotrack.savedToken")} ••••••••{connection.tokenHint}
                    </p>
                  </div>
                  <Button variant="outline" onClick={disconnect} disabled={removing} className="border-red-200 text-red-600 hover:bg-red-50">
                    {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    <span className="ms-2">{t("admin.ecotrack.disconnect")}</span>
                  </Button>
                </div>
              )}

              <div>
                <label htmlFor="ecotrack-token" className="block text-sm font-semibold text-slate-800 mb-2">
                  {connection?.connected ? t("admin.ecotrack.replaceToken") : t("admin.ecotrack.tokenLabel")}
                </label>
                <div className="relative">
                  <Input
                    id="ecotrack-token"
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    className="h-12 pe-12 font-mono"
                    placeholder={t("admin.ecotrack.tokenPlaceholder")}
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((value) => !value)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                    aria-label={showToken ? t("admin.ecotrack.hideToken") : t("admin.ecotrack.showToken")}
                  >
                    {showToken ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex gap-3">
                <ShieldCheck className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600">{t("admin.ecotrack.securityNote")}</p>
              </div>

              {message && (
                <p className={`text-sm font-medium ${message.type === "success" ? "text-emerald-600" : "text-red-600"}`}>
                  {message.text}
                </p>
              )}

              <Button onClick={save} disabled={saving || !token.trim()} className="h-11 bg-[#E10600] hover:bg-[#C50500] text-white">
                {saving && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
                {saving ? t("admin.ecotrack.validating") : t("admin.ecotrack.save")}
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}