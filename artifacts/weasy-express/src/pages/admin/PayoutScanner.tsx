import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

export function PayoutScanner({ onClose }: { onClose: () => void }) {
  const scanner = useRef<Html5Qrcode | null>(null);
  const matched = useRef(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);

  const handleCode = (raw: string) => {
    try {
      const url = new URL(raw);
      if (url.origin !== window.location.origin ||
          !/^\/expediteurs\/payout-confirm\/[1-9]\d*$/.test(url.pathname) ||
          !url.searchParams.get("token")) {
        setError("Ce QR code n'est pas un reçu Weasy Express valide.");
        return;
      }
      if (matched.current) return;
      matched.current = true;
      window.location.assign(`${url.pathname}${url.search}`);
    } catch {
      setError("Ce QR code n'est pas un reçu Weasy Express valide.");
    }
  };

  useEffect(() => {
    const reader = new Html5Qrcode("payout-qr-reader", {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
    scanner.current = reader;
    let cancelled = false;
    reader.start({ facingMode: "environment" }, {
      fps: 10,
      qrbox: (width, height) => {
        const side = Math.min(260, Math.floor(Math.min(width, height) * 0.8));
        return { width: side, height: side };
      },
    }, handleCode, () => {}).then(() => {
      if (cancelled) void reader.stop().catch(() => {});
      else setReady(true);
    }).catch(() => {
      if (!cancelled) setError("Caméra indisponible. Autorisez la caméra ou importez une photo du QR code.");
    });
    return () => {
      cancelled = true;
      scanner.current = null;
      void (async () => {
        try { if (reader.isScanning) await reader.stop(); } catch { /* already stopped */ }
        try { reader.clear(); } catch { /* already cleared */ }
      })();
    };
  }, []);

  const scanPhoto = async (file?: File) => {
    if (!file || !scanner.current) return;
    setError("");
    try {
      if (scanner.current.isScanning) {
        await scanner.current.stop();
        setReady(false);
      }
      const result = await scanner.current.scanFile(file, true);
      handleCode(result);
    } catch {
      setError("QR code introuvable sur cette image. Réessayez avec une photo nette.");
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-3" role="dialog" aria-modal="true" aria-label="Scanner un reçu">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Scanner un reçu</h2>
            <p className="mt-1 text-sm text-slate-500">وجّه الكاميرا إلى رمز QR · Visez le QR du reçu imprimé.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg px-2 py-1 text-xl text-slate-500 hover:bg-slate-100">×</button>
        </div>
        <div id="payout-qr-reader" className="mt-4 overflow-hidden rounded-xl bg-slate-950" />
        {!ready && !error && <p className="mt-3 text-center text-sm text-slate-500">Ouverture de la caméra…</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label className="mt-4 flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Importer une photo du QR / رفع صورة الرمز
          <input type="file" accept="image/*" className="sr-only" onChange={e => void scanPhoto(e.target.files?.[0])} />
        </label>
        <p className="mt-3 text-center text-xs text-slate-500">Seul le compte Expéditeur propriétaire peut confirmer le paiement.</p>
      </div>
    </div>
  );
}