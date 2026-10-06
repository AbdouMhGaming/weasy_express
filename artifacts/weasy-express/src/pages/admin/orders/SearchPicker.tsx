import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { normalizeLookup } from "./orderUpdates";

export type PickerOption = { value: string; label: string };

/** Searchable single-select rendered in a portal (never clipped by tables/modals). Only listed options can be chosen. */
export function SearchPicker({ options, value, onChange, placeholder, emptyText, disabled, loading, loadingText, testId }: {
  options: PickerOption[]; value: string; onChange: (value: string) => void; placeholder: string;
  emptyText: string; disabled?: boolean; loading?: boolean; loadingText?: string; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);
  const filtered = useMemo(() => {
    const q = normalizeLookup(query);
    return q ? options.filter(o => normalizeLookup(o.label).includes(q)) : options;
  }, [options, query]);

  const place = () => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 208);
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    const up = window.innerHeight - r.bottom < 260 && r.top > window.innerHeight - r.bottom;
    setPos({ left, width, up, top: up ? r.top - 4 : r.bottom + 4 });
  };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent | TouchEvent) => {
      const n = e.target as Node;
      if (!btn.current?.contains(n) && !pop.current?.contains(n)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const move = (e: Event) => { if (!pop.current?.contains(e.target as Node)) place(); };
    document.addEventListener("mousedown", down); document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place); window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("mousedown", down); document.removeEventListener("touchstart", down);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place); window.removeEventListener("scroll", move, true);
    };
  }, [open]);

  return (
    <div className="min-w-0">
      <button ref={btn} type="button" disabled={disabled} data-testid={testId}
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60">
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>{loading ? loadingText : selected?.label || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && !disabled && pos && createPortal(
        <div ref={pop} style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, transform: pos.up ? "translateY(-100%)" : undefined }}
          className="z-[100] rounded-md border border-slate-200 bg-white text-slate-900 shadow-lg">
          <div className="flex items-center gap-2 border-b border-slate-100 px-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
              className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
          </div>
          <ul role="listbox" className="max-h-52 overflow-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">{emptyText}</li>}
            {filtered.map(o => (
              <li key={o.value} role="option" aria-selected={o.value === value}>
                <button type="button" onClick={() => { onChange(o.value); setOpen(false); }}
                  className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm hover:bg-slate-50">
                  <span className="truncate">{o.label}</span>
                  {o.value === value && <Check className="h-4 w-4 shrink-0 text-[#E10600]" />}
                </button>
              </li>
            ))}
          </ul>
        </div>, document.body)}
    </div>
  );
}
