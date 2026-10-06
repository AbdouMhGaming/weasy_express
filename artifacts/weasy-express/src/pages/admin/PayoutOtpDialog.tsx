import { useState } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";
import "@/lib/portalUpdatesI18n";
import type { PayoutRequest } from "./PayoutsRequestView";

export function PayoutOtpDialog({ payout, onClose, onConfirmed, onUnauth }: {
  payout: PayoutRequest; onClose: () => void; onConfirmed: () => void; onUnauth: () => void;
}) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function request(confirm = false) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API_BASE}/api/expediteur/payouts/${payout.id}/otp${confirm ? "/confirm" : ""}`, {
        method: "POST", headers: adminHeaders(), body: JSON.stringify(confirm ? { code } : {}),
      });
      if (res.status === 401) { onUnauth(); return; }
      const body = await res.json();
      if (!res.ok || !body.ok) {
        const key = ({ otp_invalid: "otpInvalid", otp_expired: "otpExpired", otp_rate_limited: "otpRateLimited" } as Record<string, string>)[body.error] ?? "otpError";
        throw new Error(t(`portalUpdates.${key}`));
      }
      if (confirm) onConfirmed();
      else { setSent(true); setCode(""); }
    } catch (e) { setError(e instanceof Error ? e.message : t("portalUpdates.otpError")); }
    finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="payout-otp-heading">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 text-gray-900 shadow-xl">
        <h2 id="payout-otp-heading" className="text-lg font-bold">{t("portalUpdates.otpTitle")}</h2>
        <p className="mt-2 text-sm font-semibold">{payout.expediteur_username} · {payout.amount_dzd.toLocaleString()} DZD · #{payout.id}</p>
        <p className="mt-3 text-sm text-gray-600">{t("portalUpdates.otpInstructions")}</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {sent && <p role="status" className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">{t("portalUpdates.otpSent")}</p>}
        <button type="button" disabled={busy} onClick={() => request()} className="mt-4 w-full rounded-xl border border-gray-300 p-2.5 text-sm font-semibold disabled:opacity-50">
          {t(sent ? "portalUpdates.otpResend" : "portalUpdates.otpSend")}
        </button>
        <form onSubmit={e => { e.preventDefault(); void request(true); }}>
          <label className="mt-4 block text-sm font-medium" htmlFor="payout-otp-code">{t("portalUpdates.otpCode")}</label>
          <input id="payout-otp-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-3 text-center text-xl tracking-[.2em]" dir="ltr" />
          <div className="mt-5 flex gap-3">
            <button type="button" disabled={busy} onClick={onClose} className="flex-1 rounded-xl border border-gray-300 p-2.5 text-sm">{t("portalUpdates.otpCancel")}</button>
            <button type="submit" disabled={busy || code.length !== 6} className="flex-1 rounded-xl bg-[#E10600] p-2.5 text-sm font-bold text-white disabled:opacity-50">{busy ? "…" : t("portalUpdates.otpConfirm")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
