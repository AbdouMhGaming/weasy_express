import { useState, useMemo, useEffect } from "react";
import { useEcotrackFailures } from "@/hooks/use-ecotrack";
import { useTranslation } from "react-i18next";
import { AlertCircle, Eye, Filter, Loader2, PackageX, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WILAYA_LIST } from "@/lib/wilayas";

import { TrackingDetailModal } from "./EcotrackWorkspaceView";
import { PaginationBar } from "@/components/Pagination";

export default function EcotrackFailuresView() {
  const { t } = useTranslation();
  const [selectedWilaya, setSelectedWilaya] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [detailTracking, setDetailTracking] = useState<{tracking: string, expediteurId?: string | number} | null>(null);
  const [page, setPage] = useState(1);

  // Hardcode page size to what the backend returns or default to 20
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, error } = useEcotrackFailures({
    page, pageSize, search: debouncedSearch, wilaya: selectedWilaya
  });

  const clearFilters = () => {
    setSelectedWilaya("");
    setSearch("");
    setPage(1);
  };

  const activeFiltersCount = (selectedWilaya ? 1 : 0) + (debouncedSearch ? 1 : 0);
  const wilayaNames = useMemo(
    () => new Map(WILAYA_LIST.map((w) => [String(Number(w.code.replace("DZ", ""))), w.name])),
    []
  );

  const orders = data?.orders ?? [];
  const pagination = data?.pagination ?? { total: 0, last_page: 1 };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden bg-slate-50/50 p-4 sm:p-6 lg:p-8">
      <div className="mb-5 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-[#E10600]" />
        <div className="flex flex-col items-start justify-between gap-4 p-5 xl:flex-row xl:items-center">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-[#E10600]"><PackageX className="h-5 w-5" /></div>
          <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t("admin.sidebar.ecotrackFailures", "Échec de livraison")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("admin.ecotrackPortal.failures.subtitle", "Colis suspendus ou en échec nécessitant une attention.")}</p>
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 mt-3 text-xs">
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <Filter className="w-3 h-3" /> {t("admin.ecotrackDashboard.filters.active")}
              </span>
              <button onClick={clearFilters} className="text-slate-400 hover:text-slate-700 ml-1">
                ×
              </button>
            </div>
          )}
          </div>
        </div>
        
        <div className="flex flex-col gap-3 w-full xl:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("admin.ecotrackPortal.common.search")}
                className="pl-9 bg-white shadow-sm h-9"
              />
            </div>
            <select 
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 min-w-[150px]"
              value={selectedWilaya}
              onChange={e => { setSelectedWilaya(e.target.value); setPage(1); }}
            >
              <option value="">{t("admin.ecotrackDashboard.filters.allWilayas")}</option>
              {WILAYA_LIST.map((w: any) => {
                const wId = String(Number(w.code.replace("DZ", "")));
                return <option key={w.code} value={wId}>{w.name}</option>;
              })}
            </select>
          </div>
        </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading && orders.length === 0 ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#E10600]" /></div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-slate-50">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-slate-900 font-semibold">{t("admin.ecotrackPortal.common.error")}</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-slate-50">
            <PackageX className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">{t("admin.ecotrackPortal.failures.empty", "Aucun colis suspendu")}</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 h-full">
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.tracking")}</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.sender", "Expéditeur")}</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.destination")}</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.recipient")}</th>
                    <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.failures.lastUpdate", "Dernière mise à jour")}</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order: any) => (
                    <tr key={order.tracking} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">{order.tracking}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">{order.expediteur || '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-700">
                        {(() => {
                          const id = String(order.wilaya ?? "").replace(/^0+/, "");
                          const name = wilayaNames.get(id);
                          return name ? `${id}, ${name}` : <span className="text-slate-400">—</span>;
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{order.nom_client || order.client}</div>
                        <div className="text-xs text-slate-500">{order.telephone}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{order.date_maj || order.updated_at ? new Date(order.date_maj || order.updated_at).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => setDetailTracking({ tracking: order.tracking, expediteurId: order.expediteurId || order.owner_id })}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination.total > 0 && (
              <div className="shrink-0 border-t border-slate-200">
                <PaginationBar
                  page={page}
                  totalPages={pagination.last_page}
                  totalItems={pagination.total}
                  pageSize={pageSize}
                  setPage={setPage}
                  setPageSize={setPageSize}
                />
              </div>
            )}
          </div>
        )}
      </div>
      {detailTracking && <TrackingDetailModal tracking={detailTracking.tracking} expediteurId={detailTracking.expediteurId} onClose={() => setDetailTracking(null)} />}
    </div>
  );
}
