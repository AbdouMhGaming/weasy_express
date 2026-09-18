import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useEcotrackDelays, useEcotrackDelayThresholds, useUpdateEcotrackDelayThresholds } from "@/hooks/use-ecotrack";
import { Loader2, AlertCircle, Filter, X, Search, Clock, Save, Edit2, MapPin, Settings2, Truck, PackageCheck, ArrowUp, ArrowDown, ArrowUpDown, ArrowLeftRight } from "lucide-react";
import { WILAYA_LIST } from "@/lib/wilayas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

export default function EcotrackDelaysView({ role }: { role: "admin" | "expediteur" }) {
  const { t } = useTranslation();

  if (role === "admin") {
    return <AdminDelayThresholdsView t={t} />;
  }
  
  return <ExpediteurDelaysView t={t} />;
}

function ExpediteurDelaysView({ t }: { t: any }) {
  const [selectedWilaya, setSelectedWilaya] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  type DelaySortKey = "enteredAt" | "elapsedHours";
  const [sortKey, setSortKey] = useState<DelaySortKey>("elapsedHours");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const filters = useMemo(() => {
    const f: any = {};
    if (selectedWilaya) f.wilaya = selectedWilaya;
    if (selectedStatus) f.status = selectedStatus;
    if (debouncedSearch) f.search = debouncedSearch;
    return f;
  }, [selectedWilaya, selectedStatus, debouncedSearch]);

  const { data: delaysData, isLoading, error } = useEcotrackDelays(filters);

  const clearFilters = () => {
    setSelectedWilaya("");
    setSelectedStatus("");
    setSearch("");
  };

  const activeFiltersCount = (selectedWilaya ? 1 : 0) + (selectedStatus ? 1 : 0) + (debouncedSearch ? 1 : 0);
  const wilayaNames = useMemo(
    () => new Map(WILAYA_LIST.map((wilaya) => [String(Number(wilaya.code.replace("DZ", ""))), wilaya.name])),
    [],
  );
  const sortedOrders = useMemo(() => {
    const orders = [...(delaysData?.orders || [])];
    return orders.sort((a: any, b: any) => {
      const aValue = sortKey === "enteredAt" ? new Date(a.enteredAt || 0).getTime() : Number(a.elapsedHours) || 0;
      const bValue = sortKey === "enteredAt" ? new Date(b.enteredAt || 0).getTime() : Number(b.elapsedHours) || 0;
      const difference = aValue - bValue;
      return sortDirection === "asc" ? difference : -difference;
    });
  }, [delaysData?.orders, sortKey, sortDirection]);
  const toggleSort = (key: DelaySortKey) => {
    if (sortKey === key) setSortDirection(direction => direction === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };
  const SortIcon = ({ column }: { column: DelaySortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" />;
    return sortDirection === "desc"
      ? <ArrowDown className="h-3.5 w-3.5 text-[#E10600]" />
      : <ArrowUp className="h-3.5 w-3.5 text-[#E10600]" />;
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden bg-slate-50/50 p-4 sm:p-6 lg:p-8">
      <div className="mb-5 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-[#E10600]" />
        <div className="flex flex-col items-start justify-between gap-4 p-5 xl:flex-row xl:items-center">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-[#E10600]"><Clock className="h-5 w-5" /></div>
          <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t("admin.ecotrackPortal.delays.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("admin.ecotrackPortal.delays.subtitle")}</p>
          {activeFiltersCount > 0 && (
            <div className="flex items-center gap-2 mt-3 text-xs">
              <span className="text-slate-500 font-medium flex items-center gap-1">
                <Filter className="w-3 h-3" /> {t("admin.ecotrackDashboard.filters.active")}
              </span>
              <button onClick={clearFilters} className="text-slate-400 hover:text-slate-700 ml-1">
                <X className="w-4 h-4" />
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
                data-testid="delay-search"
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("admin.ecotrackPortal.common.search")}
                className="pl-9 bg-white shadow-sm h-9"
              />
            </div>
            <select 
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 min-w-[150px]"
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              data-testid="filter-status"
            >
              <option value="">{t("admin.ecotrackDashboard.filters.allStatuses")}</option>
              <option value="vers_wilaya">{t("admin.ecotrackPortal.tracking.statusLabels.toWilaya")}</option>
              <option value="en_livraison">{t("admin.ecotrackPortal.tracking.statusLabels.outForDelivery")}</option>
              <option value="suspendu">{t("admin.ecotrackPortal.tracking.statusLabels.suspended")}</option>
              <option value="retour">{t("admin.ecotrackPortal.delays.allReturns")}</option>
            </select>
            <select 
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 min-w-[150px]"
              value={selectedWilaya}
              onChange={e => setSelectedWilaya(e.target.value)}
              data-testid="filter-wilaya"
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
        {isLoading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#E10600]" /></div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-slate-50">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-slate-900 font-semibold">{t("admin.ecotrackPortal.common.error")}</p>
          </div>
        ) : !delaysData?.orders || delaysData.orders.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-slate-50">
            <Clock className="h-12 w-12 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">{t("admin.ecotrackPortal.delays.noDelays")}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.tracking")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.destination")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.orders.table.recipient")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.tracking.status")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    <button type="button" onClick={() => toggleSort("enteredAt")} className={`inline-flex items-center gap-1.5 ${sortKey === "enteredAt" ? "text-[#E10600]" : "hover:text-slate-900"}`} data-testid="sort-delays-entered-at">
                      {t("admin.ecotrackPortal.delays.enteredAt")} <SortIcon column="enteredAt" />
                    </button>
                  </th>
                  <th className="px-4 py-3 font-semibold text-slate-700">
                    <button type="button" onClick={() => toggleSort("elapsedHours")} className={`inline-flex items-center gap-1.5 ${sortKey === "elapsedHours" ? "text-[#E10600]" : "hover:text-slate-900"}`} data-testid="sort-delays-elapsed-hours">
                      {t("admin.ecotrackPortal.delays.elapsedHours")} <SortIcon column="elapsedHours" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedOrders.map((order: any) => (
                  <tr key={order.tracking} className="hover:bg-slate-50 transition-colors" data-testid="overdue-row">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{order.tracking}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">
                      {(() => {
                        const id = String(order.wilayaId ?? order.wilaya_id ?? order.code_wilaya ?? "").replace(/^0+/, "");
                        const name = order.wilayaName || order.wilaya_name || wilayaNames.get(id);
                        return name ? (
                          <span className="inline-flex items-center gap-1.5" data-testid={`delay-destination-${order.tracking}`}>
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-[#E10600]" />
                            ({id}, {name})
                          </span>
                        ) : <span className="text-slate-400">—</span>;
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.recipient || order.client}</div>
                      <div className="text-xs text-slate-500">{order.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-800">
                        {order.status === "vers_wilaya" ? t("admin.ecotrackPortal.tracking.statusLabels.toWilaya") :
                         order.status === "en_livraison" ? t("admin.ecotrackPortal.tracking.statusLabels.outForDelivery") :
                         order.status === "suspendu" || order.status === "suspendus" ? t("admin.ecotrackPortal.tracking.statusLabels.suspended") :
                         order.status?.startsWith("retour_") || order.status?.startsWith("return_") ? t("admin.ecotrackPortal.delays.allReturns") :
                         order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{order.enteredAt ? new Date(order.enteredAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-600">{Number(order.elapsedHours).toFixed(1)}h</span>
                        <span className="text-xs text-slate-400">/ {order.thresholdHours}h</span>
                      </div>
                    </td>
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

function AdminDelayThresholdsView({ t }: { t: any }) {
  const { data: thresholdsData, isLoading, error } = useEcotrackDelayThresholds();
  const updateMutation = useUpdateEcotrackDelayThresholds();
  const { toast } = useToast();

  type Unit = 'h' | 'd';
  type EditVal = { value: string; unit: Unit };
  type ThresholdField = 'versWilaya' | 'enLivraison' | 'suspendu' | 'retour';
  type ThresholdEdit = Record<ThresholdField, EditVal>;
  const [edits, setEdits] = useState<Record<string, ThresholdEdit>>({});
  const [isEditing, setIsEditing] = useState(false);
  const overdueTotals = useMemo(() => (thresholdsData?.rows || []).reduce(
    (totals: { transit: number; delivery: number; suspended: number; returns: number }, row: any) => ({
      transit: totals.transit + (Number(row.versWilayaOverdue) || 0),
      delivery: totals.delivery + (Number(row.enLivraisonOverdue) || 0),
      suspended: totals.suspended + (Number(row.suspenduOverdue) || 0),
      returns: totals.returns + (Number(row.retourOverdue) || 0),
    }),
    { transit: 0, delivery: 0, suspended: 0, returns: 0 },
  ), [thresholdsData?.rows]);
  const thresholdColumns: Array<{ field: ThresholdField; label: string; overdueKey: string; testId: string }> = [
    { field: "versWilaya", label: t("admin.ecotrackPortal.delays.versWilayaHours"), overdueKey: "versWilayaOverdue", testId: "vers-wilaya-overdue" },
    { field: "enLivraison", label: t("admin.ecotrackPortal.delays.enLivraisonHours"), overdueKey: "enLivraisonOverdue", testId: "en-livraison-overdue" },
    { field: "suspendu", label: t("admin.ecotrackPortal.delays.suspenduHours"), overdueKey: "suspenduOverdue", testId: "suspendu-overdue" },
    { field: "retour", label: t("admin.ecotrackPortal.delays.retourHours"), overdueKey: "retourOverdue", testId: "retour-overdue" },
  ];

  React.useEffect(() => {
    if (thresholdsData?.rows && !isEditing) {
      const initialEdits: any = {};
      thresholdsData.rows.forEach((r: any) => {
        const vh = Number(r.versWilayaHours || 48);
        const lh = Number(r.enLivraisonHours || 72);
        const sh = Number(r.suspenduHours || 72);
        const rh = Number(r.retourHours || 72);
        const editValue = (hours: number): EditVal => ({
          value: hours % 24 === 0 ? String(hours / 24) : String(hours),
          unit: hours % 24 === 0 ? 'd' : 'h',
        });
        initialEdits[r.wilayaId] = {
          versWilaya: editValue(vh),
          enLivraison: editValue(lh),
          suspendu: editValue(sh),
          retour: editValue(rh),
        };
      });
      setEdits(initialEdits);
    }
  }, [thresholdsData, isEditing]);

  const handleSave = () => {
    const rows = Object.entries(edits).map(([wilayaId, values]) => {
      const vh = values.versWilaya.unit === 'd' ? Number(values.versWilaya.value) * 24 : Number(values.versWilaya.value);
      const lh = values.enLivraison.unit === 'd' ? Number(values.enLivraison.value) * 24 : Number(values.enLivraison.value);
      const sh = values.suspendu.unit === 'd' ? Number(values.suspendu.value) * 24 : Number(values.suspendu.value);
      const rh = values.retour.unit === 'd' ? Number(values.retour.value) * 24 : Number(values.retour.value);
      return {
        wilayaId,
        versWilayaHours: vh,
        enLivraisonHours: lh,
        suspenduHours: sh,
        retourHours: rh,
      };
    });
    updateMutation.mutate(rows, {
      onSuccess: () => {
        toast({ title: t("admin.ecotrackPortal.common.success") });
        setIsEditing(false);
      },
      onError: (err) => toast({ title: t("admin.ecotrackPortal.common.error"), description: err.message, variant: "destructive" })
    });
  };

  const handleUnitChange = (wilayaId: string, field: ThresholdField, newUnit: Unit) => {
    setEdits(prev => {
      const current = prev[wilayaId][field];
      if (current.unit === newUnit) return prev;
      const num = Number(current.value);
      const newValue = newUnit === 'd' ? num / 24 : num * 24;
      return {
        ...prev,
        [wilayaId]: { ...prev[wilayaId], [field]: { value: String(newValue), unit: newUnit } }
      };
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden bg-slate-50/50 p-4 sm:p-6 lg:p-8">
      <div className="mb-5 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-[#E10600]" />
        <div className="flex flex-col items-start justify-between gap-5 p-5 xl:flex-row xl:items-center">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-[#E10600]"><Settings2 className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t("admin.ecotrackPortal.delays.thresholdsTitle")}</h1>
            <p className="text-sm text-slate-500 mt-1">{t("admin.ecotrackPortal.delays.thresholdsSubtitle")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)}>{t("admin.ecotrackPortal.common.cancel")}</Button>
              <Button data-testid="save-thresholds" onClick={handleSave} disabled={updateMutation.isPending} className="bg-[#E10600] text-white hover:bg-red-700">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                {t("admin.ecotrackPortal.common.save")}
              </Button>
            </>
          ) : (
            <Button data-testid="edit-thresholds" onClick={() => setIsEditing(true)} className="bg-[#E10600] text-white hover:bg-red-700">
              <Edit2 className="w-4 h-4 mr-2" />
              {t("admin.ecotrackPortal.common.edit")}
            </Button>
          )}
        </div>
        </div>
      </div>

      {!isLoading && !error && (
        <div className="mb-5 grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex items-center gap-4 rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-50 text-orange-600"><Truck className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("admin.ecotrackPortal.delays.versWilayaHours")}</p>
              <p className="mt-0.5 text-2xl font-black text-slate-900" data-testid="total-vers-wilaya-overdue">{overdueTotals.transit}</p>
            </div>
            <span className="ms-auto rounded-full bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-700">{t("admin.ecotrackPortal.delays.overdue")}</span>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-red-100 bg-white p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-[#E10600]"><PackageCheck className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("admin.ecotrackPortal.delays.enLivraisonHours")}</p>
              <p className="mt-0.5 text-2xl font-black text-slate-900" data-testid="total-en-livraison-overdue">{overdueTotals.delivery}</p>
            </div>
            <span className="ms-auto rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-[#E10600]">{t("admin.ecotrackPortal.delays.overdue")}</span>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-purple-100 bg-white p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-purple-50 text-purple-600"><AlertCircle className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("admin.ecotrackPortal.delays.suspenduHours")}</p>
              <p className="mt-0.5 text-2xl font-black text-slate-900" data-testid="total-suspendu-overdue">{overdueTotals.suspended}</p>
            </div>
            <span className="ms-auto rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">{t("admin.ecotrackPortal.delays.overdue")}</span>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-amber-100 bg-white p-4 shadow-sm">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600"><ArrowLeftRight className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t("admin.ecotrackPortal.delays.retourHours")}</p>
              <p className="mt-0.5 text-2xl font-black text-slate-900" data-testid="total-retour-overdue">{overdueTotals.returns}</p>
            </div>
            <span className="ms-auto rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{t("admin.ecotrackPortal.delays.overdue")}</span>
          </div>
        </div>
      )}

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex h-full items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#E10600]" /></div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center p-12 text-center bg-slate-50">
            <AlertCircle className="h-10 w-10 text-red-500 mb-3" />
            <p className="text-slate-900 font-semibold">{t("admin.ecotrackPortal.common.error")}</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.reports.wilayas")}</th>
                  {thresholdColumns.map(column => (
                    <th key={column.field} className="border-s border-slate-200 px-4 py-3 font-semibold text-slate-700">{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {WILAYA_LIST.map((wilaya) => {
                  const id = String(Number(wilaya.code.replace("DZ", "")));
                  const row = thresholdsData?.rows?.find((r: any) => String(r.wilayaId) === id) || {};
                  const editData = edits[id] || {
                    versWilaya: { value: "48", unit: "h" },
                    enLivraison: { value: "72", unit: "h" },
                    suspendu: { value: "72", unit: "h" },
                    retour: { value: "72", unit: "h" },
                  };
                  
                  return (
                    <tr key={wilaya.code} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-700">
                        <span className="me-2 inline-flex min-w-7 justify-center rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-black text-slate-500">{id}</span>
                        {wilaya.name}
                      </td>
                      
                      {thresholdColumns.map(column => (
                        <td key={column.field} className="border-s border-slate-100 px-4 py-3">
                          <div className="flex items-center gap-3">
                            {isEditing ? (
                              <div className="flex items-center">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  className="w-20 h-8 rounded-r-none border-r-0 focus:z-10 focus-visible:z-10"
                                  value={editData[column.field].value}
                                  onChange={(e) => setEdits(prev => ({
                                    ...prev,
                                    [id]: {
                                      ...prev[id],
                                      [column.field]: { ...prev[id][column.field], value: e.target.value },
                                    },
                                  }))}
                                />
                                <select
                                  className="h-8 rounded-l-none border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#E10600] z-0"
                                  value={editData[column.field].unit}
                                  onChange={(e) => handleUnitChange(id, column.field, e.target.value as Unit)}
                                >
                                  <option value="h">h</option>
                                  <option value="d">d</option>
                                </select>
                              </div>
                            ) : (
                              <span className="font-semibold min-w-[3rem]">{editData[column.field].value}{editData[column.field].unit}</span>
                            )}
                            {Number(row[column.overdueKey]) > 0 && (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800" data-testid={column.testId}>
                                {row[column.overdueKey]} {t("admin.ecotrackPortal.delays.overdue")}
                              </span>
                            )}
                          </div>
                        </td>
                      ))}

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}