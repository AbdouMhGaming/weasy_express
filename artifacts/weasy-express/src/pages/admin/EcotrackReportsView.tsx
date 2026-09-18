import React, { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useEcotrackReports } from "@/hooks/use-ecotrack";
import { Loader2, AlertCircle, Filter, X, ArrowUp, ArrowDown, ArrowUpDown, BarChart3 } from "lucide-react";
import { WILAYA_LIST } from "@/lib/wilayas";

export default function EcotrackReportsView() {
  const { t } = useTranslation();
  
  const [dateRange, setDateRange] = useState<"all" | "today" | "yesterday" | "7d" | "30d" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [selectedWilaya, setSelectedWilaya] = useState("");
  type SortKey = "total" | "inTransit" | "inDelivery" | "suspended" | "returnsProcessing" | "delivered" | "returns" | "deliveredPct" | "returnsPct";
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

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

  const reportRows = useMemo(() => {
    const rows = WILAYA_LIST
      .filter(w => !selectedWilaya || String(Number(w.code.replace("DZ", ""))) === selectedWilaya)
      .map((wilaya) => {
        const id = String(Number(wilaya.code.replace("DZ", "")));
        const row: any = rowsMap.get(id) || { total: 0, inTransit: 0, inDelivery: 0, suspended: 0, returnsProcessing: 0, delivered: 0, returns: 0 };
        const total = Number(row.total) || 0;
        const delivered = Number(row.delivered) || 0;
        const returns = Number(row.returns) || 0;
        return {
          ...row,
          wilaya,
          id,
          total,
          inTransit: Number(row.inTransit) || 0,
          inDelivery: Number(row.inDelivery) || 0,
          suspended: Number(row.suspended) || 0,
          returnsProcessing: Number(row.returnsProcessing) || 0,
          delivered,
          returns,
          deliveredPct: total ? (delivered / total) * 100 : 0,
          returnsPct: total ? (returns / total) * 100 : 0,
        };
      });
    return rows.sort((a: any, b: any) => {
      const result = Number(a[sortKey]) - Number(b[sortKey]);
      if (result === 0) return Number(a.id) - Number(b.id);
      return sortDirection === "asc" ? result : -result;
    });
  }, [rowsMap, selectedWilaya, sortKey, sortDirection]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection(direction => direction === "desc" ? "asc" : "desc");
    else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const SortHeader = ({ column, label }: { column: SortKey; label: string }) => {
    const active = sortKey === column;
    const Icon = active ? (sortDirection === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <th className="px-3 py-3 font-semibold text-slate-600">
        <button
          type="button"
          onClick={() => toggleSort(column)}
          className={`group inline-flex w-full items-center gap-1.5 whitespace-nowrap text-start transition-colors ${
            active ? "text-[#E10600]" : "hover:text-slate-900"
          }`}
          data-testid={`sort-report-${column}`}
          aria-sort={active ? (sortDirection === "desc" ? "descending" : "ascending") : "none"}
        >
          {label}
          <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[#E10600]" : "text-slate-300 group-hover:text-slate-500"}`} />
        </button>
      </th>
    );
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden bg-slate-50/50 p-4 sm:p-6 lg:p-8">
      <div className="mb-5 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1 bg-[#E10600]" />
        <div className="flex flex-col gap-5 p-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-red-50 text-[#E10600]">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">{t("admin.ecotrackPortal.reports.title")}</h1>
          <p className="mt-1 text-sm text-slate-500">{t("admin.ecotrackPortal.reports.subtitle")}</p>
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
      </div>

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
            <table className="w-full whitespace-nowrap text-start text-xs">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="sticky start-0 z-20 w-40 bg-slate-50 px-3 py-3 font-semibold text-slate-600">{t("admin.ecotrackPortal.reports.wilayas")}</th>
                  <SortHeader column="total" label={t("admin.ecotrackPortal.reports.totalShipped")} />
                  <SortHeader column="inTransit" label={t("admin.ecotrackPortal.reports.inTransit")} />
                  <SortHeader column="inDelivery" label={t("admin.ecotrackPortal.reports.inDelivery")} />
                  <SortHeader column="suspended" label={t("admin.ecotrackPortal.reports.suspended")} />
                  <SortHeader column="returnsProcessing" label={t("admin.ecotrackPortal.reports.returnsHubAdmin")} />
                  <SortHeader column="delivered" label={t("admin.ecotrackPortal.reports.delivered")} />
                  <SortHeader column="returns" label={t("admin.ecotrackPortal.reports.returns")} />
                  <SortHeader column="deliveredPct" label={t("admin.ecotrackPortal.reports.deliveredPct")} />
                  <SortHeader column="returnsPct" label={t("admin.ecotrackPortal.reports.returnsPct")} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr className="border-b border-red-100 bg-red-50/70 font-bold text-slate-800">
                  <td className="sticky start-0 z-10 bg-red-50 px-3 py-3 text-[#E10600]">Total</td>
                  <td className="px-3 py-3 text-sm font-black text-[#E10600]" data-testid="total-shipped">{totalRow.total}</td>
                  <td className="px-3 py-2.5">{totalRow.inTransit}</td>
                  <td className="px-3 py-2.5">{totalRow.inDelivery}</td>
                  <td className="px-3 py-2.5">{totalRow.suspended}</td>
                  <td className="px-3 py-2.5">{totalRow.returnsProcessing}</td>
                  <td className="px-3 py-2.5">{totalRow.delivered}</td>
                  <td className="px-3 py-2.5">{totalRow.returns}</td>
                  <td className="px-3 py-2.5">{calculatePct(totalRow.delivered, totalRow.total)}</td>
                  <td className="px-3 py-2.5">{calculatePct(totalRow.returns, totalRow.total)}</td>
                </tr>
                {reportRows.map((row: any) => {
                  return (
                    <tr key={row.wilaya.code} className="border-b border-slate-100 transition-colors hover:bg-red-50/30">
                      <td className="sticky start-0 bg-white px-3 py-2.5 font-semibold text-slate-700 shadow-[1px_0_0_0_#e2e8f0]">{row.wilaya.name}</td>
                      <td className="px-3 py-2.5 font-bold text-slate-900">{row.total}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.inTransit}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.inDelivery}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.suspended}</td>
                      <td className="px-3 py-2.5 text-slate-600">{row.returnsProcessing}</td>
                      <td className="px-3 py-2.5 font-semibold text-emerald-700">{row.delivered}</td>
                      <td className="px-3 py-2.5 font-semibold text-red-700">{row.returns}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex min-w-16 justify-center rounded-full px-2 py-1 font-bold ${row.total === 0 ? 'bg-slate-100 text-slate-400' : 'bg-emerald-50 text-emerald-700'}`}>
                        {calculatePct(row.delivered, row.total)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`inline-flex min-w-16 justify-center rounded-full px-2 py-1 font-bold ${row.total === 0 ? 'bg-slate-100 text-slate-400' : row.returnsPct >= 10 ? 'bg-red-100 text-red-800' : 'bg-red-50 text-[#E10600]'}`}>
                        {calculatePct(row.returns, row.total)}
                        </span>
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
