import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, adminHeaders, readApiJson } from "@/lib/api";
import { useEcotrackWilayas, useEcotrackFees } from "@/hooks/use-ecotrack";
import { SearchPicker } from "./SearchPicker";
import { communeHasStopDesk, communesOfWilaya, normalizeLookup, quoteFromFees, sameId, stopDeskWilayas } from "./orderUpdates";
import "./orderUpdatesI18n";

/** Whole Ecotrack commune network (/get/communes without wilaya filter): authoritative source of has_stop_desk. */
export function useEcotrackAllCommunes() {
  return useQuery<any[]>({
    queryKey: ["ecotrack", "communes", "all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/expediteur/ecotrack/communes`, { headers: adminHeaders() });
      if (res.status === 401 || res.status === 403 || res.status === 409) throw new Error("disconnected");
      const body = await readApiJson(res);
      if (!res.ok || body?.ok === false) throw new Error(body?.error || "communes_failed");
      const raw = body.data?.data ?? body.data ?? [];
      return Object.values(raw).map((c: any) => ({ ...c, nom: c.nom ?? c.commune_name ?? c.name }));
    },
  });
}

type DestOpts = {
  wilayaId: string; commune: string; stopDesk: boolean;
  allowUnchanged?: boolean; keepCurrent?: boolean;
  /** Clear incompatible selections automatically (single form). Bulk clears only on explicit user action. */
  autoClear?: boolean; onClear?: (kind: "wilaya" | "commune") => void;
};

export function useDestination(o: DestOpts) {
  const wq = useEcotrackWilayas();
  const cq = useEcotrackAllCommunes();
  const wilayas: any[] = wq.data ?? [];
  const all: any[] = cq.data ?? [];
  const loading = wq.isLoading || cq.isLoading;
  const error = wq.isError || cq.isError;
  const ready = !loading && !error;
  const deskWilayas = useMemo(() => stopDeskWilayas(wilayas, all), [wilayas, all]);
  const wilaya = wilayas.find((w: any) => sameId(w.wilaya_id, o.wilayaId));
  const ofWilaya = useMemo(() => communesOfWilaya(wilaya, all), [wilaya, all]);
  const unchanged = Boolean(o.allowUnchanged) && o.commune === "__unchanged__";
  const matched = ofWilaya.find((c: any) => normalizeLookup(c.nom) === normalizeLookup(o.commune));
  const communeValid = unchanged || Boolean(matched);
  const communeDeskOk = Boolean(matched && communeHasStopDesk(matched));
  const wilayaDeskOk = Boolean(wilaya && deskWilayas.some((w: any) => String(w.wilaya_id) === String(wilaya.wilaya_id)));
  const deskOk = communeDeskOk && wilayaDeskOk;
  const wilayaList = o.stopDesk ? (ready ? deskWilayas : []) : wilayas;
  const communeList = o.stopDesk ? (ready ? ofWilaya.filter(communeHasStopDesk) : []) : ofWilaya;
  const wilayaOptions = wilayaList.map((w: any) => ({ value: String(w.wilaya_id), label: String(w.wilaya_name) }));
  if (o.keepCurrent && wilaya && !wilayaOptions.some(x => x.value === String(wilaya.wilaya_id))) wilayaOptions.push({ value: String(wilaya.wilaya_id), label: String(wilaya.wilaya_name) });
  const seen = new Set<string>();
  const communeOptions = communeList.filter((c: any) => { const k = normalizeLookup(c.nom); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((c: any) => ({ value: String(c.nom), label: String(c.nom) }));
  if (o.keepCurrent && matched && !communeOptions.some(x => normalizeLookup(x.value) === normalizeLookup(matched.nom))) communeOptions.push({ value: String(matched.nom), label: String(matched.nom) });

  const clearRef = useRef(o.onClear); clearRef.current = o.onClear;
  useEffect(() => {
    if (!o.autoClear || !o.stopDesk || !ready || !clearRef.current) return;
    if (o.wilayaId && !wilayaDeskOk) clearRef.current("wilaya");
    else if (o.wilayaId && o.commune && !unchanged && matched && !communeDeskOk) clearRef.current("commune");
  }, [o.autoClear, o.stopDesk, ready, o.wilayaId, o.commune, wilayaDeskOk, communeDeskOk, matched, unchanged]);

  return {
    wilayas, all, wilaya, ofWilaya, matched, communeValid, deskOk, unchanged, ready, loading, error,
    wilayaOptions, communeOptions, deskWilayas,
    noDesk: o.stopDesk && ready && deskWilayas.length === 0,
    retry: () => { void wq.refetch(); void cq.refetch(); },
  };
}
export type Destination = ReturnType<typeof useDestination>;

export function WilayaPicker({ dest, value, stopDesk, onChange, testId }: { dest: Destination; value: string; stopDesk: boolean; onChange: (v: string) => void; testId?: string }) {
  const { t } = useTranslation();
  return <SearchPicker testId={testId} options={dest.wilayaOptions} value={String(value)}
    placeholder={t("orderUpdates.pickWilaya")} emptyText={dest.error ? t("orderUpdates.destError") : t("orderUpdates.noResults")}
    disabled={dest.loading || dest.error} loading={dest.loading} loadingText={stopDesk ? t("orderUpdates.desksLoading") : t("admin.ecotrackPortal.common.loading")}
    onChange={onChange} />;
}

export function CommunePicker({ dest, wilayaId, value, onChange, unchangedLabel, testId }: { dest: Destination; wilayaId: string; value: string; onChange: (v: string) => void; unchangedLabel?: string; testId?: string }) {
  const { t } = useTranslation();
  const options = dest.unchanged && unchangedLabel ? [{ value: "__unchanged__", label: unchangedLabel }, ...dest.communeOptions] : dest.communeOptions;
  return <SearchPicker testId={testId} options={options} value={value}
    placeholder={wilayaId ? t("orderUpdates.pickCommune") : t("orderUpdates.chooseWilayaFirst")}
    emptyText={dest.error ? t("orderUpdates.destError") : t("orderUpdates.noResults")}
    disabled={!wilayaId || dest.loading || dest.error} loading={dest.loading} loadingText={t("orderUpdates.communesLoading")}
    onChange={onChange} />;
}

/** Fail-closed status line for destination data (loading / error+retry / no desk coverage). */
export function DestinationStatus({ dest, stopDesk }: { dest: Destination; stopDesk: boolean }) {
  const { t } = useTranslation();
  if (dest.loading) return <p className="text-xs text-slate-500">{stopDesk ? t("orderUpdates.desksLoading") : t("orderUpdates.communesLoading")}</p>;
  if (dest.error) return <p className="text-xs text-red-600">{t("orderUpdates.destError")} <button type="button" className="underline" onClick={dest.retry}>{t("orderUpdates.retry")}</button></p>;
  if (dest.noDesk) return <p className="text-xs text-red-600">{t("orderUpdates.desksNone")}</p>;
  return null;
}

const dzd = (n: number) => `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(n)} DA`;

/** Live fee preview derived from /get/fees. Nothing shown until BOTH wilaya and commune are valid. */
export function FeePreview({ wilayaId, communeValid, type, stopDesk, weight, compact }: {
  wilayaId: string; communeValid: boolean; type: string; stopDesk: boolean; weight: unknown; compact?: boolean;
}) {
  const { t } = useTranslation();
  const fees = useEcotrackFees();
  const q = useMemo(() => quoteFromFees(fees.data, wilayaId, type, stopDesk, weight), [fees.data, wilayaId, type, stopDesk, weight]);
  const gated = !wilayaId || !communeValid;
  const na = t("orderUpdates.feeUnavailable");
  let body: React.ReactNode;
  if (gated) body = <p className="text-slate-500">{compact ? "—" : t("orderUpdates.chooseDestination")}</p>;
  else if (fees.isLoading) body = <p className="text-slate-500">{t("orderUpdates.quoteLoading")}</p>;
  else if (fees.isError) body = <p className="text-red-600">{t("orderUpdates.quoteError")} <button type="button" className="underline" onClick={() => fees.refetch()}>{t("orderUpdates.retry")}</button></p>;
  else {
    const line = (label: string, v: React.ReactNode, strong?: boolean) => (
      <div className={compact ? "flex justify-between gap-2" : ""}><dt className={`text-slate-500 ${compact ? "" : "text-xs"}`}>{label}</dt><dd className={strong ? "font-bold" : "font-semibold"}>{v}</dd></div>
    );
    body = (
      <dl className={compact ? "space-y-0.5" : `grid grid-cols-1 gap-2 ${q.hasWeight ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {line(t("orderUpdates.deliveryFee"), q.delivery === null ? na : dzd(q.delivery))}
        {q.hasWeight && line(t("orderUpdates.weightFee"), q.weightUnavailable ? t("orderUpdates.weightPricingUnavailable") : dzd(q.weightFee ?? 0))}
        {line(t("orderUpdates.totalFee"), q.total === null ? na : dzd(q.total), true)}
      </dl>
    );
  }
  if (compact) return <div className="min-w-44 text-[11px] leading-tight" data-testid="row-fees">{body}</div>;
  return (
    <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm" data-testid="panel-fees">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">{t("orderUpdates.fees")}</p>
      {body}
    </div>
  );
}
