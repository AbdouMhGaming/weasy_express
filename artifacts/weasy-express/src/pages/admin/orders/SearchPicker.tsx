import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { normalizeLookup } from "./orderUpdates";

export type PickerOption = { value: string; label: string };

/** Searchable single-select. Only listed options can be chosen; free text never becomes a value. */
export function SearchPicker({ options, value, onChange, placeholder, emptyText, disabled, loading, loadingText, testId }: {
  options: PickerOption[]; value: string; onChange: (value: string) => void; placeholder: string;
  emptyText: string; disabled?: boolean; loading?: boolean; loadingText?: string; testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(o => o.value === value);
  const filtered = useMemo(() => {
    const q = normalizeLookup(query);
    return q ? options.filter(o => normalizeLookup(o.label).includes(q)) : options;
  }, [options, query]);

  return (
    <div className="min-w-0">
      <button
        type="button" disabled={disabled} data-testid={testId}
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        className="flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-60"
      >
        <span className={`truncate ${selected ? "" : "text-slate-400"}`}>{loading ? loadingText : selected?.label || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>
      {open && !disabled && (
        <div className="mt-1 rounded-md border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 px-2">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={placeholder}
              className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
          </div>
          <ul role="listbox" className="max-h-44 overflow-auto py-1">
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
        </div>
      )}
    </div>
  );
}
