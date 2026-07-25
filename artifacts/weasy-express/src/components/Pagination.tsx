import { useState, useMemo } from "react";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

/**
 * Returns a sliced page of items plus controls.
 * Uses React's recommended "reset state when prop changes" pattern to reset
 * to page 1 whenever the `items` array reference changes (e.g. after a filter
 * or search update). This avoids useEffect-driven infinite-loop risks.
 */
export function usePagination<T>(items: T[], defaultPageSize = 10) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  // Track previous items reference to detect a filter/search change
  const [prevItems, setPrevItems] = useState<T[]>(items);

  // React-recommended pattern: synchronous state reset during render.
  // When items reference changes, reset page to 1 before this render commits.
  if (items !== prevItems) {
    setPrevItems(items);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;

  const paged = useMemo(
    () => items.slice(start, start + pageSize),
    [items, start, pageSize],
  );

  return {
    paged,
    page: safePage,
    setPage,
    pageSize,
    setPageSize: (s: number) => { setPageSize(s); setPage(1); },
    totalPages,
    totalItems: items.length,
  };
}

type PaginationBarProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
};

export function PaginationBar({
  page, totalPages, totalItems, pageSize, setPage, setPageSize,
}: PaginationBarProps) {
  if (totalItems === 0) return null;

  // Build page number list with smart ellipsis
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 flex-wrap gap-2 bg-gray-50/40">
      {/* Page-size selector */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <span>Afficher</span>
        <select
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="border border-gray-200 rounded-lg px-2 py-1 text-xs font-semibold bg-white focus:outline-none focus:ring-1 focus:ring-[#E10600]/30 focus:border-[#E10600] cursor-pointer"
        >
          {PAGE_SIZE_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <span className="text-gray-400 hidden sm:inline">{start}–{end} sur {totalItems}</span>
        <span className="text-gray-400 sm:hidden">{totalItems}</span>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="w-7 h-7 flex items-center justify-center text-xs text-gray-400">…</span>
            ) : (
              <button
                key={p}
                onClick={() => setPage(p as number)}
                className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                  page === p
                    ? "bg-[#E10600] text-white shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {p}
              </button>
            )
          )}
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
