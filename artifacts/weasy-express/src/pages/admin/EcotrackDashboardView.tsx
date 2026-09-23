import React, { useState, useMemo, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  useEcotrackAnalytics,
  useDeleteEcotrackOrder,
  useLabelEcotrackOrder,
  useEcotrackOrders,
  useEcotrackWilayas,
  useRequestReturnEcotrackOrder,
  useValidateEcotrackOrder,
} from "@/hooks/use-ecotrack";
import {
  Package, CheckCircle, ArrowLeftRight, AlertCircle, Loader2, Activity, TrendingUp, TrendingDown, RefreshCcw, Filter, X, Truck, ChevronLeft, ChevronRight, Plus, ListPlus, Search, MapPin, Phone, Hash, Eye, Edit2, Download, Trash2, MessageSquare
} from "lucide-react";
import AlgeriaMapSvg from "@/assets/algeria-map.svg?raw";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { OrderFormModal, BulkOrderModal, OrderDetailsModal, TrackingDetailModal } from "./EcotrackWorkspaceView";
import { useToast } from "@/hooks/use-toast";
import { NotificationsBell } from "@/components/NotificationsBell";

const ECOTRACK_STATUS_KEYS: Record<string, string> = {
  pret_a_expedier: "readyToShip",
  prete_a_expedier: "readyToShip",
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

function wilayaHeatColor(count: number, maxCount: number): string {
  if (count === 0 || maxCount === 0) return "#f8fafc";
  const r = count / maxCount;
  const red = Math.round(254 + r * (225 - 254));
  const green = Math.round(226 + r * (6 - 226));
  const blue = Math.round(226 + r * (0 - 226));
  return `rgb(${red},${green},${blue})`;
}

const formatDZD = (num: number) => new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD', maximumFractionDigits: 0 }).format(num);
const formatPct = (num: number) => (num ?? 0).toFixed(1) + "%";
const timePresetKey = (preset: string) =>
  preset === "7d" ? "d7" : preset === "30d" ? "d30" : preset;
const localDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function EcotrackDashboardView() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<"all" | "today" | "yesterday" | "7d" | "30d" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedWilaya, setSelectedWilaya] = useState<string>("");
  const [productPage, setProductPage] = useState(1);
  const [productsPerPage, setProductsPerPage] = useState(5);

  const filters = useMemo(() => {
    const f: any = {};
    if (selectedWilaya) f.wilaya = selectedWilaya;
    
    if (dateRange !== "all") {
      const today = new Date();
      if (dateRange === "custom") {
        if (customFrom) f.from = customFrom;
        if (customTo) f.to = customTo;
      } else if (dateRange === "today") {
        f.from = localDate(today);
        f.to = localDate(today);
      } else if (dateRange === "yesterday") {
        const y = new Date(today);
        y.setDate(y.getDate() - 1);
        f.from = localDate(y);
        f.to = localDate(y);
      } else if (dateRange === "7d") {
        const past = new Date(today);
        past.setDate(past.getDate() - 6);
        f.from = localDate(past);
        f.to = localDate(today);
      } else if (dateRange === "30d") {
        const past = new Date(today);
        past.setDate(past.getDate() - 29);
        f.from = localDate(past);
        f.to = localDate(today);
      }
    }
    return f;
  }, [dateRange, customFrom, customTo, selectedWilaya]);

  const { data: analytics, isLoading: isLoadingAnalytics, error: analyticsError, refetch } = useEcotrackAnalytics(filters);
  const { data: wilayas = [] } = useEcotrackWilayas();

  const wilayaNames = useMemo(
    () => new Map(wilayas.map((w: any) => [String(w.wilaya_id), w.wilaya_name])),
    [wilayas]
  );

  const stats = analytics?.summary;
  const outcomes = analytics?.outcomes;
  const trend = analytics?.trend || [];
  const byWilaya = analytics?.byWilaya || [];
  const deliveryModes = analytics?.deliveryModes || { home: 0, stopDesk: 0 };
  const products = analytics?.products || [];
  const statusesList = analytics?.statuses || [];
  const inDelivery = statusesList
    .filter((item: any) => String(item.status ?? "").trim().toLocaleLowerCase().replace(/[\s-]+/g, "_") === "en_livraison")
    .reduce((total: number, item: any) => total + Number(item.count || 0), 0);
  const productPageCount = Math.max(1, Math.ceil(products.length / productsPerPage));
  const safeProductPage = Math.min(productPage, productPageCount);
  const productStart = products.length ? (safeProductPage - 1) * productsPerPage : 0;
  const visibleProducts = products.slice(productStart, productStart + productsPerPage);
  const productPages = useMemo<(number | string)[]>(() => {
    if (productPageCount <= 7) return Array.from({ length: productPageCount }, (_, index) => index + 1);
    if (safeProductPage <= 4) return [1, 2, 3, 4, 5, "end", productPageCount];
    if (safeProductPage >= productPageCount - 3) {
      return [1, "start", productPageCount - 4, productPageCount - 3, productPageCount - 2, productPageCount - 1, productPageCount];
    }
    return [1, "start", safeProductPage - 1, safeProductPage, safeProductPage + 1, "end", productPageCount];
  }, [productPageCount, safeProductPage]);

  const [hoveredWilaya, setHoveredWilaya] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const [isFabOpen, setIsFabOpen] = useState(false);
  const [isQuickSearchOpen, setIsQuickSearchOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");
  const [debouncedQuickSearch, setDebouncedQuickSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedParcel, setSelectedParcel] = useState<any | null>(null);
  const [detailOrder, setDetailOrder] = useState<any | null>(null);
  const [detailTracking, setDetailTracking] = useState("");
  const [noteTracking, setNoteTracking] = useState("");
  const fabRef = useRef<HTMLDivElement>(null);
  const quickSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuickSearch(quickSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [quickSearch]);

  const quickSearchReady = isQuickSearchOpen && debouncedQuickSearch.length >= 2;
  const { data: quickSearchData, isLoading: isQuickSearching } = useEcotrackOrders(
    { page: 1, search: debouncedQuickSearch, status: "all", sort: "updated_desc" },
    { enabled: quickSearchReady, refetchInterval: false },
  );
  const deleteMutation = useDeleteEcotrackOrder();
  const validateMutation = useValidateEcotrackOrder();
  const labelMutation = useLabelEcotrackOrder();
  const returnMutation = useRequestReturnEcotrackOrder();

  const actionError = (err: Error) => toast({
    title: t("admin.ecotrackPortal.common.error"),
    description: err.message,
    variant: "destructive",
  });
  const actionSuccess = () => toast({ title: t("admin.ecotrackPortal.common.success") });
  const handleQuickDelete = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackPortal.orders.deleteConfirm"))) return;
    deleteMutation.mutate(tracking, { onSuccess: actionSuccess, onError: actionError });
  };
  const handleQuickShip = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackPortal.orders.shipConfirm"))) return;
    validateMutation.mutate({ tracking, ask_collection: false }, { onSuccess: actionSuccess, onError: actionError });
  };
  const handleQuickLabel = (tracking: string) => {
    labelMutation.mutate(tracking, {
      onSuccess: (url) => {
        if (!url) return;
        window.open(url, "_blank");
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      onError: actionError,
    });
  };
  const handleQuickReturn = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackPortal.tracking.returnConfirm"))) return;
    returnMutation.mutate(tracking, { onSuccess: actionSuccess, onError: actionError });
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setIsFabOpen(false);
        setIsQuickSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isQuickSearchOpen) window.setTimeout(() => quickSearchInputRef.current?.focus(), 50);
  }, [isQuickSearchOpen]);

  const hoveredWilayaData = useMemo(() => {
    if (!hoveredWilaya) return null;
    const data = byWilaya.find((w: any) => String(w.wilayaId) === hoveredWilaya);
    if (data) return data;
    return {
      wilayaId: hoveredWilaya,
      total: 0,
      delivered: 0,
      returned: 0,
      amount: 0,
      successRate: 0,
    };
  }, [hoveredWilaya, byWilaya]);

  const mapSvg = useMemo(() => {
    if (!byWilaya.length) {
      return AlgeriaMapSvg
        .replace(/fill="[^"]*"/g, 'fill="#f8fafc"')
        .replace(/stroke="[^"]*"/g, 'stroke="#e2e8f0"')
        .replace(/stroke-width="[^"]*"/g, 'stroke-width="0.5"');
    }
    const maxCount = Math.max(...byWilaya.map((w: any) => w.total), 1);
    const styleRules = byWilaya
      .filter((w: any) => w.total > 0)
      .map((w: any) => {
        const code = "DZ" + String(w.wilayaId).padStart(2, '0');
        const isHovered = hoveredWilaya === String(w.wilayaId);
        const fill = isHovered ? "#E10600" : wilayaHeatColor(w.total, maxCount);
        return `#${code}{fill:${fill}!important}`;
      })
      .join(" ");
    
    const base = AlgeriaMapSvg
      .replace(/fill="[^"]*"/g, 'fill="#f8fafc"')
      .replace(/stroke="[^"]*"/g, 'stroke="#cbd5e1"')
      .replace(/stroke-width="[^"]*"/g, 'stroke-width="0.5"');
      
    return styleRules ? base.replace(/(<svg[^>]*>)/, `$1<style>${styleRules}</style>`) : base;
  }, [byWilaya, hoveredWilaya]);

  const handleMapHover = (e: React.MouseEvent) => {
    const target = e.target as SVGElement;
    if (target.tagName === 'path' && target.id && target.id.startsWith('DZ')) {
      const code = target.id.replace('DZ', '').replace(/^0+/, '');
      setHoveredWilaya(code);
    } else {
      setHoveredWilaya(null);
    }
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const clearFilters = () => {
    setDateRange("all");
    setCustomFrom("");
    setCustomTo("");
    setSelectedWilaya("");
    setProductPage(1);
  };

  if (analyticsError && (analyticsError as Error).message === "disconnected") {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">{t("admin.ecotrackPortal.disconnected")}</h2>
        <p className="text-slate-500 max-w-md">{t("admin.ecotrackPortal.disconnectedDesc")}</p>
      </div>
    );
  }

  if (analyticsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-12 text-center bg-slate-50">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">{t("admin.ecotrackDashboard.error.title")}</h2>
        <p className="text-slate-500 max-w-md mb-6">{t("admin.ecotrackDashboard.error.desc")}</p>
        <button onClick={() => refetch()} className="px-5 py-2.5 bg-[#E10600] text-white rounded-xl font-semibold shadow-sm hover:bg-red-700 transition-colors flex items-center gap-2">
          <RefreshCcw className="w-4 h-4" />
          {t("admin.ecotrackDashboard.error.retry")}
        </button>
      </div>
    );
  }

  const KpiCard = ({ title, value, icon, comparison, invertComparison = false, valueColor = "text-slate-900" }: any) => {
    const isUp = comparison > 0;
    const isDown = comparison < 0;
    let trendColor = "text-slate-400";
    let TrendIcon = TrendingUp;
    
    if (comparison !== undefined && comparison !== null) {
      if (invertComparison) {
        trendColor = isDown ? "text-emerald-500" : isUp ? "text-red-500" : "text-slate-400";
      } else {
        trendColor = isUp ? "text-emerald-500" : isDown ? "text-red-500" : "text-slate-400";
      }
      TrendIcon = isDown ? TrendingDown : TrendingUp;
    }

    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col justify-between" data-testid={`kpi-card-${title.replace(/\\s+/g, '-')}`}>
        <div className="flex justify-between items-start mb-2">
          <div className="text-sm font-semibold text-slate-500">{title}</div>
          <div className="p-2 rounded-xl bg-slate-50 text-slate-400">{icon}</div>
        </div>
        <div className="mt-1">
          <div className={`text-3xl font-black ${valueColor}`}>{value ?? <span className="opacity-0">0</span>}</div>
          {comparison !== undefined && comparison !== null && (
            <div className="flex items-center mt-2 text-xs font-medium">
              <span className={`flex items-center gap-1 ${trendColor}`}>
                <TrendIcon className="w-3 h-3" />
                {Math.abs(comparison)}%
              </span>
              <span className="text-slate-400 ml-2">{t("admin.ecotrackDashboard.misc.vsPrevious")}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const activeFiltersCount = (dateRange !== "all" ? 1 : 0) + (selectedWilaya ? 1 : 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-slate-50/50 space-y-6 overflow-y-auto w-full relative">
      <div className="flex justify-end">
        <NotificationsBell />
      </div>
      
      {/* Tooltip for Map */}
      {hoveredWilayaData && (
        <div 
          className="fixed z-50 bg-slate-900 text-white p-3 rounded-xl shadow-xl pointer-events-none transform -translate-x-1/2 -translate-y-full mt-[-10px] min-w-[180px]"
          style={{ left: mousePos.x, top: mousePos.y }}
        >
          <div className="font-bold text-sm border-b border-slate-700 pb-2 mb-2">
            {wilayaNames.get(String(hoveredWilayaData.wilayaId))}
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">{t("admin.ecotrackDashboard.map.hoverTotal")}:</span>
              <span className="font-semibold">{hoveredWilayaData.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-400">{t("admin.ecotrackDashboard.map.hoverDelivered")}:</span>
              <span className="font-semibold">{hoveredWilayaData.delivered}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-orange-400">{t("admin.ecotrackDashboard.map.hoverReturned")}:</span>
              <span className="font-semibold">{hoveredWilayaData.returned}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-700">
              <span className="text-slate-400">{t("admin.ecotrackDashboard.map.hoverSuccess")}:</span>
              <span className="font-semibold">{formatPct(hoveredWilayaData.successRate)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header & Filters */}
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t("admin.ecotrackDashboard.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("admin.ecotrackDashboard.subtitle")}</p>
          
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 mt-4 text-xs">
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <Filter className="w-3 h-3" /> {t("admin.ecotrackDashboard.filters.active")}
              </span>
              {dateRange !== "all" && (
                <span className="bg-[#E10600]/10 text-[#E10600] px-2 py-1 rounded-md font-semibold">
                  {dateRange === "custom"
                    ? t("admin.ecotrackDashboard.filters.custom")
                    : t(`admin.timePresets.${timePresetKey(dateRange)}`)}
                </span>
              )}
              {selectedWilaya && <span className="bg-[#E10600]/10 text-[#E10600] px-2 py-1 rounded-md font-semibold">{wilayaNames.get(selectedWilaya)}</span>}
              <button onClick={clearFilters} className="text-slate-400 hover:text-slate-700 ml-1">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-1 flex flex-wrap">
              {["all", "today", "yesterday", "7d", "30d", "custom"].map((preset) => (
                <button
                  key={preset}
                  data-testid={`filter-date-${preset}`}
                  onClick={() => setDateRange(preset as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    dateRange === preset 
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200" 
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {preset === "custom"
                    ? t("admin.ecotrackDashboard.filters.custom")
                    : t(`admin.timePresets.${timePresetKey(preset)}`)}
                </button>
              ))}
            </div>
            
            <select 
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 min-w-[150px]"
              value={selectedWilaya}
              onChange={e => setSelectedWilaya(e.target.value)}
              data-testid="filter-wilaya"
            >
              <option value="">{t("admin.ecotrackDashboard.filters.allWilayas")}</option>
              {wilayas.map((w: any) => (
                <option key={w.wilaya_id} value={w.wilaya_id}>{w.wilaya_name}</option>
              ))}
            </select>
          </div>
          
          {dateRange === "custom" && (
            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200 animate-in fade-in zoom-in slide-in-from-top-2 duration-200">
              <span className="text-xs text-slate-500 font-medium pl-2">{t("admin.ecotrackDashboard.filters.from")}</span>
              <input 
                type="date" 
                className="text-xs rounded-lg border border-slate-200 px-2 py-1 focus:ring-1 focus:ring-[#E10600]"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
              />
              <span className="text-xs text-slate-500 font-medium">{t("admin.ecotrackDashboard.filters.to")}</span>
              <input 
                type="date" 
                className="text-xs rounded-lg border border-slate-200 px-2 py-1 focus:ring-1 focus:ring-[#E10600]"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {isLoadingAnalytics ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-[#E10600]" />
        </div>
      ) : (
        <>
          {/* Top KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <KpiCard 
              title={t("admin.ecotrackDashboard.kpi.orders")} 
              value={stats?.orders?.toLocaleString()} 
              icon={<Package className="w-5 h-5" />} 
              comparison={analytics?.comparison?.orders}
            />
            <KpiCard 
              title={t("admin.ecotrackDashboard.kpi.delivered")} 
              value={outcomes?.delivered?.toLocaleString()} 
              icon={<CheckCircle className="w-5 h-5 text-emerald-500" />} 
              valueColor="text-emerald-600"
            />
            <KpiCard 
              title={t("admin.ecotrackDashboard.kpi.returned")} 
              value={outcomes?.returned?.toLocaleString()} 
              icon={<ArrowLeftRight className="w-5 h-5 text-orange-500" />} 
              valueColor="text-orange-600"
            />
            <KpiCard
              title={t("admin.ecotrackDashboard.kpi.inDelivery")}
              value={inDelivery.toLocaleString()}
              icon={<Truck className="w-5 h-5 text-indigo-500" />}
              valueColor="text-indigo-600"
            />
            <KpiCard 
              title={t("admin.ecotrackDashboard.kpi.successRate")} 
              value={formatPct(stats?.successRate)} 
              icon={<Activity className="w-5 h-5 text-blue-500" />} 
              valueColor="text-blue-600"
            />
            <KpiCard 
              title={t("admin.ecotrackDashboard.kpi.returnRate")} 
              value={formatPct(stats?.returnRate)} 
              icon={<Activity className="w-5 h-5 text-orange-500" />} 
              valueColor="text-orange-600"
            />
          </div>

          {/* Charts & Delivery Modes Row */}
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
            
            {/* Trend Chart - Volume */}
            <div className="xl:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm p-5" data-testid="chart-trend-volume">
              <h3 className="text-base font-bold text-slate-900 mb-6">{t("admin.ecotrackDashboard.trends.title")} - {t("admin.ecotrackDashboard.trends.orders")}</h3>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorReturned" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#94a3b8' }} dx={-10} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 'bold', color: '#0f172a', marginBottom: '4px' }}
                    />
                    <Area type="monotone" dataKey="orders" name={t("admin.ecotrackDashboard.trends.orders")} stroke="#94a3b8" strokeWidth={2} fillOpacity={1} fill="url(#colorOrders)" />
                    <Area type="monotone" dataKey="delivered" name={t("admin.ecotrackDashboard.trends.delivered")} stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDelivered)" />
                    <Area type="monotone" dataKey="returned" name={t("admin.ecotrackDashboard.trends.returned")} stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorReturned)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Delivery Modes */}
            <div className="xl:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col">
              <h3 className="text-base font-bold text-slate-900 mb-4">{t("admin.ecotrackDashboard.breakdowns.deliveryModes")}</h3>
              <div className="flex-1 flex flex-col justify-center gap-6">
                <div className="text-center">
                  <div className="text-3xl font-black text-blue-600 mb-1">{deliveryModes.home}</div>
                  <div className="text-sm font-semibold text-slate-500">{t("admin.ecotrackDashboard.breakdowns.modeHome")}</div>
                </div>
                <div className="text-center pt-6 border-t border-slate-100">
                  <div className="text-3xl font-black text-purple-600 mb-1">{deliveryModes.stopDesk}</div>
                  <div className="text-sm font-semibold text-slate-500">{t("admin.ecotrackDashboard.breakdowns.modeStopDesk")}</div>
                </div>
              </div>
            </div>

          </div>

          {/* Map, Wilayas & Products Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-6">
            
            {/* Map */}
            <div className="lg:col-span-2 xl:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col relative" data-testid="chart-map">
              <h3 className="text-base font-bold text-slate-900 mb-2">{t("admin.ecotrackDashboard.map.title")}</h3>
              <p className="text-xs text-slate-500 mb-6">{t("admin.ecotrackDashboard.map.subtitle")}</p>
              <div 
                className="flex-1 w-full min-h-[350px] max-h-[500px] flex items-center justify-center overflow-hidden map-container cursor-crosshair"
                dangerouslySetInnerHTML={{ __html: mapSvg }}
                onMouseMove={handleMapHover}
                onMouseLeave={() => setHoveredWilaya(null)}
              />
            </div>

            {/* Top Wilayas */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col" data-testid="list-top-wilayas">
              <h3 className="text-base font-bold text-slate-900 mb-4">{t("admin.ecotrackDashboard.map.topWilayas")}</h3>
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 max-h-[500px]">
                {byWilaya.slice(0, 10).map((w: any, index: number) => {
                  const wilayaName = wilayaNames.get(String(w.wilayaId)) || `${t("admin.ecotrackDashboard.map.hoverWilaya")} ${w.wilayaId}`;
                  const percentage = Math.round((w.total / (stats?.orders || 1)) * 100);
                  return (
                    <div 
                      key={w.wilayaId} 
                      className="group relative p-3 rounded-xl border border-slate-100 hover:border-red-200 hover:bg-red-50/50 transition-colors" 
                      data-testid={`top-wilaya-${w.wilayaId}`}
                      onMouseEnter={() => setHoveredWilaya(String(w.wilayaId))}
                      onMouseLeave={() => setHoveredWilaya(null)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-400 w-4">{index + 1}.</span>
                          <span className="text-sm font-semibold text-slate-800">{wilayaName}</span>
                        </div>
                        <span className="text-sm font-black text-slate-900">{w.total}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-emerald-600 font-medium">{w.delivered} {t("admin.ecotrackDashboard.map.hoverDelivered").toLowerCase()}</span>
                      </div>
                    </div>
                  );
                })}
                {byWilaya.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    {t("admin.ecotrackDashboard.map.noData")}
                  </div>
                )}
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col" data-testid="top-products">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h3 className="text-base font-bold text-slate-900">{t("admin.ecotrackDashboard.breakdowns.products")}</h3>
                <label className="flex items-center gap-2 text-xs text-slate-500">
                  {t("admin.ecotrackDashboard.pagination.rowsPerPage")}
                  <select
                    value={productsPerPage}
                    onChange={(event) => {
                      setProductsPerPage(Number(event.target.value));
                      setProductPage(1);
                    }}
                    className="h-8 rounded-lg border border-slate-200 bg-white px-2 font-semibold text-slate-700"
                    data-testid="products-page-size"
                  >
                    {[5, 10, 20].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
              </div>
              <div className="divide-y divide-slate-100 border-y border-slate-100">
                {products.length > 0 ? (
                  visibleProducts.map((p: any, i: number) => (
                    <div key={`${p.name}-${productStart + i}`} className="flex items-center justify-between gap-4 py-3">
                      <div className="font-semibold text-sm text-slate-900 truncate" title={p.name}>{p.name}</div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">
                        {p.count}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    {t("admin.ecotrackDashboard.map.noData")}
                  </div>
                )}
              </div>
              {products.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-4">
                  <p className="text-xs text-slate-500" data-testid="products-visible-range">
                    {t("admin.ecotrackDashboard.pagination.showing", {
                      from: productStart + 1,
                      to: Math.min(productStart + productsPerPage, products.length),
                      total: products.length,
                    })}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setProductPage(Math.max(1, safeProductPage - 1))}
                      disabled={safeProductPage === 1}
                      aria-label={t("admin.ecotrackDashboard.pagination.previous")}
                      className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4 rtl:rotate-180" />
                    </button>
                    {productPages.map((page) => typeof page === "number" ? (
                      <button
                        type="button"
                        key={page}
                        onClick={() => setProductPage(page)}
                        className={`h-8 min-w-8 rounded-lg px-2 text-xs font-bold ${
                          page === safeProductPage ? "bg-[#E10600] text-white" : "border border-slate-200 text-slate-600"
                        }`}
                      >
                        {page}
                      </button>
                    ) : <span key={page} className="px-1 text-slate-400">…</span>)}
                    <button
                      type="button"
                      onClick={() => setProductPage(Math.min(productPageCount, safeProductPage + 1))}
                      disabled={safeProductPage === productPageCount}
                      aria-label={t("admin.ecotrackDashboard.pagination.next")}
                      className="h-8 w-8 grid place-items-center rounded-lg border border-slate-200 text-slate-600 disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>

        </>
      )}

      {/* Floating Action Button */}
      <div ref={fabRef} className="fixed bottom-8 end-8 z-50 flex flex-col items-end gap-2">
        {isQuickSearchOpen && (
          <div
            className="mb-1 w-[min(92vw,410px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15"
            data-testid="quick-search-panel"
          >
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white p-3">
              <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    ref={quickSearchInputRef}
                    value={quickSearch}
                    onChange={(event) => setQuickSearch(event.target.value)}
                    placeholder={t("admin.ecotrackPortal.quickSearch.placeholder")}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-9 text-sm text-slate-900 outline-none transition focus:border-[#E10600] focus:ring-2 focus:ring-red-100"
                    data-testid="input-quick-order-search"
                  />
                  {quickSearch && (
                    <button
                      type="button"
                      onClick={() => setQuickSearch("")}
                      className="absolute end-2.5 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      data-testid="button-clear-quick-order-search"
                      aria-label={t("admin.ecotrackPortal.common.clear")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickSearchOpen(false)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  data-testid="button-close-quick-order-search"
                  aria-label={t("admin.ecotrackPortal.common.close")}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="max-h-[360px] overflow-y-auto p-2">
              {!quickSearchReady ? (
                <div className="px-4 py-8 text-center">
                  <Search className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">{t("admin.ecotrackPortal.quickSearch.hint")}</p>
                </div>
              ) : isQuickSearching ? (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm font-medium text-slate-500">
                  <Loader2 className="h-5 w-5 animate-spin text-[#E10600]" />
                  {t("admin.ecotrackPortal.quickSearch.searching")}
                </div>
              ) : !quickSearchData?.data?.length ? (
                <div className="px-4 py-8 text-center text-sm font-medium text-slate-500">
                  {t("admin.ecotrackPortal.quickSearch.noResults")}
                </div>
              ) : (
                <div className="space-y-1">
                  {quickSearchData.data.slice(0, 8).map((order: any) => {
                    const wilayaId = String(order.wilaya_id ?? order.code_wilaya ?? "").replace(/^0+/, "");
                    const wilayaName = wilayaNames.get(wilayaId);
                    const normalizedStatus = String(order.status ?? "")
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .trim()
                      .toLocaleLowerCase()
                      .replace(/[\s-]+/g, "_");
                    const isReadyToShip = normalizedStatus === "prete_a_expedier" || normalizedStatus === "pret_a_expedier";
                    return (
                      <div
                        key={order.tracking}
                        className="rounded-xl border border-transparent px-3 py-3 transition hover:border-red-100 hover:bg-red-50/40"
                        data-testid={`quick-search-result-${order.tracking}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-mono text-sm font-black text-slate-900">
                              <Hash className="h-3.5 w-3.5 text-[#E10600]" />
                              {order.tracking}
                            </div>
                            <p className="mt-1 truncate text-sm font-semibold text-slate-700">{order.client || order.nom_client || "—"}</p>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">
                            {humanizeEcotrackStatus(order.status, t)}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{wilayaName ? `(${wilayaId}, ${wilayaName})` : "—"}</span>
                          {(order.phone || order.telephone) && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{order.phone || order.telephone}</span>}
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                          {isReadyToShip ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setDetailOrder(order)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
                                title={t("admin.ecotrackPortal.orders.details.title")}
                                data-testid={`quick-action-details-${order.tracking}`}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => { setSelectedParcel(order); setIsModalOpen(true); }}
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
                                title={t("admin.ecotrackPortal.orders.modify")}
                                data-testid={`quick-action-edit-${order.tracking}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickShip(order.tracking)}
                                disabled={validateMutation.isPending}
                                className="grid h-8 w-8 place-items-center rounded-lg text-emerald-600 transition hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
                                title={t("admin.ecotrackPortal.orders.ship")}
                                data-testid={`quick-action-ship-${order.tracking}`}
                              >
                                <Truck className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickLabel(order.tracking)}
                                disabled={labelMutation.isPending}
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                                title={t("admin.ecotrackPortal.orders.downloadLabel")}
                                data-testid={`quick-action-label-${order.tracking}`}
                              >
                                <Download className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickDelete(order.tracking)}
                                disabled={deleteMutation.isPending}
                                className="grid h-8 w-8 place-items-center rounded-lg text-red-600 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                                title={t("admin.ecotrackPortal.orders.delete")}
                                data-testid={`quick-action-delete-${order.tracking}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => setDetailOrder(order)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                                title={t("admin.ecotrackPortal.orders.details.title")}
                                data-testid={`quick-action-details-${order.tracking}`}
                              >
                                <Package className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDetailTracking(order.tracking)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-blue-600 transition hover:bg-blue-50 hover:text-blue-700"
                                title={t("admin.ecotrackPortal.tracking.trackOne")}
                                data-testid={`quick-action-tracking-${order.tracking}`}
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setNoteTracking(order.tracking)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-purple-600 transition hover:bg-purple-50 hover:text-purple-700"
                                title={t("admin.ecotrackPortal.tracking.addNote")}
                                data-testid={`quick-action-note-${order.tracking}`}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleQuickReturn(order.tracking)}
                                disabled={returnMutation.isPending}
                                className="grid h-8 w-8 place-items-center rounded-lg text-amber-600 transition hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40"
                                title={t("admin.ecotrackPortal.tracking.requestReturn")}
                                data-testid={`quick-action-return-${order.tracking}`}
                              >
                                <ArrowLeftRight className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {Number(quickSearchData.pagination?.total) > 8 && (
                    <p className="px-3 py-2 text-center text-xs font-semibold text-slate-400">
                      {t("admin.ecotrackPortal.quickSearch.moreResults", { count: Number(quickSearchData.pagination.total) - 8 })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {isFabOpen && (
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => { setSelectedParcel(null); setIsModalOpen(true); setIsFabOpen(false); }}
              className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-full shadow-lg border border-slate-100 text-slate-700 hover:bg-slate-50 transition-colors"
              data-testid="button-add-one-order"
            >
              <span className="text-sm font-semibold">{t("admin.ecotrackPortal.orders.addOne")}</span>
              <div className="bg-[#1a237e] text-white p-1.5 rounded-full">
                <Plus className="w-4 h-4" />
              </div>
            </button>
            <button
              onClick={() => { setIsBulkModalOpen(true); setIsFabOpen(false); }}
              className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-full shadow-lg border border-slate-100 text-slate-700 hover:bg-slate-50 transition-colors"
              data-testid="button-add-multiple-orders"
            >
              <span className="text-sm font-semibold">{t("admin.ecotrackPortal.orders.addMultiple")}</span>
              <div className="bg-slate-200 text-slate-700 p-1.5 rounded-full">
                <ListPlus className="w-4 h-4" />
              </div>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setIsQuickSearchOpen((open) => !open);
            setIsFabOpen(false);
          }}
          className={`h-14 w-14 rounded-full text-white shadow-xl flex items-center justify-center transition-all hover:scale-105 ${
            isQuickSearchOpen ? "bg-[#E10600] shadow-red-500/25" : "bg-slate-800 hover:bg-slate-900 shadow-slate-900/20"
          }`}
          title={t("admin.ecotrackPortal.common.search")}
          data-testid="search-shortcut"
        >
          {isQuickSearchOpen ? <X className="w-6 h-6" /> : <Search className="w-6 h-6" />}
        </button>
        <button 
          onClick={() => { setIsFabOpen(!isFabOpen); setIsQuickSearchOpen(false); }}
          className={`h-14 w-14 rounded-full bg-[#E10600] hover:bg-red-700 text-white shadow-xl shadow-red-500/30 flex items-center justify-center transition-transform duration-200 ${isFabOpen ? 'rotate-45' : ''}`}
          data-testid="button-new-order-menu"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>

      {isModalOpen && <OrderFormModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setSelectedParcel(null); }} parcel={selectedParcel} isEdit={Boolean(selectedParcel)} />}
      {isBulkModalOpen && <BulkOrderModal isOpen={isBulkModalOpen} onClose={() => setIsBulkModalOpen(false)} />}
      {detailOrder && <OrderDetailsModal order={detailOrder} onClose={() => setDetailOrder(null)} />}
      {detailTracking && <TrackingDetailModal tracking={detailTracking} mode="tracking" onClose={() => setDetailTracking("")} />}
      {noteTracking && <TrackingDetailModal tracking={noteTracking} onClose={() => setNoteTracking("")} />}
      
      <style>{`
        .map-container svg { width: 100%; height: 100%; object-fit: contain; }
      `}</style>
    </div>
  );
}
