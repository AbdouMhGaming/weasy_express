import { useEffect, useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders, authenticatedFetch } from "@/lib/api";

export const MAX_PRODUCT_PHOTO_BYTES = 5 * 1024 * 1024;

export function validateProductPhoto(file: File): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "invalid_photo";
  if (file.size === 0) return "invalid_photo";
  if (file.size > MAX_PRODUCT_PHOTO_BYTES) return "photo_too_large";
  return null;
}

/** Fetch private photos with the current portal's bearer token, never a public URL. */
export function ProductPhoto({ src, alt, revision, preview = false }: {
  src: string; alt: string; revision: number; preview?: boolean;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    const controller = new AbortController();
    setUrl("");
    setFailed(false);
    authenticatedFetch(`${API_BASE}${src}`, {
      headers: adminHeaders(), signal: controller.signal, cache: "no-store",
    }).then(async res => {
      if (!res.ok) throw new Error("photo_failed");
      const blob = await res.blob();
      if (!blob.size || !blob.type.startsWith("image/")) throw new Error("photo_failed");
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, revision, retry]);
  const cls = preview
    ? "flex min-h-32 w-full items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-3"
    : "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50";
  return <div className={cls}>
    {failed ? <button type="button" onClick={() => setRetry(n => n + 1)}
      title={t("admin.ecotrackPortal.products.photoRetry")}
      aria-label={t("admin.ecotrackPortal.products.photoRetry")}
      className="flex flex-col items-center gap-1 text-xs text-red-600">
      <ImageOff className="h-5 w-5" />
      {preview && t("admin.ecotrackPortal.products.photoRetry")}
    </button> : url ? <img src={url} alt={alt} onError={() => setFailed(true)}
      className={preview ? "max-h-56 max-w-full rounded object-contain" : "h-full w-full rounded-lg object-cover"} />
      : <Loader2 aria-label={t("admin.ecotrackPortal.products.photoLoading")} className="h-5 w-5 animate-spin text-slate-400" />}
  </div>;
}

export function SelectedProductPhoto({ file, alt, onInvalid }: {
  file: File; alt: string; onInvalid: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <img src={url} alt={alt} onError={onInvalid}
    className="mx-auto max-h-56 max-w-full rounded-lg object-contain" /> : null;
}
