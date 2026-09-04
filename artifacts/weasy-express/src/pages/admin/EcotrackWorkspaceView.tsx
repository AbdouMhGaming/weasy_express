import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { 
  RefreshCw, Search, Plus, Download, Trash2, Edit2, 
  CheckCircle, ArrowLeftRight, X, AlertCircle, Loader2, Package, MapPin,
  Eye, MessageSquare, ListPlus, Truck, Settings2, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  useEcotrackDashboard, 
  useEcotrackOrders, 
  useEcotrackSync, 
  useEcotrackWilayas,
  useEcotrackCommunes,
  useEcotrackOrderCommune,
  useEcotrackDesks,
  useEcotrackFees,
  useEcotrackProducts,
  useCreateEcotrackOrder,
  useBulkCreateEcotrackOrders,
  useUpdateEcotrackOrder,
  useDeleteEcotrackOrder,
  useValidateEcotrackOrder,
  useRequestReturnEcotrackOrder,
  useLabelEcotrackOrder,
  useEcotrackOrderDetail,
  useAddEcotrackNote
} from "@/hooks/use-ecotrack";
import { PaginationBar } from "@/components/Pagination";
import { useToast } from "@/hooks/use-toast";

// Format numbers
const formatDZD = (num: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(num);
const readableLocation = (...values: unknown[]) => values
  .map(value => String(value ?? "").trim())
  .find(value => value.length > 0 && !/^\d+$/.test(value));

const ECOTRACK_STATUS_KEYS: Record<string, string> = {
  pret_a_expedier: "readyToShip",
  pret_a_preparer: "readyToPrepare",
  en_ramassage: "pickingUp",
  stock_en_preparation: "stockPreparing",
  vers_hub: "toHub",
  en_hub: "atHub",
  vers_wilaya: "toWilaya",
  en_preparation: "preparing",
  en_livraison: "outForDelivery",
  suspendu: "suspended",
  suspendus: "suspended",
  retour_chez_livreur: "returnWithDriver",
  retour_en_traitement: "returnProcessing",
  retour_en_transit: "returnInTransit",
  retour_en_stock: "returnInStock",
  livré_non_encaissé: "deliveredNotCollected",
  livre_non_encaisse: "deliveredNotCollected",
  encaissé_non_payé: "collectedNotPaid",
  encaisse_non_paye: "collectedNotPaid",
  paiement_prêt: "paymentReady",
  paiement_pret: "paymentReady",
  paiement_archivé: "paymentArchived",
  paiement_archive: "paymentArchived",
  order_information_received_by_carrier: "registered",
  picked: "picked",
  accepted_by_carrier: "acceptedAtStation",
  dispatched_to_driver: "dispatchedToDriver",
  attempt_delivery: "deliveryAttempt",
  return_asked: "returnRequested",
  return_received: "returnReceived",
  livred: "delivered",
  encaissed: "collected",
  payed: "paid",
};

function humanizeEcotrackStatus(status: unknown, t: (key: string) => string) {
  const raw = String(status ?? "").trim();
  if (!raw || /^\d+$/.test(raw)) return t("admin.ecotrackPortal.tracking.statusLabels.unknown");
  const normalized = raw.toLocaleLowerCase().replace(/[\s-]+/g, "_");
  const key = ECOTRACK_STATUS_KEYS[normalized];
  if (key) return t(`admin.ecotrackPortal.tracking.statusLabels.${key}`);
  const words = raw.replaceAll("_", " ");
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

export default function EcotrackWorkspaceView({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<"orders" | "tracking" | "config" | "products">("orders");

  const { data: dashboard, isLoading: isLoadingDashboard, error: dashboardError, refetch: refetchDashboard } = useEcotrackDashboard();
  const syncMutation = useEcotrackSync();

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: t("admin.ecotrackPortal.common.success") });
        refetchDashboard();
      },
      onError: (err) => {
        toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" });
      }
    });
  };

  if (dashboardError?.message === "disconnected") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[calc(100vh-4rem)] bg-slate-50">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">{t("admin.ecotrackPortal.disconnected")}</h2>
        {onOpenSettings && (
          <Button onClick={onOpenSettings} className="mt-4 bg-[#E10600]">
            {t("admin.ecotrackPortal.settingsButton")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0 z-10 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("admin.ecotrackPortal.title")}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
              {t("admin.ecotrackPortal.lastSync")}
              <span className="font-medium text-slate-700">
                {dashboard?.sync?.last_synced_at ? new Date(dashboard.sync.last_synced_at).toLocaleString() : t("admin.ecotrackPortal.never")}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleSync} disabled={syncMutation.isPending} className="text-slate-700 border-slate-200 hover:bg-slate-50">
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending ? t("admin.ecotrackPortal.syncing") : t("admin.ecotrackPortal.sync")}
            </Button>
          </div>
        </div>

        <div className="flex border-b border-slate-200 mt-2 gap-6">
          {(["orders", "tracking", "config", "products"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === tab ? 'text-[#E10600]' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {t(`admin.ecotrackPortal.tabs.${tab}`)}
              {activeTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#E10600] rounded-t-full" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "tracking" && <TrackingTab statuses={dashboard?.statuses || []} />}
        {activeTab === "config" && <ConfigTab />}
        {activeTab === "products" && <ProductsTab />}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ORDERS TAB
// -----------------------------------------------------------------------------
function OrdersTab() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data: ordersData, isLoading, isFetching, error } = useEcotrackOrders({ page, search: "", status: "all" });
  const { data: wilayas = [] } = useEcotrackWilayas();
  const wilayaNames = useMemo(
    () => new Map(wilayas.map((wilaya: any) => [String(wilaya.wilaya_id), wilaya.wilaya_name])),
    [wilayas],
  );

  const deleteMutation = useDeleteEcotrackOrder();
  const validateMutation = useValidateEcotrackOrder();
  const labelMutation = useLabelEcotrackOrder();

  const [selectedParcel, setSelectedParcel] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);

  const handleDelete = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackPortal.orders.deleteConfirm"))) return;
    deleteMutation.mutate(tracking, {
      onSuccess: () => toast({ title: t("admin.ecotrackPortal.common.success") }),
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  const handleShip = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackPortal.orders.shipConfirm"))) return;
    validateMutation.mutate({ tracking, ask_collection: false }, {
      onSuccess: () => toast({ title: t("admin.ecotrackPortal.common.success") }),
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  const handleDownloadLabel = (tracking: string) => {
    labelMutation.mutate(tracking, {
      onSuccess: (url) => {
        if (url) {
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
      },
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Button onClick={() => { setSelectedParcel(null); setIsModalOpen(true); }} className="bg-[#1a237e] hover:bg-[#11185b] text-white shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          {t("admin.ecotrackPortal.orders.addOne")}
        </Button>
        <Button onClick={() => setIsBulkModalOpen(true)} variant="outline" className="bg-white border-slate-200 text-slate-700 shadow-sm">
          <ListPlus className="h-4 w-4 mr-2" />
          {t("admin.ecotrackPortal.orders.addMultiple")}
        </Button>
        {isFetching && !isLoading && (
          <span className="ms-auto inline-flex items-center gap-2 text-xs font-medium text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#E10600]" />
            {t("admin.ecotrackPortal.orders.refreshing")}
          </span>
        )}
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#E10600]" /></div>
          ) : error ? (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
              <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
              <p className="text-slate-900 font-semibold">{t("admin.ecotrackPortal.common.error")}</p>
              <p className="text-sm text-slate-500 mt-1">{error.message}</p>
            </div>
          ) : ordersData?.data?.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
              <Package className="h-12 w-12 text-slate-200 mb-3" />
              <p className="text-slate-500 font-medium">{t("admin.ecotrackPortal.orders.empty")}</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.tracking")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.recipient")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.destination")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right">{t("admin.ecotrackPortal.orders.table.amount")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right">{t("admin.ecotrackPortal.orders.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ordersData?.data?.map((order: any) => (
                  (() => {
                    const wilayaName = wilayaNames.get(String(order.wilaya_id));
                    const communeName = readableLocation(order.commune_name, order.commune);
                    return (
                  <tr key={order.tracking} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-slate-900">{order.tracking}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.client}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{order.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700">{wilayaName || t("admin.ecotrackPortal.orders.destinationUnavailable")}</span>
                      </div>
                      {communeName && <div className="text-xs text-slate-500 mt-0.5 ml-5">{communeName}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatDZD(order.montant || 0)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-900" title={t("admin.ecotrackPortal.orders.modify")} onClick={() => { setSelectedParcel(order); setIsModalOpen(true); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title={t("admin.ecotrackPortal.orders.ship")} onClick={() => handleShip(order.tracking)}>
                          <Truck className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-900" title={t("admin.ecotrackPortal.orders.downloadLabel")} onClick={() => handleDownloadLabel(order.tracking)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 opacity-50 cursor-not-allowed" title={t("admin.ecotrackPortal.orders.validateReturn")}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" title={t("admin.ecotrackPortal.orders.delete")} onClick={() => handleDelete(order.tracking)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                    );
                  })()
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="shrink-0 bg-white border-t border-slate-200">
           <PaginationBar page={page} totalPages={ordersData?.pagination?.last_page ?? 1} totalItems={ordersData?.pagination?.total ?? 0} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
        </div>
      </div>

      {isModalOpen && <OrderFormModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} parcel={selectedParcel} isEdit={!!selectedParcel} />}
      {isBulkModalOpen && <BulkOrderModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// TRACKING TAB
// -----------------------------------------------------------------------------
function TrackingTab({ statuses }: { statuses: any[] }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: ordersData, isLoading, isFetching } = useEcotrackOrders({ page, search: debouncedSearch, status: statusFilter });
  const returnMutation = useRequestReturnEcotrackOrder();

  const [detailTracking, setDetailTracking] = useState<string | null>(null);
  const [noteTracking, setNoteTracking] = useState<string | null>(null);

  const handleRequestReturn = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackPortal.tracking.returnConfirm"))) return;
    returnMutation.mutate(tracking, {
      onSuccess: () => toast({ title: t("admin.ecotrackPortal.common.success") }),
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  const statusOptions = ["all", ...statuses.map((s: any) => s.status)];

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex flex-col sm:flex-row gap-3 mb-4 shrink-0">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.ecotrackPortal.common.search")}
            className="pl-9 bg-white shadow-sm"
          />
        </div>
        <div className="w-full sm:w-64 shrink-0">
          <label className="sr-only" htmlFor="tracking-status-filter">{t("admin.ecotrackPortal.tracking.filterStatus")}</label>
          <select
            id="tracking-status-filter"
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
            className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">{t("admin.ecotrackPortal.tracking.filterStatus")}: {t("admin.ecotrackPortal.common.all")}</option>
            {statusOptions.filter(status => status !== "all").map(status => {
              const statInfo = statuses.find((item: any) => item.status === status);
              return (
                <option key={status} value={status}>
                  {humanizeEcotrackStatus(status, t)}{statInfo?.count ? ` (${statInfo.count})` : ""}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#E10600]" /></div>
          ) : ordersData?.data?.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
              <Package className="h-12 w-12 text-slate-200 mb-3" />
              <p className="text-slate-500 font-medium">{t("admin.ecotrackPortal.orders.empty")}</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.tracking")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.tracking.status")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.recipient")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right">{t("admin.ecotrackPortal.orders.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 relative">
                {isFetching && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-20">
                    <Loader2 className="h-6 w-6 animate-spin text-[#E10600]" />
                  </div>
                )}
                {ordersData?.data?.map((order: any) => (
                  <tr key={order.tracking} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-slate-900">{order.tracking}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                       <StatusBadge status={order.status || order.global_status || order.process_state_id} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.client}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{order.phone}</div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title={t("admin.ecotrackPortal.tracking.trackOne")} onClick={() => setDetailTracking(order.tracking)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50" title={t("admin.ecotrackPortal.tracking.addNote")} onClick={() => setNoteTracking(order.tracking)}>
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50" title={t("admin.ecotrackPortal.tracking.requestReturn")} onClick={() => handleRequestReturn(order.tracking)}>
                          <ArrowLeftRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="shrink-0 bg-white border-t border-slate-200">
           <PaginationBar page={page} totalPages={ordersData?.pagination?.last_page ?? 1} totalItems={ordersData?.pagination?.total ?? 0} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} />
        </div>
      </div>

      {detailTracking && <TrackingDetailModal tracking={detailTracking} onClose={() => setDetailTracking(null)} />}
      {noteTracking && <AddNoteModal tracking={noteTracking} onClose={() => setNoteTracking(null)} />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// CONFIG TAB
// -----------------------------------------------------------------------------
function ConfigTab() {
  const { t } = useTranslation();

  const { data: wilayas, isLoading: isLoadingWilayas } = useEcotrackWilayas();
  const { data: desks, isLoading: isLoadingDesks } = useEcotrackDesks();
  const { data: fees, isLoading: isLoadingFees } = useEcotrackFees();

  const [selectedWilaya, setSelectedWilaya] = useState<string>("");
  const { data: communes, isLoading: isLoadingCommunes } = useEcotrackCommunes(selectedWilaya);

  return (
    <div className="p-6 h-full overflow-auto bg-slate-50">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto">

        {/* Wilayas */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400"/> {t("admin.ecotrackPortal.config.wilayas")}</h3>
          </div>
          <div className="flex-1 overflow-auto p-2">
            {isLoadingWilayas ? <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400"/></div> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {wilayas?.map((w: any) => (
                  <li key={w.wilaya_id} className="flex justify-between p-2 hover:bg-red-50 rounded-lg cursor-pointer" onClick={() => setSelectedWilaya(String(w.wilaya_id))}>
                    <span className="font-medium text-slate-800">{w.wilaya_name}</span>
                    <span className="text-slate-400 text-xs">{t("admin.ecotrackPortal.common.code")} {w.wilaya_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Communes */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400"/> {t("admin.ecotrackPortal.config.communes")}</h3>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {!selectedWilaya ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <Info className="w-8 h-8 mb-2 opacity-50"/>
                <p className="text-sm">{t("admin.ecotrackPortal.config.selectWilaya")}</p>
              </div>
            ) : isLoadingCommunes ? (
              <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400"/></div>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {communes?.map((c: any, i: number) => (
                  <li key={i} className="p-2"><span className="font-medium text-slate-700">{c.nom}</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Desks */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Settings2 className="w-4 h-4 text-slate-400"/> {t("admin.ecotrackPortal.config.desks")}</h3>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-slate-50">
            {isLoadingDesks ? <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400"/></div> : (
              <div className="space-y-3">
                {desks?.my_desk && (
                  <div className="rounded-xl border border-red-100 bg-red-50/60 p-3">
                    <p className="font-bold text-slate-900">{desks.my_desk.hub_name}</p>
                    <p className="text-sm text-slate-600 mt-1">{desks.my_desk.location?.commune}, {desks.my_desk.location?.wilaya}</p>
                    <p className="text-xs text-slate-500 mt-1">{desks.my_desk.location?.adresse}</p>
                  </div>
                )}
                {(Array.isArray(desks?.other_desks) ? desks.other_desks : []).map((desk: any, index: number) => (
                  <div key={`${desk.name}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                    <p className="font-semibold text-slate-900">{desk.name}</p>
                    <p className="text-sm text-slate-600 mt-1">{desk.commune}, {desk.wilaya}</p>
                    <p className="text-xs text-slate-500 mt-1">{desk.adresse}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Fees */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-[400px]">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-slate-900 flex items-center gap-2"><Settings2 className="w-4 h-4 text-slate-400"/> {t("admin.ecotrackPortal.config.fees")}</h3>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-slate-50">
            {isLoadingFees ? <div className="flex justify-center p-4"><Loader2 className="w-5 h-5 animate-spin text-slate-400"/></div> : (
              <div className="space-y-4">
                {Object.entries(fees || {}).filter(([, value]) => Array.isArray(value)).map(([service, rows]) => (
                  <div key={service}>
                    <p className="text-xs font-bold uppercase tracking-wide text-[#E10600] mb-2">{service}</p>
                    <div className="overflow-hidden rounded-lg border border-slate-200">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 text-slate-600">
                          <tr>
                            <th className="p-2 text-start">{t("admin.ecotrackPortal.forms.wilaya")}</th>
                            <th className="p-2 text-end">{t("admin.ecotrackPortal.config.homeFee")}</th>
                            <th className="p-2 text-end">{t("admin.ecotrackPortal.config.deskFee")}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {(rows as any[]).map((fee: any) => (
                            <tr key={`${service}-${fee.wilaya_id}`}>
                              <td className="p-2">{fee.wilaya_id}</td>
                              <td className="p-2 text-end font-medium">{fee.tarif} DA</td>
                              <td className="p-2 text-end">{fee.tarif_stopdesk} DA</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// PRODUCTS TAB
// -----------------------------------------------------------------------------
function ProductsTab() {
  const { t } = useTranslation();
  const { data, isLoading } = useEcotrackProducts();

  return (
    <div className="p-6 h-full flex flex-col">
      <h2 className="text-lg font-bold text-slate-900 mb-4">{t("admin.ecotrackPortal.products.list")}</h2>
      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#E10600]" /></div>
          ) : !data?.products || data.products.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
              <Package className="h-12 w-12 text-slate-200 mb-3" />
              <p className="text-slate-500 font-medium">{t("admin.ecotrackPortal.products.empty")}</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.products.name")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.products.reference")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.products.available")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.products.reserved")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.products.map((p: any) => (
                  <tr key={p.reference || p.barcode} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900">{p.title}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{p.reference || p.barcode}</td>
                    <td className="px-4 py-3 text-slate-700">{p.stock_disponible ?? 0}</td>
                    <td className="px-4 py-3 text-slate-700">{p.stock_reserve ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// MODALS
// -----------------------------------------------------------------------------
function OrderFormModal({ isOpen, onClose, parcel, isEdit }: { isOpen: boolean; onClose: () => void; parcel: any; isEdit: boolean; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const createMutation = useCreateEcotrackOrder();
  const updateMutation = useUpdateEcotrackOrder();
  const { data: wilayas } = useEcotrackWilayas();
  const { data: savedCommuneName, isLoading: isLoadingSavedCommune } = useEcotrackOrderCommune(
    isEdit ? parcel?.tracking : undefined,
    isEdit ? String(parcel?.wilaya_id ?? "") : undefined,
  );
  
  const [formData, setFormData] = useState<any>(() => parcel ? {
    reference: parcel.reference ?? "",
    client: parcel.client ?? "",
    phone: parcel.phone ?? "",
    phone_2: parcel.phone_2 ?? "",
    adresse: parcel.adresse ?? "",
    wilaya_id: String(parcel.wilaya_id ?? ""),
    commune_name: parcel.commune_name || parcel.commune || (parcel.commune_id ? "__unchanged__" : ""),
    montant: parcel.montant ?? "",
    products: parcel.products ?? "",
    weight: parcel.weight ?? "",
    remarque: parcel.remarque ?? "",
    type: String(parcel.type_id ?? parcel.type ?? "1"),
    stop_desk: Boolean(parcel.stop_desk),
    fragile: parcel.fragile == null ? null : Boolean(parcel.fragile),
  } : {
    reference: "", client: "", phone: "", phone_2: "", adresse: "", wilaya_id: "",
    commune_name: "", montant: "", products: "", weight: "", stop_desk: false,
    fragile: false, remarque: "", type: "1",
  });

  const { data: communes } = useEcotrackCommunes(formData.wilaya_id);

  useEffect(() => {
    if (isEdit && formData.commune_name === "__unchanged__" && savedCommuneName) {
      setFormData((current: any) => ({ ...current, commune_name: savedCommuneName }));
    }
  }, [isEdit, formData.commune_name, savedCommuneName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const communeVal = formData.commune_name === "__unchanged__"
      ? undefined
      : communes?.find((c: any) => c.nom === formData.commune_name)?.nom || formData.commune_name;

    if (isEdit && parcel) {
      const payload = {
        tracking: parcel.tracking, client: formData.client, tel: formData.phone, tel2: formData.phone_2,
        adresse: formData.adresse, commune: communeVal, wilaya: formData.wilaya_id, montant: formData.montant,
        remarque: formData.remarque, product: formData.products, weight: formData.weight, type: Number(formData.type || 1),
        stop_desk: formData.stop_desk ? 1 : 0,
        fragile: formData.fragile == null ? undefined : formData.fragile ? 1 : 0,
      };
      updateMutation.mutate(payload, {
        onSuccess: () => { toast({ title: t("admin.ecotrackPortal.common.success") }); onClose(); },
        onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
      });
    } else {
      const payload = {
        nom_client: formData.client, telephone: formData.phone, telephone_2: formData.phone_2,
        adresse: formData.adresse, commune: communeVal, code_wilaya: formData.wilaya_id, montant: formData.montant,
        type: Number(formData.type || 1), reference: formData.reference, remarque: formData.remarque,
        produit: formData.products, weight: formData.weight, stop_desk: formData.stop_desk ? 1 : 0, fragile: formData.fragile ? 1 : 0
      };
      createMutation.mutate(payload, {
        onSuccess: () => { toast({ title: t("admin.ecotrackPortal.common.success") }); onClose(); },
        onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
      });
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{isEdit ? t("admin.ecotrackPortal.orders.modify") : t("admin.ecotrackPortal.orders.addOne")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="p-5 overflow-auto flex-1">
          <form id="order-form" onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-2 md:col-span-1 space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.client")}</label>
              <Input required value={formData.client} onChange={e => setFormData({ ...formData, client: e.target.value })} />
            </div>
             <div className="col-span-2 md:col-span-1 space-y-1">
               <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.reference")}</label>
               <Input value={formData.reference} onChange={e => setFormData({ ...formData, reference: e.target.value })} />
             </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.phone")}</label>
              <Input required value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.phone2")}</label>
              <Input value={formData.phone_2} onChange={e => setFormData({ ...formData, phone_2: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.address")}</label>
              <Input required value={formData.adresse} onChange={e => setFormData({ ...formData, adresse: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.wilaya")}</label>
              <select required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={formData.wilaya_id} onChange={e => setFormData({ ...formData, wilaya_id: e.target.value, commune_name: "" })}>
                <option value="">{t("admin.ecotrackPortal.forms.wilaya")}</option>
                 {wilayas?.map((w: any) => <option key={w.wilaya_id} value={w.wilaya_id}>{w.wilaya_name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.commune")}</label>
              <select required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={formData.commune_name} onChange={e => setFormData({ ...formData, commune_name: e.target.value })}>
                <option value="">{t("admin.ecotrackPortal.forms.commune")}</option>
                 {isEdit && formData.commune_name === "__unchanged__" && (
                   <option value="__unchanged__">{isLoadingSavedCommune ? t("admin.ecotrackPortal.common.loading") : t("admin.ecotrackPortal.forms.currentCommune")}</option>
                 )}
                {communes?.map((c: any, i: number) => <option key={i} value={c.nom}>{c.nom}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.amount")}</label>
              <Input required type="number" value={formData.montant} onChange={e => setFormData({ ...formData, montant: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.products")}</label>
              <Input value={formData.products} onChange={e => setFormData({ ...formData, products: e.target.value })} />
            </div>
             <div className="space-y-1">
               <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.weight")}</label>
               <Input type="number" min="0" step="0.01" value={formData.weight} onChange={e => setFormData({ ...formData, weight: e.target.value })} />
             </div>
             <div className="space-y-1">
               <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.operationType")}</label>
               <select required className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                 <option value="1">{t("admin.ecotrackPortal.forms.delivery")}</option>
                 <option value="2">{t("admin.ecotrackPortal.forms.exchange")}</option>
               </select>
             </div>
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-semibold text-slate-600">{t("admin.ecotrackPortal.forms.remark")}</label>
              <Input value={formData.remarque} onChange={e => setFormData({ ...formData, remarque: e.target.value })} />
            </div>
            <div className="col-span-2 flex gap-4 mt-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={formData.stop_desk} onChange={e => setFormData({ ...formData, stop_desk: e.target.checked })} />
                {t("admin.ecotrackPortal.forms.stopDesk")}
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                 <input type="checkbox" checked={Boolean(formData.fragile)} onChange={e => setFormData({ ...formData, fragile: e.target.checked })} />
                {t("admin.ecotrackPortal.forms.fragile")}
              </label>
            </div>
          </form>
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <Button variant="ghost" onClick={onClose}>{t("admin.ecotrackPortal.common.cancel")}</Button>
          <Button type="submit" form="order-form" className="bg-[#E10600] text-white" disabled={createMutation.isPending || updateMutation.isPending}>
            {createMutation.isPending || updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
            {t("admin.ecotrackPortal.common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BulkOrderModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const mutation = useBulkCreateEcotrackOrders();
  const { data: wilayas = [] } = useEcotrackWilayas();

  const addRow = () => {
    if (rows.length >= 100) return;
    setRows(prev => [...prev, {
      id: Date.now() + prev.length, reference: "", nom_client: "", telephone: "", telephone_2: "",
      adresse: "", code_wilaya: "", commune: "", montant: "", produit: "", weight: "", type: "1",
      remarque: "", stop_desk: 0, fragile: 0,
    }]);
  };
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const updateRow = (id: number, field: string, value: string | number) => setRows(prev => prev.map(r => r.id === id ? {
    ...r,
    [field]: value,
    ...(field === "code_wilaya" ? { commune: "" } : {}),
  } : r));

  const submit = () => {
    if (rows.length === 0) return;
    const incomplete = rows.some(row => !row.nom_client || !row.telephone || !row.adresse || !row.code_wilaya || !row.commune || row.montant === "");
    if (incomplete) {
      toast({ title: t("admin.ecotrackPortal.orders.bulkModal.required"), variant: "destructive" });
      return;
    }
    const orders = rows.map(({ id, ...rest }) => rest);
    mutation.mutate(orders, {
      onSuccess: () => { toast({ title: t("admin.ecotrackPortal.common.success") }); onClose(); },
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-[96vw] max-w-[96vw] max-h-[92vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{t("admin.ecotrackPortal.orders.bulkModal.title")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="p-4 flex gap-2 border-b border-slate-100 bg-slate-50">
          <Button variant="outline" onClick={addRow}><Plus className="w-4 h-4 mr-2"/> {t("admin.ecotrackPortal.orders.bulkModal.addRow")}</Button>
        </div>
        <div className="p-0 overflow-auto flex-1 bg-white">
          {rows.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-400">
              {t("admin.ecotrackPortal.orders.bulkModal.clear")}
            </div>
          ) : (
            <table className="min-w-[2100px] w-full text-xs text-left">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                   <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.reference")}</th>
                  <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.client")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.phone")}*</th>
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.phone2")}</th>
                  <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.wilaya")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.commune")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.address")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.amount")}*</th>
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.products")}</th>
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.weight")}</th>
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.operationType")}*</th>
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.remark")}</th>
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.stopDesk")}</th>
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.fragile")}</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {rows.map((row, index) => (
                   <BulkOrderRow key={row.id} row={row} index={index} wilayas={wilayas} updateRow={updateRow} removeRow={removeRow} />
                 ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <Button variant="ghost" onClick={onClose}>{t("admin.ecotrackPortal.common.cancel")}</Button>
          <Button onClick={submit} disabled={mutation.isPending || rows.length === 0} className="bg-[#E10600] text-white">
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
            {t("admin.ecotrackPortal.orders.bulkModal.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function BulkOrderRow({ row, index, wilayas, updateRow, removeRow }: {
  row: any;
  index: number;
  wilayas: any[];
  updateRow: (id: number, field: string, value: string | number) => void;
  removeRow: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { data: communes = [], isLoading: communesLoading } = useEcotrackCommunes(row.code_wilaya);
  const cellInput = (field: string, options: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input {...options} className="h-8 min-w-28 text-xs" value={row[field]} onChange={event => updateRow(row.id, field, event.target.value)} />
  );

  return (
    <tr className="align-top odd:bg-white even:bg-slate-50/60">
      <td className="px-2 py-2 font-bold text-slate-500">{index + 1}</td>
      <td className="px-2 py-2">{cellInput("reference")}</td>
      <td className="px-2 py-2">{cellInput("nom_client", { required: true })}</td>
      <td className="px-2 py-2">{cellInput("telephone", { required: true })}</td>
      <td className="px-2 py-2">{cellInput("telephone_2")}</td>
      <td className="px-2 py-2">
        <select required className="h-8 min-w-40 rounded-md border border-input bg-white px-2 text-xs" value={row.code_wilaya} onChange={event => updateRow(row.id, "code_wilaya", event.target.value)}>
          <option value="">{t("admin.ecotrackPortal.forms.chooseWilaya")}</option>
          {wilayas.map((wilaya: any) => <option key={wilaya.wilaya_id} value={wilaya.wilaya_id}>{wilaya.wilaya_name}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">
        <select required disabled={!row.code_wilaya || communesLoading} className="h-8 min-w-40 rounded-md border border-input bg-white px-2 text-xs disabled:bg-slate-100" value={row.commune} onChange={event => updateRow(row.id, "commune", event.target.value)}>
          <option value="">{communesLoading ? t("admin.ecotrackPortal.common.loading") : t("admin.ecotrackPortal.forms.chooseCommune")}</option>
          {communes.map((commune: any, communeIndex: number) => <option key={`${commune.nom}-${communeIndex}`} value={commune.nom}>{commune.nom}</option>)}
        </select>
      </td>
      <td className="px-2 py-2">{cellInput("adresse", { required: true })}</td>
      <td className="px-2 py-2">{cellInput("montant", { required: true, type: "number", min: 0 })}</td>
      <td className="px-2 py-2">{cellInput("produit")}</td>
      <td className="px-2 py-2">{cellInput("weight", { type: "number", min: 0, step: 0.01 })}</td>
      <td className="px-2 py-2">
        <select className="h-8 min-w-32 rounded-md border border-input bg-white px-2 text-xs" value={row.type} onChange={event => updateRow(row.id, "type", event.target.value)}>
          <option value="1">{t("admin.ecotrackPortal.forms.delivery")}</option>
          <option value="2">{t("admin.ecotrackPortal.forms.exchange")}</option>
        </select>
      </td>
      <td className="px-2 py-2">{cellInput("remarque")}</td>
      <td className="px-2 py-2 text-center"><input type="checkbox" checked={Boolean(row.stop_desk)} onChange={event => updateRow(row.id, "stop_desk", event.target.checked ? 1 : 0)} /></td>
      <td className="px-2 py-2 text-center"><input type="checkbox" checked={Boolean(row.fragile)} onChange={event => updateRow(row.id, "fragile", event.target.checked ? 1 : 0)} /></td>
      <td className="px-2 py-2"><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeRow(row.id)}><Trash2 className="w-4 h-4"/></Button></td>
    </tr>
  );
}

function TrackingDetailModal({ tracking, onClose }: { tracking: string; onClose: () => void; }) {
  const { t } = useTranslation();
  const { data, isLoading } = useEcotrackOrderDetail(tracking);

  if (!tracking) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold flex items-center gap-2">{t("admin.ecotrackPortal.tracking.trackOne")} <span className="font-mono text-sm bg-slate-100 px-2 py-1 rounded text-slate-600">{tracking}</span></h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="p-5 overflow-auto flex-1 bg-slate-50">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-[#E10600]" /></div>
          ) : (
            <div className="space-y-6">
              {data?.events?.length > 0 ? (
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-slate-200">
                  {data.events.map((ev: any, idx: number) => (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-slate-200 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                      <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900 text-sm">{humanizeEcotrackStatus(ev.status, t)}</span>
                          <span className="text-xs font-medium text-slate-400">{[ev.date, ev.time].filter(Boolean).join(" ")}</span>
                        </div>
                        {ev.station && <p className="text-xs font-medium text-slate-500 mt-2">{ev.station}</p>}
                        {ev.reason && ev.reason !== ev.status && <p className="text-sm text-slate-700 mt-2">{ev.reason}</p>}
                        {ev.details && <p className="text-sm text-slate-600 mt-1">{ev.details}</p>}
                        {ev.postponedTo && <p className="text-xs text-amber-700 mt-2">{t("admin.ecotrackPortal.tracking.postponedTo")}: {ev.postponedTo}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center text-slate-400 py-8">{t("admin.ecotrackPortal.common.empty")}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AddNoteModal({ tracking, onClose }: { tracking: string; onClose: () => void; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const mutation = useAddEcotrackNote();

  const submit = () => {
    mutation.mutate({ tracking, content: note }, {
      onSuccess: () => { toast({ title: t("admin.ecotrackPortal.common.success") }); onClose(); },
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-100">
          <h2 className="text-xl font-bold">{t("admin.ecotrackPortal.tracking.addNote")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="p-5">
          <p className="text-sm font-mono text-slate-500 mb-2">{tracking}</p>
          <textarea
            className="w-full h-32 p-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-[#E10600] resize-none"
            placeholder={t("admin.ecotrackPortal.forms.remark")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <Button variant="ghost" onClick={onClose}>{t("admin.ecotrackPortal.common.cancel")}</Button>
          <Button onClick={submit} disabled={mutation.isPending || !note.trim()} className="bg-[#E10600] text-white">
            {mutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
            {t("admin.ecotrackPortal.common.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string | number }) {
  const { t } = useTranslation();
  if (status === undefined || status === null) return null;
  const s = status.toString().toLowerCase();
  let bg = "bg-slate-100 text-slate-700 border-slate-200";
  let dot = "bg-slate-400";
  if (s.includes('livr') || s.includes('deliver')) { bg = "bg-emerald-50 text-emerald-700 border-emerald-200"; dot = "bg-emerald-500"; }
  else if (s.includes('transit') || s.includes('expedi')) { bg = "bg-blue-50 text-blue-700 border-blue-200"; dot = "bg-blue-500"; }
  else if (s.includes('attente') || s.includes('pend')) { bg = "bg-amber-50 text-amber-700 border-amber-200"; dot = "bg-amber-500"; }
  else if (s.includes('draft') || s.includes('brouillon')) { bg = "bg-slate-100 text-slate-600 border-slate-200"; dot = "bg-slate-400"; }
  else if (s.includes('valid')) { bg = "bg-purple-50 text-purple-700 border-purple-200"; dot = "bg-purple-500"; }
  else if (s.includes('retour') || s.includes('echou') || s.includes('fail')) { bg = "bg-red-50 text-red-700 border-red-200"; dot = "bg-red-500"; }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold border whitespace-nowrap ${bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {humanizeEcotrackStatus(status, t)}
    </span>
  );
}
