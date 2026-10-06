import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import "@/lib/portalUpdatesI18n";
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
  useCreateEcotrackProduct,
  useUpdateEcotrackProduct,
  useCreateEcotrackOrder,
  useBulkCreateEcotrackOrders,
  useUpdateEcotrackOrder,
  useDeleteEcotrackOrder,
  useValidateEcotrackOrder,
  useRequestReturnEcotrackOrder,
  useLabelEcotrackOrder,
  useEcotrackOrderDetail,
  useEcotrackRemarks,
  useAddEcotrackNote,
  useEcotrackSync
} from "@/hooks/use-ecotrack";
import type { EcotrackOrderSort } from "@/hooks/use-ecotrack";
import type { EcotrackOrderFilters } from "@/hooks/use-ecotrack";
import { displayEcotrackRemark } from "@/lib/ecotrackRemarks";
import { PaginationBar } from "@/components/Pagination";
import { useToast } from "@/hooks/use-toast";
import { authenticatedFetch, adminHeaders, API_BASE } from "@/lib/api";
import { OrderFormModal } from "./orders/OrderFormModal";
import { OrderFilterSheet } from "./orders/OrderFilterSheet";
import { ReadySelectionBar, useTrackingSelection } from "./orders/ReadySelection";
import { getDriver, normalizeDzMobile, communeHasStopDesk, communesOfWilaya, sameId, stopDeskWilayas } from "./orders/orderUpdates";
import { CommunePicker, DestinationStatus, FeePreview, WilayaPicker, useDestination, useEcotrackAllCommunes } from "./orders/orderHelpers";
import "./orders/orderUpdatesI18n";

export { OrderFormModal };

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
  retour_archive: "returnReceived",
  paye_et_archive: "paymentArchived",
  livred: "delivered",
  encaissed: "collected",
  payed: "paid",
};

export function humanizeEcotrackStatus(status: unknown, t: (key: string) => string) {
  const raw = String(status ?? "").trim();
  if (!raw || /^\d+$/.test(raw)) return t("admin.ecotrackPortal.tracking.statusLabels.unknown");
  const normalized = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[\s-]+/g, "_");
  if (["retours_prets", "retour_pret", "retours_pret", "retour_recu", "return_ready"].includes(normalized)) return t("portalUpdates.returnsReady");
  const key = ECOTRACK_STATUS_KEYS[normalized];
  if (key) return t(`admin.ecotrackPortal.tracking.statusLabels.${key}`);
  const words = raw.replaceAll("_", " ");
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}

type WorkspaceMode = "commands" | "desks" | "fees" | "products" | "history" | "history-payments" | "history-returns";

export default function EcotrackWorkspaceView({
  onOpenSettings,
  mode = "commands",
  initialStatus = "all"
}: {
  onOpenSettings?: () => void;
  mode?: WorkspaceMode;
  initialStatus?: string;
}) {
  const { t } = useTranslation();
  const isHistoryMode = mode.startsWith("history");

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
                : isHistoryMode
                  ? t(mode === "history-payments" ? "portalUpdates.receivedPayments" : mode === "history-returns" ? "portalUpdates.receivedReturns" : "portalUpdates.allParcels")
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
        {(mode === "commands" || isHistoryMode) && initialSyncPending ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center p-8">
            <Loader2 className="h-9 w-9 animate-spin text-[#E10600]" />
            <p className="font-semibold text-slate-700">{t("admin.ecotrackPortal.initialSync")}</p>
            <p className="max-w-md text-sm text-slate-500">{t("admin.ecotrackPortal.initialSyncDescription")}</p>
          </div>
        ) : mode === "commands" && isReadyToShip ? (
          <OrdersTab status={initialStatus} />
        ) : mode === "commands" || isHistoryMode ? (
          <TrackingTab
            key={initialStatus + mode}
            statuses={dashboard?.statuses || []}
            initialStatus={initialStatus}
            isHistory={isHistoryMode}
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
        <OrderFilterSheet
          title={t("admin.ecotrackPortal.orders.filters.title")}
          onClose={() => setOpen(false)}
          onApply={() => { onApply(draft); setOpen(false); }}
          onClear={() => { setDraft(EMPTY_ORDER_FILTERS); onApply(EMPTY_ORDER_FILTERS); setOpen(false); }}
        >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 [&_label]:min-w-0 [&_select]:min-w-0">
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
        </OrderFilterSheet>
      )}
    </div>
  );
}

function DriverCell({ order }: { order: any }) {
  const driver = getDriver(order);
  if (!driver.name && !driver.phone) return <span className="text-slate-400">—</span>;
  return (
    <>
      {driver.name && <div className="font-medium text-slate-900">{driver.name}</div>}
      {driver.phone && <div className="text-xs text-slate-500 mt-0.5">{driver.phone}</div>}
    </>
  );
}

const isHistoryStatus = (status: string) => status === "history_payments" || status === "history_returns";
function HistoryArchiveBanner({ status, sync, fetching, onRetry }: { status: string; sync: any; fetching: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  if (!isHistoryStatus(status)) return null;
  const working = Boolean(sync?.hasMore) && !sync?.error;
  return (
    <div className="mb-3 shrink-0 space-y-2" data-testid="history-banner">
      <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <span>{t("orderUpdates.historyBanner")}</span>
      </div>
      {working && (
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-[#E10600]" />{t("orderUpdates.historyFetching")}
        </div>
      )}
      {sync?.error && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">{t("orderUpdates.historyError")}</span>
          <Button type="button" size="sm" variant="outline" className="h-7" disabled={fetching} onClick={onRetry}>{t("orderUpdates.retry")}</Button>
        </div>
      )}
    </div>
  );
}
const HistoryEmptyOrProgress = ({ status, sync }: { status: string; sync: any }) => {
  const { t } = useTranslation();
  if (isHistoryStatus(status) && sync?.hasMore && !sync?.error) {
    return <div className="flex flex-col h-full items-center justify-center text-center p-8"><Loader2 className="h-8 w-8 animate-spin text-[#E10600] mb-3" /><p className="text-slate-500 font-medium">{t("orderUpdates.historyFetching")}</p></div>;
  }
  if (isHistoryStatus(status) && sync?.error) {
    return <div className="flex flex-col h-full items-center justify-center text-center p-8"><AlertCircle className="h-10 w-10 text-red-500 mb-3" /><p className="text-slate-500 font-medium">{t("orderUpdates.historyError")}</p></div>;
  }
  return <div className="flex flex-col h-full items-center justify-center text-center p-8"><Package className="h-12 w-12 text-slate-200 mb-3" /><p className="text-slate-500 font-medium">{t("admin.ecotrackPortal.orders.empty")}</p></div>;
};

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
  const [archivePoll, setArchivePoll] = useState<number | false>(false);
  const { data: ordersData, isLoading, isFetching, error, refetch: refetchOrders } = useEcotrackOrders({ page, search: debouncedSearch, status, sort, ...filters }, isHistoryStatus(status) ? { refetchInterval: archivePoll } : undefined);
  const archiveSync = ordersData?.archiveSync;
  useEffect(() => { setArchivePoll(isHistoryStatus(status) && archiveSync?.hasMore && !archiveSync?.error ? 2000 : false); }, [status, archiveSync?.hasMore, archiveSync?.error]);
  const filterParams: Record<string, string> = {
    status, search: debouncedSearch, from: filters.from ?? "", to: filters.to ?? "", wilaya: filters.wilaya ?? "",
    commune: filters.commune ?? "", type: filters.type ?? "", fragile: filters.fragile ?? "", stop_desk: filters.stopDesk ?? "",
  };
  const selection = useTrackingSelection(JSON.stringify(filterParams));
  const pageTrackings: string[] = (ordersData?.data ?? []).map((o: any) => String(o.tracking));
  const pageAllSelected = pageTrackings.length > 0 && pageTrackings.every(x => selection.selected.has(x));
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

      <HistoryArchiveBanner status={status} sync={archiveSync} fetching={isFetching} onRetry={() => void refetchOrders()} />

      <ReadySelectionBar
        selected={selection.selected} pageTrackings={pageTrackings} total={ordersData?.pagination?.total ?? 0}
        filterParams={filterParams} onSetMany={selection.setMany} onClear={selection.clear}
        onRemove={(done) => { const doneSet = new Set(done); selection.setMany(Array.from(selection.selected).filter(x => !doneSet.has(x))); }}
      />

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#E10600]" /></div>
          ) : error ? (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
              <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
              <p className="text-slate-900 font-semibold">{t("admin.ecotrackPortal.common.error")}</p>
              <p className="text-sm text-slate-500 mt-1">{t("orderUpdates.listError")} {error.message}</p>
            </div>
          ) : ordersData?.data?.length === 0 ? (
            <HistoryEmptyOrProgress status={status} sync={archiveSync} />
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="w-10 px-4 py-3"><input type="checkbox" aria-label={t("orderUpdates.selectPage")} title={t("orderUpdates.selectPage")} checked={pageAllSelected} onChange={() => pageAllSelected ? selection.setMany(Array.from(selection.selected).filter(x => !pageTrackings.includes(x))) : selection.setMany(Array.from(new Set([...Array.from(selection.selected), ...pageTrackings])))} /></th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.tracking")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.recipient")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("orderUpdates.driver")}</th>
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
                    <td className="w-10 px-4 py-3"><input type="checkbox" aria-label={t("orderUpdates.selectRow")} checked={selection.selected.has(String(order.tracking))} onChange={() => selection.toggle(String(order.tracking))} /></td>
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-slate-900">{order.tracking}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.client}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{order.phone}</div>
                    </td>
                    <td className="px-4 py-3"><DriverCell order={order} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700">{wilayaName || t("admin.ecotrackPortal.orders.destinationUnavailable")}</span>
                      </div>
                      {communeName && <div className="text-xs text-slate-500 mt-0.5 ml-5">{communeName}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{order.montant == null || order.montant === "" ? "—" : formatDZD(order.montant)}</td>
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
  const currentStatus = initialStatus || "all";

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const [archivePoll, setArchivePoll] = useState<number | false>(false);
  const { data: ordersData, isLoading, isFetching, error: ordersError, refetch: refetchOrders } = useEcotrackOrders({ page, search: debouncedSearch, status: currentStatus, sort, ...filters }, isHistoryStatus(currentStatus) ? { refetchInterval: archivePoll } : undefined);
  const trackArchiveSync = ordersData?.archiveSync;
  useEffect(() => { setArchivePoll(isHistoryStatus(currentStatus) && trackArchiveSync?.hasMore && !trackArchiveSync?.error ? 2000 : false); }, [currentStatus, trackArchiveSync?.hasMore, trackArchiveSync?.error]);
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

      <HistoryArchiveBanner status={currentStatus} sync={trackArchiveSync} fetching={isFetching} onRetry={() => void refetchOrders()} />

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#E10600]" /></div>
          ) : ordersError ? (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
              <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
              <p className="text-slate-900 font-semibold">{t("orderUpdates.listError")}</p>
              <p className="text-sm text-slate-500 mt-1">{ordersError.message}</p>
              <Button type="button" variant="outline" className="mt-3" onClick={() => void refetchOrders()}>{t("orderUpdates.retry")}</Button>
            </div>
          ) : ordersData?.data?.length === 0 ? (
            <HistoryEmptyOrProgress status={currentStatus} sync={ordersData?.archiveSync} />
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.tracking")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.tracking.status")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.recipient")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("orderUpdates.driver")}</th>
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
                    <td className="px-4 py-3"><DriverCell order={order} /></td>
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
      {detailTracking && <TrackingDetailModal tracking={detailTracking} mode="tracking" onClose={() => setDetailTracking(null)} />}
      {noteTracking && <TrackingDetailModal tracking={noteTracking} onClose={() => setNoteTracking(null)} />}
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
  const create = useCreateEcotrackProduct();
  const update = useUpdateEcotrackProduct();
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [error, setError] = useState("");
  const fields = [
    ["name", "Name", "text"], ["sku", "SKU", "text"], ["purchase_price", "Purchase Price", "number"],
    ["sale_price", "Sale Price", "number"], ["barcode", "Barcode", "text"], ["external_id", "External ID", "text"],
    ["brand", "Brand", "text"], ["alert_min_stock", "Alert Minimum Stock", "number"], ["weight_kg", "Weight (KG)", "number"],
    ["marketer_percentage", "Marketer Percentage (%)", "number"], ["page_url", "Page URL", "url"],
  ] as const;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const keys: string[] = [...fields.map(([key]) => key), "description", "photo"];
      const payload = Object.fromEntries(keys.filter(key => form[key] !== undefined).map(key => [key, form[key]]));
      for (const key of fields.filter(([, , type]) => type === "number").map(([key]) => key)) if (payload[key] !== "" && payload[key] !== undefined && (!Number.isFinite(Number(payload[key])) || Number(payload[key]) < 0)) throw new Error(`Invalid ${key}`);
      if (payload.page_url) { const url = new URL(payload.page_url); if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid Page URL"); }
      if (editing) await update.mutateAsync({ id: editing.id, data: payload });
      else await create.mutateAsync(payload);
      setOpen(false); setEditing(null); setForm({});
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save product"); }
  };
  const begin = (product?: any) => {
    setEditing(product ?? null); setForm(product ? { ...product } : {}); setOpen(true);
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">{t("admin.ecotrackPortal.products.list")}</h2><Button onClick={() => begin()}><Plus className="me-2 h-4 w-4" />Add product</Button></div>
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
                  <th className="px-4 py-3 font-semibold text-slate-700">SKU</th><th className="px-4 py-3 font-semibold text-slate-700">Sale Price</th><th className="px-4 py-3 font-semibold text-slate-700">Stock</th><th className="px-4 py-3 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.products.map((p: any) => (
                  <tr key={p.reference || p.barcode} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-slate-900"><div className="flex items-center gap-2">{p.photo_url && <ProductPhoto src={p.photo_url} />}<span>{p.name || p.title}</span></div></td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{p.reference || p.barcode}</td>
                    <td className="px-4 py-3 text-slate-700 font-mono">{p.sku || p.reference || "—"}</td><td className="px-4 py-3 text-slate-700">{p.sale_price ?? "—"}</td><td className="px-4 py-3 text-slate-700">{p.stock_disponible ?? 0}</td><td><Button variant="ghost" size="sm" onClick={() => begin(p)}><Edit2 className="h-4 w-4" /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><form onSubmit={save} className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex justify-between"><h3 className="text-xl font-bold">{editing ? "Edit product" : "New product"}</h3><Button type="button" variant="ghost" onClick={() => setOpen(false)}><X /></Button></div>{error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="grid grid-cols-1 gap-4 md:grid-cols-2">{fields.map(([key, label, type]) => <label key={key} className="text-sm font-semibold text-slate-600">{label}<Input required={["name"].includes(key)} type={type} value={form[key] ?? ""} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}<label className="text-sm font-semibold text-slate-600">Photo<input className="mt-1 block w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setForm({ ...form, photo: e.target.files?.[0] })} /></label><label className="text-sm font-semibold text-slate-600 md:col-span-2">Description<textarea className="mt-1 min-h-24 w-full rounded-md border border-slate-200 p-2 text-sm" value={form.description ?? ""} onChange={e => setForm({ ...form, description: e.target.value })} /></label></div><div className="mt-6 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={create.isPending || update.isPending} type="submit">Save</Button></div></form></div>}
    </div>
  );
}

function ProductPhoto({ src }: { src: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let objectUrl = "";
    const controller = new AbortController();
    authenticatedFetch(`${API_BASE}${src}`, { headers: adminHeaders(), signal: controller.signal }).then(async res => {
      if (!res.ok) throw new Error("photo_failed");
      const blob = await res.blob(); objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => {});
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src]);
  return url ? <img src={url} alt="" className="h-9 w-9 rounded object-cover" /> : <span className="h-9 w-9 rounded bg-slate-100" />;
}

// -----------------------------------------------------------------------------
// MODALS
// -----------------------------------------------------------------------------
export function BulkOrderModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [submissionError, setSubmissionError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutation = useBulkCreateEcotrackOrders();
  const { data: wilayas = [], isLoading: wilayasLoading, isError: wilayasError } = useEcotrackWilayas();
  const { data: allCommunes = [], isLoading: communesLoading, isError: communesError } = useEcotrackAllCommunes();
  const destLoading = wilayasLoading || communesLoading;
  const destError = wilayasError || communesError;

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
  const patchRow = (id: number, patch: Record<string, string | number>) => setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

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
      .filter(({ phone, phone2 }) => !normalizeDzMobile(phone) || (phone2 && !normalizeDzMobile(phone2)))
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
    const deskRowsPresent = rows.some(row => Boolean(row.stop_desk));
    if (deskRowsPresent && (destLoading || destError)) {
      toast({ title: t("orderUpdates.destError"), variant: "destructive" });
      return;
    }
    const deskWilayaList = stopDeskWilayas(wilayas, allCommunes);
    const homeDeliveryRows = rows
      .map((row, index) => {
        if (!row.stop_desk) return null;
        const wilaya = wilayas.find((w: any) => sameId(w.wilaya_id, row.code_wilaya));
        const commune = communesOfWilaya(wilaya, allCommunes).find((c: any) => normalizeEcotrackLookup(c.nom) === normalizeEcotrackLookup(row.commune));
        const ok = wilaya && commune && communeHasStopDesk(commune) && deskWilayaList.some((w: any) => String(w.wilaya_id) === String(wilaya.wilaya_id));
        return ok ? null : index + 1;
      })
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
            <BulkRows rows={rows} updateRow={updateRow} patchRow={patchRow} removeRow={removeRow} />
          )}
        </div>
        <div className="p-5 border-t border-slate-100 flex justify-end gap-2 bg-slate-50">
          <Button variant="ghost" onClick={onClose}>{t("admin.ecotrackPortal.common.cancel")}</Button>
          <Button onClick={submit} disabled={mutation.isPending || destLoading || rows.length === 0} className="bg-[#E10600] text-white">
            {mutation.isPending || destLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin"/> : null}
            {t("admin.ecotrackPortal.orders.bulkModal.submit")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function useIsDesktop() {
  const q = "(min-width: 1024px)";
  const [v, setV] = useState(() => typeof window !== "undefined" && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q); const f = () => setV(m.matches);
    m.addEventListener("change", f); f();
    return () => m.removeEventListener("change", f);
  }, []);
  return v;
}

type BulkRowProps = {
  rows: any[];
  updateRow: (id: number, field: string, value: string | number) => void;
  patchRow: (id: number, patch: Record<string, string | number>) => void;
  removeRow: (id: number) => void;
};

function BulkRows(props: BulkRowProps) {
  const { t } = useTranslation();
  const desktop = useIsDesktop();
  const f = (k: string) => t(`admin.ecotrackPortal.forms.${k}`);
  if (!desktop) {
    return <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">{props.rows.map((row, i) => <BulkOrderRow key={row.id} row={row} index={i} desktop={false} {...props} />)}</div>;
  }
  return (
    <table className="min-w-[2500px] w-full text-xs text-left">
      <thead className="bg-slate-50 sticky top-0 z-10">
        <tr>
          <th className="px-2 py-2">#</th>
          <th className="px-2 py-2">{f("reference")}</th>
          <th className="px-2 py-2">{f("client")}*</th>
          <th className="px-2 py-2">{f("phone")}*</th>
          <th className="px-2 py-2">{f("phone2")}</th>
          <th className="px-2 py-2">{f("address")}*</th>
          <th className="px-2 py-2">{f("operationType")}*</th>
          <th className="px-2 py-2">{t("orderUpdates.service")}</th>
          <th className="px-2 py-2">{f("wilaya")}*</th>
          <th className="px-2 py-2">{f("commune")}*</th>
          <th className="px-2 py-2">{f("amount")}*</th>
          <th className="px-2 py-2">{f("weight")}</th>
          <th className="px-2 py-2">{t("orderUpdates.fees")}</th>
          <th className="px-2 py-2">{f("products")}</th>
          <th className="px-2 py-2">{f("remark")}</th>
          <th className="px-2 py-2">{f("fragile")}</th>
          <th className="px-2 py-2">{f("mapLink")}</th>
          <th className="px-2 py-2"></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {props.rows.map((row, i) => <BulkOrderRow key={row.id} row={row} index={i} desktop {...props} />)}
      </tbody>
    </table>
  );
}

const bulkSelect = "h-8 w-full min-w-0 rounded-md border border-input bg-white px-2 text-xs";

function BulkOrderRow({ row, index, desktop, updateRow, patchRow, removeRow }: BulkRowProps & { row: any; index: number; desktop: boolean }) {
  const { t } = useTranslation();
  const [notice, setNotice] = useState("");
  const stopDesk = Boolean(row.stop_desk);
  const dest = useDestination({ wilayaId: String(row.code_wilaya ?? ""), commune: String(row.commune ?? ""), stopDesk, keepCurrent: true });
  useEffect(() => {
    if (dest.loading || dest.error || !row.commune) return;
    if (dest.matched) {
      if (String(dest.matched.nom) !== String(row.commune)) updateRow(row.id, "commune", String(dest.matched.nom));
      if (row._commune_valid !== 1) updateRow(row.id, "_commune_valid", 1);
    } else if (row._commune_valid !== 0) {
      updateRow(row.id, "_commune_valid", 0);
    }
  }, [dest.matched, dest.loading, dest.error, row.id, row.commune, row._commune_valid, updateRow]);

  const changeService = (desk: boolean) => {
    setNotice("");
    if (!desk) { updateRow(row.id, "stop_desk", 0); return; }
    // Explicit user action: clear selections that Stop desk cannot serve.
    if (dest.ready && row.code_wilaya) {
      const wilayaOk = dest.deskWilayas.some((w: any) => String(w.wilaya_id) === String(row.code_wilaya));
      if (!wilayaOk) { patchRow(row.id, { stop_desk: 1, code_wilaya: "", commune: "", _commune_valid: 0 }); setNotice(t("orderUpdates.deskCleared")); return; }
      if (row.commune && dest.matched && !communeHasStopDesk(dest.matched)) { patchRow(row.id, { stop_desk: 1, commune: "", _commune_valid: 0 }); setNotice(t("orderUpdates.deskCleared")); return; }
    }
    updateRow(row.id, "stop_desk", 1);
  };
  const deskMismatch = stopDesk && dest.ready && Boolean(row.code_wilaya) && Boolean(row.commune) && dest.matched != null && !dest.deskOk;
  const phoneBad = (v: unknown) => String(v ?? "").trim() !== "" && !normalizeDzMobile(v);

  const input = (field: string, options: React.InputHTMLAttributes<HTMLInputElement> = {}, bad = false) => (
    <Input {...options} aria-invalid={bad || undefined} className={`h-8 w-full min-w-0 text-xs ${bad ? "border-red-400" : ""}`} value={row[field]} onChange={event => updateRow(row.id, field, event.target.value)} />
  );
  const cells = {
    reference: input("reference"),
    client: input("nom_client", { required: true }),
    phone: input("telephone", { required: true, inputMode: "tel" }, phoneBad(row.telephone)),
    phone2: input("telephone_2", { inputMode: "tel" }, phoneBad(row.telephone_2)),
    address: input("adresse", { required: true }),
    operation: (
      <select aria-label={t("orderUpdates.operation")} className={bulkSelect} value={row.type} onChange={event => updateRow(row.id, "type", event.target.value)}>
        <option value="1">{t("admin.ecotrackPortal.forms.delivery")}</option>
        <option value="2">{t("admin.ecotrackPortal.forms.exchange")}</option>
        <option value="3">{t("admin.ecotrackPortal.forms.pickup")}</option>
        <option value="4">{t("admin.ecotrackPortal.forms.collection")}</option>
      </select>
    ),
    service: (
      <div className="space-y-1">
        <select aria-label={t("orderUpdates.service")} className={bulkSelect} value={stopDesk ? "desk" : "home"} onChange={event => changeService(event.target.value === "desk")}>
          <option value="home">{t("orderUpdates.serviceHome")}</option>
          <option value="desk">{t("orderUpdates.serviceDesk")}</option>
        </select>
        {stopDesk && <DestinationStatus dest={dest} stopDesk />}
        {notice && <p className="text-[11px] text-amber-700">{notice}</p>}
        {deskMismatch && <p className="text-[11px] text-amber-700">{t("orderUpdates.rowDeskFallback")}</p>}
      </div>
    ),
    wilaya: <WilayaPicker dest={dest} value={String(row.code_wilaya ?? "")} stopDesk={stopDesk} onChange={v => { setNotice(""); updateRow(row.id, "code_wilaya", v); }} />,
    commune: <CommunePicker dest={dest} wilayaId={String(row.code_wilaya ?? "")} value={String(row.commune ?? "")} onChange={v => { setNotice(""); updateRow(row.id, "commune", v); }} />,
    amount: input("montant", { required: true, type: "number", min: 0 }),
    weight: input("weight", { type: "number", min: 0, step: 0.01 }),
    fees: <FeePreview compact wilayaId={String(row.code_wilaya ?? "")} communeValid={dest.communeValid && Boolean(row.commune)} type={String(row.type)} stopDesk={stopDesk && !deskMismatch} weight={row.weight} />,
    products: input("produit"),
    remark: input("remarque"),
    fragile: <input type="checkbox" checked={Boolean(row.fragile)} onChange={event => updateRow(row.id, "fragile", event.target.checked ? 1 : 0)} />,
    gps: input("gps_link", { type: "url" }),
    del: <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeRow(row.id)}><Trash2 className="w-4 h-4" /></Button>,
  };

  if (desktop) {
    const td = "px-2 py-2";
    return (
      <tr className="align-top odd:bg-white even:bg-slate-50/60">
        <td className={`${td} font-bold text-slate-500`}>{index + 1}</td>
        <td className={`${td} w-32`}>{cells.reference}</td>
        <td className={`${td} w-40`}>{cells.client}</td>
        <td className={`${td} w-36`}>{cells.phone}</td>
        <td className={`${td} w-36`}>{cells.phone2}</td>
        <td className={`${td} w-56`}>{cells.address}</td>
        <td className={`${td} w-36`}>{cells.operation}</td>
        <td className={`${td} w-44`}>{cells.service}</td>
        <td className={`${td} w-44`}>{cells.wilaya}</td>
        <td className={`${td} w-44`}>{cells.commune}</td>
        <td className={`${td} w-28`}>{cells.amount}</td>
        <td className={`${td} w-24`}>{cells.weight}</td>
        <td className={td}>{cells.fees}</td>
        <td className={`${td} w-40`}>{cells.products}</td>
        <td className={`${td} w-40`}>{cells.remark}</td>
        <td className={`${td} text-center`}>{cells.fragile}</td>
        <td className={`${td} w-40`}>{cells.gps}</td>
        <td className={td}>{cells.del}</td>
      </tr>
    );
  }
  const L = (key: string, node: React.ReactNode, span = false) => (
    <div className={`min-w-0 space-y-1 ${span ? "col-span-2" : ""}`}>
      <label className="text-[11px] font-semibold text-slate-600">{key}</label>{node}
    </div>
  );
  const f = (k: string) => t(`admin.ecotrackPortal.forms.${k}`);
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between"><span className="text-sm font-bold text-slate-600">{t("orderUpdates.orderRow", { n: index + 1 })}</span>{cells.del}</div>
      <div className="grid grid-cols-2 gap-2">
        {L(f("reference"), cells.reference)}
        {L(`${f("client")}*`, cells.client)}
        {L(`${f("phone")}*`, cells.phone)}
        {L(f("phone2"), cells.phone2)}
        {L(`${f("address")}*`, cells.address, true)}
        {L(`${f("operationType")}*`, cells.operation)}
        {L(t("orderUpdates.service"), cells.service)}
        {L(`${f("wilaya")}*`, cells.wilaya)}
        {L(`${f("commune")}*`, cells.commune)}
        {L(`${f("amount")}*`, cells.amount)}
        {L(f("weight"), cells.weight)}
        <div className="col-span-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2">{cells.fees}</div>
        {L(f("products"), cells.products, true)}
        {L(f("remark"), cells.remark, true)}
        {L(f("mapLink"), cells.gps)}
        <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium">{cells.fragile}{f("fragile")}</label>
      </div>
    </div>
  );
}

export function OrderDetailsModal({ order, onClose, children }: { order: any; onClose: () => void; children?: React.ReactNode }) {
  const { t } = useTranslation();
  const isSuiviPortal = typeof window !== "undefined" && window.location.pathname.startsWith("/suivi");
  // Suivi has no merchant-reference endpoint. The details already include
  // Ecotrack's Wilaya fields, so don't request /expediteur/ecotrack/wilayas
  // with a Suivi token (that correctly returns 401 and expires that session).
  const { data: wilayas = [] } = useEcotrackWilayas(!children && !isSuiviPortal);
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
    [t("admin.ecotrackPortal.forms.amount"), value("montant") == null || value("montant") === "" ? "—" : formatDZD(value("montant"))],
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
          {children}
        </div>
      </div>
    </div>
  );
}

export function TrackingDetailModal({ tracking, expediteurId, mode = "remarks", onClose }: { tracking: string; expediteurId?: number | string; mode?: "details" | "tracking" | "remarks"; onClose: () => void; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const mutation = useAddEcotrackNote();
  const { data, isLoading, error } = useEcotrackOrderDetail(tracking, expediteurId, mode !== "remarks");
  const { data: remarks, isLoading: remarksLoading, error: remarksError } = useEcotrackRemarks(tracking, expediteurId, mode === "remarks");
  const visibleRemarks = remarks
    ?.map(displayEcotrackRemark)
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")));

  const submit = () => {
    if (!note.trim()) return;
    mutation.mutate({ tracking, content: note, expediteurId }, {
      onSuccess: () => {
        toast({ title: t("admin.ecotrackPortal.common.success") });
        setNote("");
      },
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  if (!tracking) return null;
  if (mode === "remarks") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 p-5">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t("admin.ecotrackPortal.tracking.remarksHistory")}</h2>
            <p className="mt-1 font-mono text-xs text-slate-500">{tracking}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
          {remarksLoading ? <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-[#E10600]" /></div>
            : remarksError ? <p role="alert" className="text-sm text-red-700">
              {remarksError.message === "ecotrack_credentials_reconnect_required"
                ? t("admin.ecotrackPortal.tracking.ecotrackReconnectRequired")
                : `${t("admin.ecotrackPortal.common.error")}: ${remarksError.message}`}
            </p>
            : visibleRemarks?.length ? visibleRemarks.map((item, index) => {
              const source = t(`admin.ecotrackPortal.tracking.${item.source === "station" ? "remarkStation" : item.source === "driver" ? "remarkDriver" : "remarkSender"}`);
              return <article key={`${item.createdAt}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-x-1 text-xs font-semibold text-slate-600">
                  <span>{source}{item.author ? ` - ${item.author}` : ""}</span>
                  <time dateTime={item.createdAt} className="font-normal text-slate-500">{item.createdAt ? ` · ${item.createdAt}` : ""}</time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">{item.text}</p>
              </article>;
            })
            : <p className="text-center text-sm text-slate-500">{t("admin.ecotrackPortal.tracking.noFollowUp")}</p>}
        </div>
        <div className="border-t border-slate-100 p-5">
          <label htmlFor="ecotrack-followup-note" className="mb-2 block text-sm font-semibold text-slate-700">{t("admin.ecotrackPortal.tracking.addNote")}</label>
          <textarea id="ecotrack-followup-note" className="w-full rounded-lg border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600] resize-none"
            rows={3} placeholder={t("admin.ecotrackPortal.tracking.addRemarkPlaceholder")}
            value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="mt-2 flex justify-end">
            <Button onClick={submit} disabled={mutation.isPending || !note.trim()} className="bg-[#E10600] hover:bg-red-700 text-white">
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("admin.ecotrackPortal.common.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
  if (isLoading) return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>;
  if (error || !data?.info) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="rounded-2xl bg-white p-6"><p className="mb-4">{t("admin.ecotrackPortal.common.error")}</p><Button onClick={onClose}>{t("admin.ecotrackPortal.common.close", "Fermer")}</Button></div>
    </div>
  );
  if (mode === "tracking") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-900">{t("admin.ecotrackPortal.tracking.trackOne")}</h2><p className="font-mono text-xs text-slate-500">{tracking}</p></div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
        {data.statusHistory?.length ? <div className="space-y-3">
          {data.statusHistory.map((status: any, index: number) => (
            <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">{humanizeEcotrackStatus(status.status, t)}</p>
              <p className="mt-1 text-xs text-slate-500">{status.occurredAt && !Number.isNaN(new Date(status.occurredAt).getTime()) ? new Date(status.occurredAt).toLocaleString() : "—"}</p>
            </div>
          ))}
        </div> : <p className="text-sm text-slate-500">{t("admin.ecotrackPortal.tracking.noHistory")}</p>}
      </div>
    </div>
  );
  return <OrderDetailsModal order={data.info} onClose={onClose} />;
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
