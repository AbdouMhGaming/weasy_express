import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { 
  Search, Plus, Download, Trash2, Edit2,
  CheckCircle, ArrowLeftRight, X, AlertCircle, Loader2, Package, MapPin,
  Eye, MessageSquare, ListPlus, Truck, FileSpreadsheet, Upload, SlidersHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  useEcotrackDashboard, 
  useEcotrackOrders, 
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
  useAddEcotrackNote,
  useEcotrackSync
} from "@/hooks/use-ecotrack";
import type { EcotrackOrderSort } from "@/hooks/use-ecotrack";
import type { EcotrackOrderFilters } from "@/hooks/use-ecotrack";
import { PaginationBar } from "@/components/Pagination";
import { useToast } from "@/hooks/use-toast";

// Format numbers
const formatDZD = (num: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(num);
const readableLocation = (...values: unknown[]) => values
  .map(value => String(value ?? "").trim())
  .find(value => value.length > 0 && !/^\d+$/.test(value));
const normalizeOrderPhone = (value: unknown) => {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.startsWith("213") && digits.length === 12 ? `0${digits.slice(3)}` : digits;
};
const normalizeEcotrackLookup = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLocaleLowerCase();
const ecotrackFailureText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(ecotrackFailureText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(ecotrackFailureText).filter(Boolean).join(" ");
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
};

const ECOTRACK_STATUS_KEYS: Record<string, string> = {
  pret_a_expedier: "readyToShip",
  prete_a_expedier: "readyToShip",
  pret_a_preparer: "readyToPrepare",
  en_ramassage: "pickingUp",
  stock_en_preparation: "stockPreparing",
  vers_station: "toHub",
  vers_hub: "toHub",
  en_station: "atHub",
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
  paiements_prêts: "paymentReady",
  paiements_prets: "paymentReady",
  paiement_archivé: "paymentArchived",
  paiement_archive: "paymentArchived",
  order_information_received_by_carrier: "registered",
  picked: "picked",
  accepted_by_carrier: "acceptedAtStation",
  dispatched_to_driver: "dispatchedToDriver",
  attempt_delivery: "deliveryAttempt",
  return_asked: "returnRequested",
  return_received: "returnReceived",
  retour_recu: "returnReceived",
  livred: "delivered",
  encaissed: "collected",
  payed: "paid",
};

export function humanizeEcotrackStatus(status: unknown, t: (key: string) => string) {
  const raw = String(status ?? "").trim();
  if (!raw || /^\d+$/.test(raw)) return t("admin.ecotrackPortal.tracking.statusLabels.unknown");
  const normalized = raw.toLocaleLowerCase().replace(/[\s-]+/g, "_");
  const key = ECOTRACK_STATUS_KEYS[normalized];
  if (key) return t(`admin.ecotrackPortal.tracking.statusLabels.${key}`);
  const words = raw.replaceAll("_", " ");
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

type WorkspaceMode = "commands" | "desks" | "fees" | "products";

export default function EcotrackWorkspaceView({
  onOpenSettings,
  mode = "commands",
  initialStatus = "all"
}: {
  onOpenSettings?: () => void;
  mode?: WorkspaceMode | "history";
  initialStatus?: string;
}) {
  const { t } = useTranslation();

  const { data: dashboard, isLoading: isLoadingDashboard, error: dashboardError, refetch: refetchDashboard } = useEcotrackDashboard();
  const syncNow = useEcotrackSync();
  const initialSyncPending = isLoadingDashboard || dashboard?.sync?.complete === false;
  const isReadyToShip = initialStatus === "pret_a_expedier" || initialStatus === "prete_a_expedier";

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

  if (dashboardError || dashboard?.sync?.last_error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[calc(100vh-4rem)] bg-slate-50">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">{t("admin.ecotrackDashboard.error.title")}</h2>
        <p className="text-slate-500 max-w-md mb-6">{t("admin.ecotrackDashboard.error.desc")}</p>
        <Button
          disabled={syncNow.isPending}
          onClick={() => dashboardError ? void refetchDashboard() : syncNow.mutate()}
          className="bg-[#E10600] hover:bg-red-700"
        >
          {syncNow.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t("admin.ecotrackDashboard.error.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0 z-10 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {mode === "commands"
                ? t("admin.ecotrackPortal.title")
                : mode === "history"
                  ? t("admin.ecotrackPortal.history")
                  : mode === "desks"
                    ? t("admin.ecotrackPortal.desksNav")
                    : mode === "fees"
                      ? t("admin.ecotrackPortal.feesNav")
                      : t("admin.ecotrackPortal.productsNav")}
            </h1>
            <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
              {t("admin.ecotrackPortal.lastSync")}
              <span className="font-medium text-slate-700">
                {dashboard?.sync?.last_synced_at ? new Date(dashboard.sync.last_synced_at).toLocaleString() : t("admin.ecotrackPortal.never")}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              {initialSyncPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <span className="h-2 w-2 rounded-full bg-emerald-500" />}
              {initialSyncPending ? t("admin.ecotrackPortal.initialSync") : t("admin.ecotrackPortal.liveSync")}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {(mode === "commands" || mode === "history") && initialSyncPending ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-8">
            <Loader2 className="h-9 w-9 animate-spin text-[#E10600]" />
            <p className="font-semibold text-slate-700">{t("admin.ecotrackPortal.initialSync")}</p>
            <p className="max-w-md text-sm text-slate-500">{t("admin.ecotrackPortal.initialSyncDescription")}</p>
          </div>
        ) : mode === "commands" && isReadyToShip ? (
          <OrdersTab status={initialStatus} />
        ) : mode === "commands" || mode === "history" ? (
          <TrackingTab
            key={initialStatus + mode}
            statuses={dashboard?.statuses || []}
            initialStatus={initialStatus}
            isHistory={mode === "history"}
          />
        ) : mode === "desks" ? <DesksTab />
          : mode === "fees" ? <FeesTab />
          : <ProductsTab />}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ORDERS TAB
// -----------------------------------------------------------------------------
const EMPTY_ORDER_FILTERS: EcotrackOrderFilters = {
  from: "", to: "", wilaya: "", commune: "", type: "", fragile: "", stopDesk: "",
};

function AdvancedOrderFilters({
  value,
  onApply,
}: {
  value: EcotrackOrderFilters;
  onApply: (filters: EcotrackOrderFilters) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<EcotrackOrderFilters>(value);
  const { data: wilayas = [] } = useEcotrackWilayas();
  const { data: communes = [], isLoading: communesLoading } = useEcotrackCommunes(draft.wilaya);
  const activeCount = Object.values(value).filter(Boolean).length;

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const update = (key: keyof EcotrackOrderFilters, next: string) => {
    setDraft(current => ({
      ...current,
      [key]: next,
      ...(key === "wilaya" ? { commune: "" } : {}),
    }));
  };

  return (
    <div className="relative">
      <Button type="button" variant="outline" onClick={() => setOpen(current => !current)} className="bg-white">
        <SlidersHorizontal className="h-4 w-4 me-2" />
        {t("admin.ecotrackPortal.orders.filters.button")}
        {activeCount > 0 && <span className="ms-2 rounded-full bg-[#E10600] px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>}
      </Button>
      {open && (
        <>
          <button type="button" aria-label="Close filters" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute end-0 top-12 z-50 w-[min(92vw,420px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">{t("admin.ecotrackPortal.orders.filters.title")}</h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>{t("admin.ecotrackPortal.orders.filters.from")}</span>
                <Input type="date" value={draft.from} onChange={event => update("from", event.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>{t("admin.ecotrackPortal.orders.filters.to")}</span>
                <Input type="date" value={draft.to} onChange={event => update("to", event.target.value)} />
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>{t("admin.ecotrackPortal.forms.wilaya")}</span>
                <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={draft.wilaya} onChange={event => update("wilaya", event.target.value)}>
                  <option value="">{t("admin.ecotrackPortal.orders.filters.all")}</option>
                  {wilayas.map((item: any) => <option key={item.wilaya_id} value={String(item.wilaya_id)}>{item.wilaya_name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>{t("admin.ecotrackPortal.forms.commune")}</span>
                <select disabled={!draft.wilaya || communesLoading} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100" value={draft.commune} onChange={event => update("commune", event.target.value)}>
                  <option value="">{t("admin.ecotrackPortal.orders.filters.all")}</option>
                  {communes.map((item: any, index: number) => {
                    const communeValue = String(item.commune_id ?? item.id ?? item.code ?? item.nom);
                    return <option key={`${communeValue}-${index}`} value={communeValue}>{item.nom}</option>;
                  })}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold text-slate-600">
                <span>{t("admin.ecotrackPortal.forms.operationType")}</span>
                <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={draft.type} onChange={event => update("type", event.target.value)}>
                  <option value="">{t("admin.ecotrackPortal.orders.filters.all")}</option>
                  <option value="1">{t("admin.ecotrackPortal.forms.delivery")}</option>
                  <option value="2">{t("admin.ecotrackPortal.forms.exchange")}</option>
                </select>
              </label>
              {(["fragile", "stopDesk"] as const).map(field => (
                <label key={field} className="space-y-1 text-xs font-semibold text-slate-600">
                  <span>{t(`admin.ecotrackPortal.forms.${field}`)}</span>
                  <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm" value={draft[field]} onChange={event => update(field, event.target.value)}>
                    <option value="">{t("admin.ecotrackPortal.orders.filters.all")}</option>
                    <option value="yes">{t("admin.ecotrackPortal.orders.filters.yes")}</option>
                    <option value="no">{t("admin.ecotrackPortal.orders.filters.no")}</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY_ORDER_FILTERS); onApply(EMPTY_ORDER_FILTERS); setOpen(false); }}>
                {t("admin.ecotrackPortal.orders.filters.clear")}
              </Button>
              <Button type="button" className="bg-[#E10600] text-white hover:bg-[#C50500]" onClick={() => { onApply(draft); setOpen(false); }}>
                {t("admin.ecotrackPortal.orders.filters.apply")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function OrdersTab({ status }: { status: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sort, setSort] = useState<EcotrackOrderSort>("updated_desc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<EcotrackOrderFilters>(EMPTY_ORDER_FILTERS);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(timer);
  }, [search]);
  const { data: ordersData, isLoading, isFetching, error } = useEcotrackOrders({ page, search: debouncedSearch, status, sort, ...filters });
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
  const [detailOrder, setDetailOrder] = useState<any | null>(null);

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
      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <div className="relative min-w-[210px] flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("admin.ecotrackPortal.common.search")} className="pl-9 bg-white" />
        </div>
        <AdvancedOrderFilters value={filters} onApply={(next) => { setFilters(next); setPage(1); }} />
        <OrderSortSelect value={sort} onChange={(value) => { setSort(value); setPage(1); }} />
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
                      <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title={t("admin.ecotrackPortal.orders.details.title")} onClick={() => setDetailOrder(order)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-900" title={t("admin.ecotrackPortal.orders.modify")} onClick={() => { setSelectedParcel(order); setIsModalOpen(true); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title={t("admin.ecotrackPortal.orders.ship")} onClick={() => handleShip(order.tracking)}>
                          <Truck className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-900" title={t("admin.ecotrackPortal.orders.downloadLabel")} onClick={() => handleDownloadLabel(order.tracking)}>
                          <Download className="h-4 w-4" />
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
      {detailOrder && <OrderDetailsModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// TRACKING TAB
// -----------------------------------------------------------------------------
function TrackingTab({ statuses, initialStatus = "all", isHistory = false }: { statuses: any[]; initialStatus?: string; isHistory?: boolean; }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<EcotrackOrderSort>("updated_desc");
  const [filters, setFilters] = useState<EcotrackOrderFilters>(EMPTY_ORDER_FILTERS);
  const currentStatus = isHistory ? "all" : initialStatus;

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: ordersData, isLoading, isFetching } = useEcotrackOrders({ page, search: debouncedSearch, status: currentStatus, sort, ...filters });
  const returnMutation = useRequestReturnEcotrackOrder();

  const [detailTracking, setDetailTracking] = useState<string | null>(null);
  const [noteTracking, setNoteTracking] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);

  const handleRequestReturn = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackPortal.tracking.returnConfirm"))) return;
    returnMutation.mutate(tracking, {
      onSuccess: () => toast({ title: t("admin.ecotrackPortal.common.success") }),
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex flex-wrap gap-2 mb-4 shrink-0">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.ecotrackPortal.common.search")}
            className="pl-9 bg-white shadow-sm"
          />
        </div>
        <AdvancedOrderFilters value={filters} onApply={(next) => { setFilters(next); setPage(1); }} />
        <OrderSortSelect value={sort} onChange={(value) => { setSort(value); setPage(1); }} />
        {isFetching && !isLoading && (
          <span className="inline-flex items-center gap-2 self-center text-xs font-medium text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-[#E10600]" />
            {t("admin.ecotrackPortal.orders.refreshing")}
          </span>
        )}
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
              <tbody className="divide-y divide-slate-100">
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
                      <div className="flex items-center justify-end gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-700 hover:text-slate-900 hover:bg-slate-100" title={t("admin.ecotrackPortal.orders.details.title")} onClick={() => setDetailOrder(order)}>
                          <Package className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title={t("admin.ecotrackPortal.tracking.trackOne")} onClick={() => setDetailTracking(order.tracking)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {!isHistory && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-purple-600 hover:text-purple-700 hover:bg-purple-50" title={t("admin.ecotrackPortal.tracking.addNote")} onClick={() => setNoteTracking(order.tracking)}>
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50" title={t("admin.ecotrackPortal.tracking.requestReturn")} onClick={() => handleRequestReturn(order.tracking)}>
                              <ArrowLeftRight className="h-4 w-4" />
                            </Button>
                          </>
                        )}
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

      {detailOrder && <OrderDetailsModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
      {detailTracking && <TrackingDetailModal tracking={detailTracking} onClose={() => setDetailTracking(null)} />}
      {noteTracking && <AddNoteModal tracking={noteTracking} onClose={() => setNoteTracking(null)} />}
    </div>
  );
}

function OrderSortSelect({ value, onChange }: {
  value: EcotrackOrderSort;
  onChange: (value: EcotrackOrderSort) => void;
}) {
  const { t } = useTranslation();
  const options: EcotrackOrderSort[] = [
    "created_desc", "created_asc", "updated_desc", "updated_asc", "amount_desc", "amount_asc",
  ];
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
      <span className="whitespace-nowrap">{t("admin.ecotrackPortal.orders.sort.label")}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as EcotrackOrderSort)}
        className="h-9 min-w-48 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20"
      >
        {options.map(option => (
          <option key={option} value={option}>{t(`admin.ecotrackPortal.orders.sort.${option}`)}</option>
        ))}
      </select>
    </label>
  );
}

// -----------------------------------------------------------------------------
// DESKS
// -----------------------------------------------------------------------------
function DesksTab() {
  const { t } = useTranslation();
  const { data: desks, isLoading: isLoadingDesks } = useEcotrackDesks();
  const otherDesks = Array.isArray(desks?.other_desks) ? desks.other_desks : [];

  return (
    <div className="p-4 sm:p-6 h-full overflow-auto bg-slate-50">
      {isLoadingDesks ? (
        <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#E10600]"/></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-7xl mx-auto">
          {desks?.my_desk && (() => {
            const desk = desks.my_desk;
            const phone = desk.phone || desk.telephone || desk.tel || desk.mobile || desk.location?.phone || desk.location?.telephone || desk.location?.tel || desk.location?.mobile;
            return (
              <article className="rounded-2xl border border-red-200 bg-red-50/60 p-5 shadow-sm">
                <span className="mb-3 inline-flex rounded-full bg-[#E10600] px-2.5 py-1 text-xs font-bold text-white">{t("admin.ecotrackPortal.config.myDesk")}</span>
                <h3 className="font-bold text-slate-900">{desk.hub_name || desk.name}</h3>
                <p className="text-sm text-slate-600 mt-2">{desk.location?.commune || desk.commune}, {desk.location?.wilaya || desk.wilaya}</p>
                <p className="text-sm text-slate-500 mt-1">{desk.location?.adresse || desk.adresse}</p>
                {phone && <p className="text-sm font-medium text-slate-700 mt-2">{phone}</p>}
              </article>
            );
          })()}
          {otherDesks.map((desk: any, index: number) => {
            const phone = desk.phone || desk.telephone || desk.tel || desk.mobile;
            return (
              <article key={`${desk.name || index}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-bold text-slate-900">{desk.name}</h3>
                <p className="text-sm text-slate-600 mt-2">{desk.commune}, {desk.wilaya}</p>
                <p className="text-sm text-slate-500 mt-1">{desk.adresse}</p>
                {phone && <p className="text-sm font-medium text-slate-700 mt-2">{phone}</p>}
              </article>
            );
          })}
          {!desks?.my_desk && otherDesks.length === 0 && (
            <div className="col-span-full py-16 text-center text-slate-500">{t("admin.ecotrackPortal.config.noDesks")}</div>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SERVICE FEES
// -----------------------------------------------------------------------------
function FeesTab() {
  const { t } = useTranslation();
  const { data: fees, isLoading: isLoadingFees } = useEcotrackFees();
  const { data: wilayas = [] } = useEcotrackWilayas();
  const wilayaNames = useMemo(
    () => new Map(wilayas.map((wilaya: any) => [String(wilaya.wilaya_id), wilaya.wilaya_name])),
    [wilayas],
  );
  const rows = useMemo(() => {
    const byWilaya = new Map<string, {
      wilayaId: string;
      home?: unknown;
      stopDesk?: unknown;
      exchangeHome?: unknown;
      exchangeStopDesk?: unknown;
      returnHome?: unknown;
      returnStopDesk?: unknown;
    }>();

    for (const [service, serviceRows] of Object.entries(fees || {})) {
      if (!Array.isArray(serviceRows)) continue;
      const normalizedService = service
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase();

      for (const fee of serviceRows as any[]) {
        const wilayaId = String(fee.wilaya_id ?? fee.wilaya ?? "");
        if (!wilayaId) continue;
        const row = byWilaya.get(wilayaId) ?? { wilayaId };

        if (normalizedService.includes("livraison") || normalizedService.includes("delivery")) {
          row.home = fee.tarif;
          row.stopDesk = fee.tarif_stopdesk;
        } else if (normalizedService.includes("echange") || normalizedService.includes("exchange")) {
          row.exchangeHome = fee.tarif;
          row.exchangeStopDesk = fee.tarif_stopdesk;
        } else if (normalizedService.includes("retour") || normalizedService.includes("return")) {
          row.returnHome = fee.tarif;
          row.returnStopDesk = fee.tarif_stopdesk;
        }

        byWilaya.set(wilayaId, row);
      }
    }

    return Array.from(byWilaya.values()).sort((a, b) =>
      Number(a.wilayaId) - Number(b.wilayaId) || a.wilayaId.localeCompare(b.wilayaId),
    );
  }, [fees]);

  const displayFee = (value: unknown) =>
    value === null || value === undefined || value === "" ? "—" : `${value} DA`;

  return (
    <div className="h-full overflow-auto bg-slate-50 p-4 sm:p-6">
      <div className="min-h-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoadingFees ? (
          <div className="flex min-h-[420px] items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#E10600]"/></div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-[420px] items-center justify-center p-8 text-slate-500">{t("admin.ecotrackPortal.config.noFees")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="sticky top-0 z-10 bg-slate-100 text-slate-600 shadow-[0_1px_0_0_#e2e8f0]">
                <tr className="border-b border-slate-200">
                  <th rowSpan={2} className="px-5 py-4 text-start align-middle font-semibold">{t("admin.ecotrackPortal.forms.wilaya")}</th>
                  <th colSpan={2} className="px-5 py-3 text-center font-bold">{t("admin.ecotrackPortal.config.deliveryFee")}</th>
                  <th colSpan={2} className="border-s border-slate-200 px-5 py-3 text-center font-bold">{t("admin.ecotrackPortal.config.exchangeFee")}</th>
                  <th colSpan={2} className="border-s border-slate-200 px-5 py-3 text-center font-bold">{t("admin.ecotrackPortal.config.returnFee")}</th>
                </tr>
                <tr>
                  <th className="px-5 py-3 text-end font-semibold">{t("admin.ecotrackPortal.config.homeFee")}</th>
                  <th className="px-5 py-3 text-end font-semibold">{t("admin.ecotrackPortal.config.deskFee")}</th>
                  <th className="border-s border-slate-200 px-5 py-3 text-end font-semibold">{t("admin.ecotrackPortal.config.homeFee")}</th>
                  <th className="px-5 py-3 text-end font-semibold">{t("admin.ecotrackPortal.config.deskFee")}</th>
                  <th className="border-s border-slate-200 px-5 py-3 text-end font-semibold">{t("admin.ecotrackPortal.config.homeFee")}</th>
                  <th className="px-5 py-3 text-end font-semibold">{t("admin.ecotrackPortal.config.deskFee")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((fee) => (
                  <tr key={fee.wilayaId} className="hover:bg-slate-50">
                    <td className="px-5 py-4 font-semibold text-slate-900">
                      {wilayaNames.get(fee.wilayaId) ?? fee.wilayaId}
                    </td>
                    <td className="px-5 py-4 text-end text-slate-700">{displayFee(fee.home)}</td>
                    <td className="px-5 py-4 text-end text-slate-700">{displayFee(fee.stopDesk)}</td>
                    <td className="border-s border-slate-100 px-5 py-4 text-end text-slate-700">{displayFee(fee.exchangeHome)}</td>
                    <td className="px-5 py-4 text-end text-slate-700">{displayFee(fee.exchangeStopDesk)}</td>
                    <td className="border-s border-slate-100 px-5 py-4 text-end text-slate-700">{displayFee(fee.returnHome)}</td>
                    <td className="px-5 py-4 text-end text-slate-700">{displayFee(fee.returnStopDesk)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
export function OrderFormModal({ isOpen, onClose, parcel, isEdit }: { isOpen: boolean; onClose: () => void; parcel: any; isEdit: boolean; }) {
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
        nom_client: formData.client, telephone: normalizeOrderPhone(formData.phone), telephone_2: normalizeOrderPhone(formData.phone_2),
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

export function BulkOrderModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutation = useBulkCreateEcotrackOrders();
  const { data: wilayas = [] } = useEcotrackWilayas();
  const { data: desks, isLoading: desksLoading } = useEcotrackDesks();

  const addRow = () => {
    if (rows.length >= 100) return;
    setRows(prev => [...prev, {
      id: Date.now() + prev.length, reference: "", nom_client: "", telephone: "", telephone_2: "",
      adresse: "", code_wilaya: "", commune: "", montant: "", produit: "", weight: "", type: "1",
      remarque: "", stop_desk: 0, fragile: 0, gps_link: "", _commune_valid: 1,
    }]);
  };
  const removeRow = (id: number) => setRows(prev => prev.filter(r => r.id !== id));
  const updateRow = (id: number, field: string, value: string | number) => setRows(prev => prev.map(r => r.id === id ? {
    ...r,
    [field]: value,
    ...(field === "code_wilaya" ? { commune: "", _commune_valid: 0 } : {}),
  } : r));

  const importExcel = async (file: File) => {
    setIsImporting(true);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const sheet = await readSheet(file);
      const normalizeHeader = (value: unknown) => String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const headers = (sheet[0] ?? []).map(normalizeHeader);
      const validTemplate =
        headers[1]?.includes("nom et prenom du destinataire") &&
        headers[2]?.startsWith("telephone") &&
        headers[4]?.includes("code wilaya") &&
        headers[6]?.includes("commune de livraison") &&
        headers[7]?.includes("adresse de livraison") &&
        headers[8]?.startsWith("produit") &&
        headers[10]?.includes("montant du colis");
      if (!validTemplate) throw new Error("invalid_template");

      const dataRows = sheet.slice(1).filter(row =>
        row.slice(0, 18).some(value => value !== null && String(value).trim() !== "")
      );
      if (dataRows.length === 0) throw new Error("empty_file");
      const existingRows = rows.filter(({ id, _commune_valid, ...row }) =>
        Object.values(row).some(value => value !== "" && value !== 0 && value !== false && value !== null && value !== undefined)
      );
      if (dataRows.length + existingRows.length > 100) throw new Error("too_many_rows");

      const isYes = (value: unknown) => {
        const normalized = String(value ?? "").trim().toLocaleLowerCase();
        return ["oui", "yes", "true", "1", "x"].includes(normalized);
      };
      const conflictingRows: number[] = [];
      const imported = dataRows.map((row, index) => {
        const exchange = isYes(row[13]);
        const pickup = isYes(row[14]);
        const collection = isYes(row[15]);
        if ([exchange, pickup, collection].filter(Boolean).length > 1) conflictingRows.push(index + 2);
        const type = collection ? "4" : pickup ? "3" : exchange ? "2" : "1";
        const cell = (column: number) => String(row[column] ?? "").trim();
        return {
          id: Date.now() + index,
          reference: cell(0),
          nom_client: cell(1),
          telephone: cell(2),
          telephone_2: cell(3),
          code_wilaya: cell(4),
          commune: cell(6),
          adresse: cell(7),
          produit: cell(8),
          weight: cell(9),
          montant: cell(10),
          remarque: cell(11),
          fragile: isYes(row[12]) ? 1 : 0,
          type,
          stop_desk: isYes(row[16]) ? 1 : 0,
          gps_link: cell(17),
          _commune_valid: 0,
        };
      });
      if (conflictingRows.length) {
        toast({
          title: t("admin.ecotrackPortal.orders.bulkModal.conflictingTypes", { rows: conflictingRows.join(", ") }),
          variant: "destructive",
        });
        return;
      }
      setRows([...existingRows, ...imported]);
      setSubmissionError("");
      toast({ title: t("admin.ecotrackPortal.orders.bulkModal.importSuccess", { count: imported.length }) });
    } catch (error) {
      const code = error instanceof Error ? error.message : "invalid_template";
      const key = code === "too_many_rows"
        ? "tooManyRows"
        : code === "empty_file"
          ? "emptyFile"
          : "invalidTemplate";
      toast({ title: t(`admin.ecotrackPortal.orders.bulkModal.${key}`), variant: "destructive" });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const submit = () => {
    if (rows.length === 0) return;
    const incomplete = rows.some(row => !row.nom_client || !row.telephone || !row.adresse || !row.code_wilaya || !row.commune || row.montant === "");
    if (incomplete) {
      toast({ title: t("admin.ecotrackPortal.orders.bulkModal.required"), variant: "destructive" });
      return;
    }
    const invalidPhoneRows = rows
      .map((row, index) => ({
        row: index + 1,
        phone: normalizeOrderPhone(row.telephone),
        phone2: normalizeOrderPhone(row.telephone_2),
      }))
      .filter(({ phone, phone2 }) => !/^\d{9,10}$/.test(phone) || (phone2 && !/^\d{9,10}$/.test(phone2)))
      .map(({ row }) => row);
    if (invalidPhoneRows.length) {
      toast({
        title: t("admin.ecotrackPortal.orders.bulkModal.invalidPhone", { rows: invalidPhoneRows.join(", ") }),
        variant: "destructive",
      });
      return;
    }
    const invalidCommuneRows = rows
      .map((row, index) => row._commune_valid === 0 ? index + 1 : null)
      .filter((row): row is number => row !== null);
    if (invalidCommuneRows.length) {
      toast({
        title: t("admin.ecotrackPortal.orders.bulkModal.invalidCommunes", { rows: invalidCommuneRows.join(", ") }),
        variant: "destructive",
      });
      return;
    }
    const availableDeskCommunes = new Set(
      (Array.isArray(desks?.other_desks) ? desks.other_desks : [])
        .map((desk: any) => normalizeEcotrackLookup(desk?.commune))
        .filter(Boolean),
    );
    const homeDeliveryRows = desksLoading
      ? []
      : rows
        .map((row, index) =>
          Boolean(row.stop_desk) && !availableDeskCommunes.has(normalizeEcotrackLookup(row.commune))
            ? index + 1
            : null,
        )
        .filter((row): row is number => row !== null);
    const referenceSeed = Date.now();
    const preparedRows = rows.map((row, index) => ({
      ...row,
      stop_desk: homeDeliveryRows.includes(index + 1) ? 0 : row.stop_desk,
      reference: String(row.reference ?? "").trim() || `WEASY-${referenceSeed}-${index + 1}`,
    }));
    setRows(preparedRows);
    setSubmissionError("");
    if (homeDeliveryRows.length) {
      toast({
        title: t("admin.ecotrackPortal.orders.bulkModal.stopDeskFallback", {
          rows: homeDeliveryRows.join(", "),
        }),
      });
    }
    const orders = preparedRows.map(({ id, _commune_valid, ...rest }) => ({
      ...rest,
      _client_id: String(id),
      telephone: normalizeOrderPhone(rest.telephone),
      telephone_2: normalizeOrderPhone(rest.telephone_2),
    }));
    mutation.mutate(orders, {
      onSuccess: (result) => {
        const failures = Array.isArray(result.failures) ? result.failures : [];
        if (failures.length) {
          const successfulIds = new Set(
            (Array.isArray(result.createdItems) ? result.createdItems : [])
              .map((item: any) => String(item.clientId ?? ""))
              .filter(Boolean),
          );
          const remainingRows = preparedRows.filter(row => !successfulIds.has(String(row.id)));
          const details = failures
            .map((failure: any) => `#${failure.index}: ${ecotrackFailureText(failure.details) || t("admin.ecotrackPortal.common.error")}`)
            .join(" • ");
          setRows(remainingRows);
          setSubmissionError(details);
          toast({
            title: t("admin.ecotrackPortal.orders.bulkModal.partialSuccess", {
              success: successfulIds.size,
              failed: failures.length,
            }),
            description: details,
            variant: "destructive",
          });
          return;
        }
        setRows([]);
        toast({ title: t("admin.ecotrackPortal.common.success") });
        onClose();
      },
      onError: (err) => {
        setSubmissionError(err.message);
        toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" });
      }
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
        <div className="p-4 flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50">
          <Button variant="outline" onClick={addRow}><Plus className="w-4 h-4 mr-2"/> {t("admin.ecotrackPortal.orders.bulkModal.addRow")}</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              if (file) void importExcel(file);
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Upload className="w-4 h-4 mr-2" />}
            {t("admin.ecotrackPortal.orders.bulkModal.importExcel")}
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
            {t("admin.ecotrackPortal.orders.bulkModal.importHint")}
          </span>
        </div>
        {submissionError && (
          <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{submissionError}</span>
          </div>
        )}
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
                   <th className="px-2 py-2">{t("admin.ecotrackPortal.forms.mapLink")}</th>
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
          <Button onClick={submit} disabled={mutation.isPending || desksLoading || rows.length === 0} className="bg-[#E10600] text-white">
            {mutation.isPending || desksLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
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
  useEffect(() => {
    if (communesLoading || !row.commune) return;
    const requested = normalizeEcotrackLookup(row.commune);
    const match = communes.find((commune: any) => normalizeEcotrackLookup(commune.nom) === requested);
    if (match) {
      if (String(match.nom) !== String(row.commune)) updateRow(row.id, "commune", String(match.nom));
      if (row._commune_valid !== 1) updateRow(row.id, "_commune_valid", 1);
    } else if (row._commune_valid !== 0) {
      updateRow(row.id, "_commune_valid", 0);
    }
  }, [communes, communesLoading, row.id, row.commune, row._commune_valid, updateRow]);
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
          <option value="3">{t("admin.ecotrackPortal.forms.pickup")}</option>
          <option value="4">{t("admin.ecotrackPortal.forms.collection")}</option>
        </select>
      </td>
      <td className="px-2 py-2">{cellInput("remarque")}</td>
      <td className="px-2 py-2 text-center"><input type="checkbox" checked={Boolean(row.stop_desk)} onChange={event => updateRow(row.id, "stop_desk", event.target.checked ? 1 : 0)} /></td>
      <td className="px-2 py-2 text-center"><input type="checkbox" checked={Boolean(row.fragile)} onChange={event => updateRow(row.id, "fragile", event.target.checked ? 1 : 0)} /></td>
      <td className="px-2 py-2">{cellInput("gps_link", { type: "url" })}</td>
      <td className="px-2 py-2"><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeRow(row.id)}><Trash2 className="w-4 h-4"/></Button></td>
    </tr>
  );
}

function OrderDetailsModal({ order, onClose }: { order: any; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: wilayas = [] } = useEcotrackWilayas();
  const value = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = order?.[key];
      if (candidate !== null && candidate !== undefined && candidate !== "") return candidate;
    }
    return "—";
  };
  const getRaw = (...keys: string[]) => {
    for (const key of keys) {
      const candidate = order?.[key];
      if (candidate !== null && candidate !== undefined && candidate !== "") return candidate;
    }
    return null;
  };
  const yesNo = (candidate: unknown) =>
    Number(candidate) === 1 || candidate === true || String(candidate).toLocaleLowerCase() === "oui"
      ? t("admin.ecotrackPortal.orders.details.yes")
      : t("admin.ecotrackPortal.orders.details.no");
  
  const rawId = getRaw("wilaya_id", "code_wilaya");
  const rawName = getRaw("wilaya_name", "wilaya");

  let matchedWilaya = null;
  if (rawId) {
    const cleanId = String(rawId).replace(/^DZ/, "").replace(/^0+/, "");
    matchedWilaya = wilayas.find((w: any) => String(w.wilaya_id).replace(/^DZ/, "").replace(/^0+/, "") === cleanId);
  }
  if (!matchedWilaya && rawName) {
    const searchName = String(rawName).toLowerCase().trim();
    matchedWilaya = wilayas.find((w: any) => String(w.wilaya_name).toLowerCase().trim() === searchName);
  }

  let displayWilaya = "—";
  if (matchedWilaya) {
    // Determine the most readable code form (prefer just the number if possible, or whatever it is)
    const code = String(matchedWilaya.wilaya_id).replace(/^DZ/, "").replace(/^0+/, "");
    displayWilaya = `(${code || matchedWilaya.wilaya_id}, ${matchedWilaya.wilaya_name})`;
  } else if (rawId && rawName) {
    displayWilaya = `(${rawId}, ${rawName})`;
  } else if (rawId) {
    displayWilaya = `(${rawId})`;
  } else if (rawName) {
    displayWilaya = String(rawName);
  }

  const type = String(value("type_id", "type"));
  const typeLabel = type === "2"
    ? t("admin.ecotrackPortal.forms.exchange")
    : type === "3"
      ? t("admin.ecotrackPortal.forms.pickup")
      : type === "4"
        ? t("admin.ecotrackPortal.forms.collection")
        : t("admin.ecotrackPortal.forms.delivery");
  const fields = [
    [t("admin.ecotrackPortal.orders.table.tracking"), value("tracking")],
    [t("admin.ecotrackPortal.forms.reference"), value("reference")],
    [t("admin.ecotrackPortal.forms.client"), value("client", "nom_client")],
    [t("admin.ecotrackPortal.forms.phone"), value("phone", "tel", "telephone")],
    [t("admin.ecotrackPortal.forms.phone2"), value("phone_2", "tel2", "telephone_2")],
    [t("admin.ecotrackPortal.forms.wilaya"), displayWilaya],
    [t("admin.ecotrackPortal.forms.commune"), value("commune_name", "commune")],
    [t("admin.ecotrackPortal.forms.address"), value("adresse")],
    [t("admin.ecotrackPortal.forms.amount"), formatDZD(Number(value("montant")) || 0)],
    [t("admin.ecotrackPortal.forms.products"), value("products", "product", "produit")],
    [t("admin.ecotrackPortal.forms.weight"), value("weight")],
    [t("admin.ecotrackPortal.forms.operationType"), typeLabel],
    [t("admin.ecotrackPortal.forms.stopDesk"), yesNo(value("stop_desk"))],
    [t("admin.ecotrackPortal.forms.fragile"), yesNo(value("fragile"))],
    [t("admin.ecotrackPortal.forms.remark"), value("remarque", "remark")],
    [t("admin.ecotrackPortal.tracking.status"), humanizeEcotrackStatus(value("status", "global_status"), t)],
    [t("admin.ecotrackPortal.orders.details.createdAt"), value("created_at", "createdAt")],
    [t("admin.ecotrackPortal.orders.details.updatedAt"), value("last_updated_at", "updated_at", "updatedAt")],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t("admin.ecotrackPortal.orders.details.title")}</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{value("tracking")}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="overflow-auto bg-slate-50 p-5">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {fields.map(([label, fieldValue]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                <dd className="mt-1 break-words text-sm font-medium text-slate-800">{String(fieldValue)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
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
                         {ev.scanLocation && ev.scanLocation !== ev.station && (
                           <p className="text-xs text-slate-500 mt-1">{t("admin.ecotrackPortal.tracking.scanLocation")}: {ev.scanLocation}</p>
                         )}
                         {ev.driver && <p className="text-sm text-slate-700 mt-2"><span className="font-semibold">{t("admin.ecotrackPortal.tracking.driver")}:</span> {ev.driver}</p>}
                         {ev.comments && <p className="text-sm text-slate-800 mt-1"><span className="font-semibold">{t("admin.ecotrackPortal.tracking.comments")}:</span> {ev.comments}</p>}
                         {ev.remark && <p className="text-sm text-slate-600 mt-1"><span className="font-semibold">{t("admin.ecotrackPortal.tracking.remark")}:</span> {ev.remark}</p>}
                        {ev.reason && ev.reason !== ev.status && <p className="text-sm text-slate-700 mt-2">{ev.reason}</p>}
                        {ev.details && <p className="text-sm text-slate-600 mt-1">{ev.details}</p>}
                        {ev.postponedTo && <p className="text-xs text-amber-700 mt-2">{t("admin.ecotrackPortal.tracking.postponedTo")}: {ev.postponedTo}</p>}
                         {ev.metadata?.map((item: any) => (
                           <p key={item.key} className="text-xs text-slate-500 mt-1">
                             <span className="font-semibold">{item.key.replaceAll("_", " ")}:</span> {item.value}
                           </p>
                         ))}
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
