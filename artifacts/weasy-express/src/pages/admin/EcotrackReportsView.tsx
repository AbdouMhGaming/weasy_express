import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useEcotrackReports } from "@/hooks/use-ecotrack";
import { Loader2, AlertCircle, Filter, X } from "lucide-react";
import { WILAYA_LIST } from "@/lib/wilayas";

export default function EcotrackReportsView() {
  const { t } = useTranslation();
  
  const [dateRange, setDateRange] = useState<"all" | "today" | "yesterday" | "7d" | "30d" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedWilaya, setSelectedWilaya] = useState("");

  const localDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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

  const { data: reportsData, isLoading, error } = useEcotrackReports(filters);

  const clearFilters = () => {
    setDateRange("all");
    setCustomFrom("");
    setCustomTo("");
    setSelectedWilaya("");
  };

  const activeFiltersCount = (dateRange !== "all" ? 1 : 0) + (selectedWilaya ? 1 : 0);

  const rowsMap = new Map(reportsData?.rows?.map((r: any) => [String(r.wilayaId), r]) || []);

  const totalRow = useMemo(() => {
    return (reportsData?.rows || []).reduce((acc: any, row: any) => ({
      total: acc.total + (Number(row.total) || 0),
      inTransit: acc.inTransit + (Number(row.inTransit) || 0),
      inDelivery: acc.inDelivery + (Number(row.inDelivery) || 0),
      suspended: acc.suspended + (Number(row.suspended) || 0),
      returnsProcessing: acc.returnsProcessing + (Number(row.returnsProcessing) || 0),
      delivered: acc.delivered + (Number(row.delivered) || 0),
      returns: acc.returns + (Number(row.returns) || 0),
    }), { total: 0, inTransit: 0, inDelivery: 0, suspended: 0, returnsProcessing: 0, delivered: 0, returns: 0 });
  }, [reportsData?.rows]);

  const calculatePct = (part: number, total: number) => {
    if (!total || total === 0) return "0.00%";
    return ((part / total) * 100).toFixed(2) + "%";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50 p-6 overflow-hidden w-full relative">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-sm mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">{t("admin.ecotrackPortal.reports.title")}</h1>
          <p className="text-sm text-slate-500 mt-1">{t("admin.ecotrackPortal.reports.subtitle")}</p>
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
        
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-1 flex flex-wrap">
              {["all", "today", "yesterday", "7d", "30d", "custom"].map((preset) => {
                const key = preset === "7d" ? "d7" : preset === "30d" ? "d30" : preset;
                return (
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
                    {preset === "custom" ? t("admin.ecotrackDashboard.filters.custom") : t(`admin.timePresets.${key}`)}
                  </button>
                );
              })}
            </div>
            
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
            <table className="w-full text-xs text-left whitespace-nowrap">
              <thead className="bg-[#1C2C47] text-white sticky top-0 z-10 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3 w-40">{t("admin.ecotrackPortal.reports.wilayas")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.totalShipped")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.inTransit")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.inDelivery")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.suspended")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.returnsHubAdmin")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.delivered")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.returns")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.deliveredPct")}</th>
                  <th className="px-3 py-3">{t("admin.ecotrackPortal.reports.returnsPct")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="bg-[#2B3E5C] text-white font-bold hover:bg-[#344665]">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="px-3 py-2.5 bg-white text-[#2B3E5C] text-center font-black text-sm" data-testid="total-shipped">{totalRow.total}</td>
                  <td className="px-3 py-2.5">{totalRow.inTransit}</td>
                  <td className="px-3 py-2.5">{totalRow.inDelivery}</td>
                  <td className="px-3 py-2.5">{totalRow.suspended}</td>
                  <td className="px-3 py-2.5">{totalRow.returnsProcessing}</td>
                  <td className="px-3 py-2.5">{totalRow.delivered}</td>
                  <td className="px-3 py-2.5">{totalRow.returns}</td>
                  <td className="px-3 py-2.5">{calculatePct(totalRow.delivered, totalRow.total)}</td>
                  <td className="px-3 py-2.5">{calculatePct(totalRow.returns, totalRow.total)}</td>
                </tr>
                {WILAYA_LIST.filter(w => !selectedWilaya || String(Number(w.code.replace("DZ", ""))) === selectedWilaya).map((wilaya) => {
                  const id = String(Number(wilaya.code.replace("DZ", "")));
                  const row: any = rowsMap.get(id) || { total: 0, inTransit: 0, inDelivery: 0, suspended: 0, returnsProcessing: 0, delivered: 0, returns: 0 };
                  const total = Number(row.total) || 0;
                  const delivered = Number(row.delivered) || 0;
                  const returns = Number(row.returns) || 0;
                  const deliveredPct = total > 0 ? (delivered / total) * 100 : 0;
                  const returnsPct = total > 0 ? (returns / total) * 100 : 0;
                  
                  return (
                    <tr key={wilaya.code} className="hover:bg-slate-50 border-b border-slate-100">
                      <td className="px-3 py-2.5 font-medium text-slate-700 bg-white sticky left-0 shadow-[1px_0_0_0_#e2e8f0]">{wilaya.name}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-800">{total}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.inTransit}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.inDelivery}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.suspended}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.returnsProcessing}</td>
                      <td className="px-3 py-2.5 font-semibold text-emerald-700">{delivered}</td>
                      <td className="px-3 py-2.5 font-semibold text-red-700">{returns}</td>
                      <td className={`px-3 py-2.5 font-bold text-white text-center ${total === 0 ? 'bg-slate-100 text-slate-400' : deliveredPct >= 50 ? 'bg-green-600' : 'bg-green-500'}`}>
                        {calculatePct(delivered, total)}
                      </td>
                      <td className={`px-3 py-2.5 font-bold text-white text-center ${total === 0 ? 'bg-slate-100 text-slate-400' : returnsPct >= 10 ? 'bg-[#CC0000]' : 'bg-[#E10600]'}`}>
                        {calculatePct(returns, total)}
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
