import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./orderUpdatesI18n";

/** Viewport-bounded dialog portalled to body; header and footer stay visible, body scrolls. */
export function OrderFilterSheet({ title, onClose, onApply, onClear, children }: {
  title: string; onClose: () => void; onApply: () => void; onClear: () => void; children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        className="flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:max-w-md sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 p-4">
          <h3 className="font-bold text-slate-900">{title}</h3>
          <Button type="button" variant="ghost" size="icon" aria-label={t("orderUpdates.close")} onClick={onClose}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-white p-4">
          <Button type="button" variant="ghost" onClick={onClear}>{t("orderUpdates.filtersClear")}</Button>
          <Button type="button" className="bg-[#E10600] text-white hover:bg-[#C50500]" onClick={onApply}>{t("orderUpdates.filtersApply")}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
