import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useEcotrackDelays, useEcotrackDelayThresholds, useUpdateEcotrackDelayThresholds } from "@/hooks/use-ecotrack";
import { Loader2, AlertCircle, Filter, X, Search, Clock, Save, Edit2 } from "lucide-react";
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50 p-6 overflow-hidden w-full relative">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 shrink-0">
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

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
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
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.delays.enteredAt")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.delays.elapsedHours")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {delaysData.orders.map((order: any) => (
                  <tr key={order.tracking} className="hover:bg-slate-50 transition-colors" data-testid="overdue-row">
                    <td className="px-4 py-3 font-mono font-bold text-slate-900">{order.tracking}</td>
                    <td className="px-4 py-3 font-medium text-slate-700">{order.wilayaName || order.wilaya}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{order.recipient || order.client}</div>
                      <div className="text-xs text-slate-500">{order.phone}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold bg-orange-100 text-orange-800">
                        {order.status === "vers_wilaya" ? t("admin.ecotrackPortal.tracking.statusLabels.toWilaya") :
                         order.status === "en_livraison" ? t("admin.ecotrackPortal.tracking.statusLabels.outForDelivery") :
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
  const [edits, setEdits] = useState<Record<string, { versWilaya: EditVal, enLivraison: EditVal }>>({});
  const [isEditing, setIsEditing] = useState(false);

  React.useEffect(() => {
    if (thresholdsData?.rows && !isEditing) {
      const initialEdits: any = {};
      thresholdsData.rows.forEach((r: any) => {
        const vh = Number(r.versWilayaHours || 48);
        const lh = Number(r.enLivraisonHours || 72);
        initialEdits[r.wilayaId] = {
          versWilaya: {
            value: vh % 24 === 0 ? String(vh / 24) : String(vh),
            unit: vh % 24 === 0 ? 'd' : 'h'
          },
          enLivraison: {
            value: lh % 24 === 0 ? String(lh / 24) : String(lh),
            unit: lh % 24 === 0 ? 'd' : 'h'
          }
        };
      });
      setEdits(initialEdits);
    }
  }, [thresholdsData, isEditing]);

  const handleSave = () => {
    const rows = Object.entries(edits).map(([wilayaId, values]) => {
      const vh = values.versWilaya.unit === 'd' ? Number(values.versWilaya.value) * 24 : Number(values.versWilaya.value);
      const lh = values.enLivraison.unit === 'd' ? Number(values.enLivraison.value) * 24 : Number(values.enLivraison.value);
      return {
        wilayaId,
        versWilayaHours: vh,
        enLivraisonHours: lh,
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

  const handleUnitChange = (wilayaId: string, field: 'versWilaya' | 'enLivraison', newUnit: Unit) => {
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
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50 p-6 overflow-hidden w-full relative">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t("admin.ecotrackPortal.delays.thresholdsTitle")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("admin.ecotrackPortal.delays.thresholdsSubtitle")}</p>
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
            <Button data-testid="edit-thresholds" onClick={() => setIsEditing(true)} className="bg-slate-800 text-white hover:bg-slate-900">
              <Edit2 className="w-4 h-4 mr-2" />
              {t("admin.ecotrackPortal.common.edit")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
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
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.delays.versWilayaHours")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackPortal.delays.enLivraisonHours")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {WILAYA_LIST.map((wilaya) => {
                  const id = String(Number(wilaya.code.replace("DZ", "")));
                  const row = thresholdsData?.rows?.find((r: any) => String(r.wilayaId) === id) || { versWilayaOverdue: 0, enLivraisonOverdue: 0 };
                  const editData = edits[id] || { versWilaya: { value: "48", unit: "h" }, enLivraison: { value: "72", unit: "h" } };
                  
                  return (
                    <tr key={wilaya.code} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{wilaya.name}</td>
                      
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {isEditing ? (
                            <div className="flex items-center">
                              <Input 
                                type="number" 
                                min="0" 
                                step="any"
                                className="w-20 h-8 rounded-r-none border-r-0 focus:z-10 focus-visible:z-10" 
                                value={editData.versWilaya.value}
                                onChange={(e) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], versWilaya: { ...prev[id].versWilaya, value: e.target.value } } }))}
                              />
                              <select 
                                className="h-8 rounded-l-none border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#E10600] z-0"
                                value={editData.versWilaya.unit}
                                onChange={(e) => handleUnitChange(id, 'versWilaya', e.target.value as Unit)}
                              >
                                <option value="h">h</option>
                                <option value="d">d</option>
                              </select>
                            </div>
                          ) : (
                            <span className="font-semibold min-w-[3rem]">{editData.versWilaya.value}{editData.versWilaya.unit}</span>
                          )}
                          {row.versWilayaOverdue > 0 && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800" data-testid="vers-wilaya-overdue">
                              {row.versWilayaOverdue} {t("admin.ecotrackPortal.delays.overdue")}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {isEditing ? (
                            <div className="flex items-center">
                              <Input 
                                type="number" 
                                min="0" 
                                step="any"
                                className="w-20 h-8 rounded-r-none border-r-0 focus:z-10 focus-visible:z-10" 
                                value={editData.enLivraison.value}
                                onChange={(e) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], enLivraison: { ...prev[id].enLivraison, value: e.target.value } } }))}
                              />
                              <select 
                                className="h-8 rounded-l-none border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#E10600] z-0"
                                value={editData.enLivraison.unit}
                                onChange={(e) => handleUnitChange(id, 'enLivraison', e.target.value as Unit)}
                              >
                                <option value="h">h</option>
                                <option value="d">d</option>
                              </select>
                            </div>
                          ) : (
                            <span className="font-semibold min-w-[3rem]">{editData.enLivraison.value}{editData.enLivraison.unit}</span>
                          )}
                          {row.enLivraisonOverdue > 0 && (
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800" data-testid="en-livraison-overdue">
                              {row.enLivraisonOverdue} {t("admin.ecotrackPortal.delays.overdue")}
                            </span>
                          )}
                        </div>
                      </td>

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