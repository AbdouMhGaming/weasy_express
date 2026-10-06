import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Loader2, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDeleteEcotrackOrder, useValidateEcotrackOrder } from "@/hooks/use-ecotrack";
import { API_BASE, authenticatedFetch, adminHeaders, readApiJson } from "@/lib/api";
import "./orderUpdatesI18n";

export function useTrackingSelection(resetKey: string) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { setSelected(new Set()); }, [resetKey]);
  const toggle = useCallback((tracking: string) => setSelected(prev => {
    const next = new Set(prev); next.has(tracking) ? next.delete(tracking) : next.add(tracking); return next;
  }), []);
  const setMany = useCallback((list: string[]) => setSelected(new Set(list)), []);
  const clear = useCallback(() => setSelected(new Set()), []);
  return { selected, toggle, setMany, clear };
}

export function ReadySelectionBar({ selected, pageTrackings, total, filterParams, onSetMany, onClear, onRemove }: {
  selected: Set<string>; pageTrackings: string[]; total: number; filterParams: Record<string, string>;
  onSetMany: (list: string[]) => void; onClear: () => void; onRemove: (done: string[]) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const del = useDeleteEcotrackOrder();
  const validate = useValidateEcotrackOrder();
  const delRef = useRef(del.mutateAsync); delRef.current = del.mutateAsync;
  const valRef = useRef(validate.mutateAsync); valRef.current = validate.mutateAsync;
  const [loadingAll, setLoadingAll] = useState(false);
  const [allError, setAllError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = useState<{ ok: number; failed: string[] } | null>(null);
  const busy = loadingAll || progress !== null;
  const allSelected = total > 0 && selected.size >= total;

  const selectAllFiltered = async () => {
    setLoadingAll(true); setAllError("");
    try {
      const qs = new URLSearchParams({ tracking_only: "1" });
      Object.entries(filterParams).forEach(([k, v]) => { if (v && !(k === "status" && v === "all")) qs.set(k, v); });
      const res = await authenticatedFetch(`${API_BASE}/api/expediteur/ecotrack/orders?${qs}`, { headers: adminHeaders() });
      const body = await readApiJson(res);
      if (!res.ok || !body.ok || !Array.isArray(body.trackings)) throw new Error(body.error || "load_failed");
      onSetMany(body.trackings.map(String));
    } catch (e) {
      setAllError(`${t("orderUpdates.selectAllError")} ${e instanceof Error ? e.message : ""}`);
    } finally { setLoadingAll(false); }
  };

  const run = async (kind: "ship" | "delete") => {
    const list = Array.from(selected);
    setProgress({ done: 0, total: list.length }); setReport(null);
    const ok: string[] = []; const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      try {
        if (kind === "delete") await delRef.current(list[i]);
        else await valRef.current({ tracking: list[i], ask_collection: false });
        ok.push(list[i]);
      } catch (e) { failed.push(`${list[i]}${e instanceof Error ? ` (${e.message})` : ""}`); }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    onRemove(ok);
    setReport({ ok: ok.length, failed });
    toast({
      title: failed.length ? t("orderUpdates.bulkPartial", { ok: ok.length, failed: failed.length }) : t("orderUpdates.bulkDone", { ok: ok.length }),
      variant: failed.length ? "destructive" : undefined,
    });
  };

  if (selected.size === 0 && !report && !allError) return null;
  return (
    <div className="mb-3 shrink-0 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm" data-testid="bar-selection">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{allSelected ? t("orderUpdates.allSelected", { count: total }) : t("orderUpdates.selected", { count: selected.size })}</span>
        {!allSelected && total > pageTrackings.length && selected.size > 0 && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void selectAllFiltered()}>
            {loadingAll && <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" />}
            {loadingAll ? t("orderUpdates.selectingAll") : t("orderUpdates.selectAll", { count: total })}
          </Button>
        )}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {progress && <span className="text-xs text-slate-500">{t("orderUpdates.working", progress)}</span>}
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { onClear(); setReport(null); setAllError(""); }}>{t("orderUpdates.clearSelection")}</Button>
          <Button type="button" size="sm" disabled={busy || selected.size === 0} className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => { if (window.confirm(t("orderUpdates.shipConfirm", { count: selected.size }))) void run("ship"); }}>
            <Truck className="me-1 h-3.5 w-3.5" />{t("orderUpdates.shipSelected")}
          </Button>
          <Button type="button" size="sm" disabled={busy || selected.size === 0} className="bg-red-600 text-white hover:bg-red-700" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="me-1 h-3.5 w-3.5" />{t("orderUpdates.deleteSelected")}
          </Button>
        </div>
      </div>
      {allError && <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600"><AlertCircle className="h-3.5 w-3.5" />{allError}</p>}
      {report && report.failed.length > 0 && (
        <div className="mt-2 max-h-24 overflow-auto rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          <p className="font-semibold">{t("orderUpdates.bulkPartial", { ok: report.ok, failed: report.failed.length })}</p>
          <ul className="mt-1 list-disc ps-4">{report.failed.map(f => <li key={f}>{f}</li>)}</ul>
        </div>
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div role="alertdialog" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="font-bold text-slate-900">{t("orderUpdates.deleteTitle", { count: selected.size })}</h3>
            <p className="mt-2 text-sm text-slate-600">{t("orderUpdates.deleteBody")}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setConfirmDelete(false)}>{t("orderUpdates.cancel")}</Button>
              <Button type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={() => { setConfirmDelete(false); void run("delete"); }}>{t("orderUpdates.confirmDelete")}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
