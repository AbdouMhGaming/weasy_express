import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { 
  RefreshCw, Search, Plus, Download, Trash2, Edit2, 
  CheckCircle, ArrowLeftRight, X, AlertCircle, Loader2, Package, MapPin,
  Eye, MessageSquare, Clock, Upload
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  useEcotrackDashboard, 
  useEcotrackOrders, 
  useEcotrackSync, 
  useEcotrackWilayas,
  useEcotrackCommunes,
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

export default function EcotrackWorkspaceView({ onOpenSettings }: { onOpenSettings?: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [activeTab, setActiveTab] = useState<"parcels" | "desks" | "fees" | "products" | "bulk">("parcels");

  // Dashboard Data
  const { 
    data: dashboard, 
    isLoading: isLoadingDashboard, 
    error: dashboardError,
    refetch: refetchDashboard 
  } = useEcotrackDashboard();
  
  const syncMutation = useEcotrackSync();

  const handleSync = () => {
    syncMutation.mutate(undefined, {
      onSuccess: () => {
        toast({ title: t("admin.ecotrackWorkspace.syncing") });
        refetchDashboard();
      },
      onError: (err) => {
        toast({ 
          title: t("admin.ecotrackWorkspace.errors.actionFailed"),
          description: err.message,
          variant: "destructive" 
        });
      }
    });
  };

  if (dashboardError?.message === "disconnected") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[calc(100vh-4rem)] bg-slate-50">
        <AlertCircle className="h-16 w-16 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">{t("admin.ecotrackWorkspace.errors.disconnected")}</h2>
        {onOpenSettings && (
          <Button onClick={onOpenSettings} className="mt-4 bg-[#E10600]">
            {t("admin.ecotrackWorkspace.settingsButton", "Go to Settings")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] bg-slate-50/50">
      {/* Header Stats Panel */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0 z-10">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("admin.ecotrackWorkspace.title")}</h1>
            <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
              {t("admin.ecotrackWorkspace.lastSync")} 
              <span className="font-medium text-slate-700">
                {dashboard?.sync?.last_synced_at ? new Date(dashboard.sync.last_synced_at).toLocaleString() : t("admin.ecotrackWorkspace.never")}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={handleSync}
              disabled={syncMutation.isPending}
              className="text-slate-700 border-slate-200 hover:bg-slate-50 h-10 px-4"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
              {syncMutation.isPending ? t("admin.ecotrackWorkspace.syncing") : t("admin.ecotrackWorkspace.sync")}
            </Button>
          </div>
        </div>

        {isLoadingDashboard ? (
          <div className="flex items-center justify-center h-20"><Loader2 className="h-6 w-6 animate-spin text-[#E10600]" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-4 mb-4">
            <StatCard title={t("admin.ecotrackWorkspace.stats.total")} value={dashboard?.totals?.orders ?? 0} />
            <StatCard title={t("admin.ecotrackWorkspace.stats.revenue")} value={formatDZD(dashboard?.totals?.montant ?? 0)} color="text-emerald-700" highlight />
            <StatCard title={t("admin.ecotrackWorkspace.form.tarif_prestation")} value={formatDZD(dashboard?.totals?.tarifPrestation ?? 0)} color="text-blue-600" />
            <StatCard title={t("admin.ecotrackWorkspace.form.tarif_retour")} value={formatDZD(dashboard?.totals?.tarifRetour ?? 0)} color="text-amber-600" />
          </div>
        )}

        <div className="flex border-b border-slate-200 mt-2">
          {(['parcels', 'bulk', 'desks', 'fees', 'products'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === tab ? 'border-[#E10600] text-[#E10600]' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'}`}
            >
              {t(`admin.ecotrackWorkspace.tabs.${tab}`, { defaultValue: tab })}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "parcels" && <ParcelsTab dashboard={dashboard} />}
      {activeTab === "bulk" && <BulkTab />}
      {activeTab === "desks" && <DesksTab />}
      {activeTab === "fees" && <FeesTab />}
      {activeTab === "products" && <ProductsTab />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Subcomponents
// -----------------------------------------------------------------------------

function ParcelsTab({ dashboard }: { dashboard: any }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [selectedParcel, setSelectedParcel] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [detailTracking, setDetailTracking] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { 
    data: ordersData, 
    isLoading: isLoadingOrders,
    isFetching: isFetchingOrders,
  } = useEcotrackOrders({ page, search: debouncedSearch, status: statusFilter });

  const deleteMutation = useDeleteEcotrackOrder();
  const validateMutation = useValidateEcotrackOrder();
  const returnMutation = useRequestReturnEcotrackOrder();
  const labelMutation = useLabelEcotrackOrder();

  const handleDelete = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackWorkspace.deleteConfirm"))) return;
    deleteMutation.mutate(tracking, {
      onSuccess: () => toast({ title: t("admin.ecotrackWorkspace.toasts.deleteSuccess", "Parcel deleted") }),
      onError: (err) => toast({ title: t("admin.ecotrackWorkspace.toasts.error", "Error"), description: err.message, variant: "destructive" })
    });
  };

  const handleValidate = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackWorkspace.validateConfirm"))) return;
    validateMutation.mutate({ tracking, ask_collection: false }, {
      onSuccess: () => toast({ title: t("admin.ecotrackWorkspace.toasts.validateSuccess", "Parcel validated") }),
      onError: (err) => toast({ title: t("admin.ecotrackWorkspace.toasts.error", "Error"), description: err.message, variant: "destructive" })
    });
  };

  const handleRequestReturn = (tracking: string) => {
    if (!window.confirm(t("admin.ecotrackWorkspace.returnConfirm"))) return;
    returnMutation.mutate(tracking, {
      onSuccess: () => toast({ title: t("admin.ecotrackWorkspace.toasts.returnSuccess", "Return requested") }),
      onError: (err) => toast({ title: t("admin.ecotrackWorkspace.toasts.error", "Error"), description: err.message, variant: "destructive" })
    });
  };

  const handleDownloadLabel = (tracking: string) => {
    labelMutation.mutate(tracking, {
      onSuccess: (url) => {
        if (url) {
          window.open(url, '_blank');
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        } else {
          toast({ title: t("admin.ecotrackWorkspace.toasts.labelError"), variant: "destructive" });
        }
      },
      onError: (err) => toast({ title: t("admin.ecotrackWorkspace.toasts.error", "Error"), description: err.message, variant: "destructive" })
    });
  };

  const dynamicStatuses = dashboard?.statuses || [];
  const statusOptions = ["all", ...dynamicStatuses.map((s: any) => s.status)];

  return (
    <div className="flex-1 flex flex-col min-h-0 p-6 overflow-hidden">
      <div className="flex flex-col sm:flex-row gap-3 mb-4 shrink-0">
        <div className="relative flex-1 max-w-md flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.ecotrackWorkspace.search")} 
              className="pl-9 bg-white border-slate-200 shadow-sm"
            />
          </div>
          <Button onClick={() => { setSelectedParcel(null); setIsEditMode(false); setIsModalOpen(true); }} className="bg-[#1a237e] hover:bg-[#11185b] text-white h-10 shrink-0">
            <Plus className="h-4 w-4 mr-2" />
            {t("admin.ecotrackWorkspace.actions.create")}
          </Button>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {statusOptions.map(status => {
            const statInfo = dynamicStatuses.find((s: any) => s.status === status);
            return (
              <button
                key={status}
                onClick={() => { setStatusFilter(status); setPage(1); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  statusFilter === status 
                    ? "bg-slate-800 text-white" 
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm"
                }`}
              >
                {status === "all" ? t("admin.ecotrackWorkspace.filters.all") : status}
                {statInfo && statInfo.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${statusFilter === status ? "bg-white/20" : "bg-slate-100"}`}>
                    {statInfo.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-auto">
          {isLoadingOrders ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#E10600]" />
            </div>
          ) : ordersData?.data?.length === 0 ? (
            <div className="flex flex-col h-full items-center justify-center text-center p-8">
              <Package className="h-12 w-12 text-slate-200 mb-3" />
              <h3 className="text-lg font-bold text-slate-900">{t("admin.ecotrackWorkspace.empty.title")}</h3>
              <p className="text-slate-500 mt-1 max-w-sm">{t("admin.ecotrackWorkspace.empty.desc")}</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_#e2e8f0]">
                <tr>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackWorkspace.table.tracking")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackWorkspace.table.recipient")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackWorkspace.table.destination")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700">{t("admin.ecotrackWorkspace.table.status")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right">{t("admin.ecotrackWorkspace.table.amount")}</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 text-right w-[200px]">{t("admin.ecotrackWorkspace.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 relative">
                {isFetchingOrders && (
                  <div className="absolute inset-0 bg-white/50 backdrop-blur-[1px] flex items-center justify-center z-20">
                    <Loader2 className="h-6 w-6 animate-spin text-[#E10600]" />
                  </div>
                )}
                {ordersData?.data?.map((order: any) => (
                  <tr key={order.tracking} className="hover:bg-slate-50/70 transition-colors group h-[68px]">
                    <td className="px-4 py-2">
                      <div className="font-mono font-bold text-slate-900">{order.tracking}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{order.created_at ? new Date(order.created_at).toLocaleDateString() : '—'}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">{order.client}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{order.phone}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="font-medium text-slate-700">{order.wilaya_id}</span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 ml-5">{order.commune_id || '—'}</div>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={order.process_state_id || order.status} />
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-slate-900">
                      {formatDZD(order.montant || 0)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50" onClick={() => setDetailTracking(order.tracking)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-100" onClick={() => handleDownloadLabel(order.tracking)}>
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600 hover:text-slate-900 hover:bg-slate-100" onClick={() => { setSelectedParcel(order); setIsEditMode(true); setIsModalOpen(true); }}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => handleValidate(order.tracking)}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(order.tracking)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50" onClick={() => handleRequestReturn(order.tracking)}>
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
           <PaginationBar 
             page={page} 
             totalPages={ordersData?.pagination?.last_page ?? 1} 
             totalItems={ordersData?.pagination?.total ?? 0} 
             pageSize={pageSize} 
             setPage={setPage} 
             setPageSize={setPageSize} 
           />
        </div>
      </div>

      {isModalOpen && <ParcelModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} parcel={selectedParcel} isEdit={isEditMode} />}
      {detailTracking && <DetailModal tracking={detailTracking} onClose={() => setDetailTracking(null)} />}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Other Tabs
// -----------------------------------------------------------------------------

function BulkTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [rows, setRows] = useState<any[]>([]);
  const mutation = useBulkCreateEcotrackOrders();

  const addRow = () => {
    if (rows.length >= 100) return;
    setRows(prev => [...prev, { id: Date.now(), reference: '', nom_client: '', telephone: '', adresse: '', code_wilaya: '', commune: '', montant: '', type: '1' }]);
  };

  const removeRow = (id: number) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const updateRow = (id: number, field: string, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const submit = () => {
    if (rows.length === 0) return;
    const orders = rows.map(({ id, ...rest }) => rest);
    mutation.mutate(orders, {
      onSuccess: () => {
        toast({ title: t("admin.ecotrackWorkspace.bulk.success") });
        setRows([]);
      },
      onError: (err) => {
        toast({ title: t("admin.ecotrackWorkspace.toasts.error"), description: err.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col h-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="font-bold text-lg">{t("admin.ecotrackWorkspace.bulk.title")}</h2>
          <div className="flex gap-2">
            <Button variant="outline" onClick={addRow}><Plus className="w-4 h-4 mr-1"/> {t("admin.ecotrackWorkspace.bulk.addRow")}</Button>
            <Button onClick={submit} disabled={mutation.isPending || rows.length === 0} className="bg-[#1a237e] text-white">
              {mutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin"/> : <Upload className="w-4 h-4 mr-1"/>}
              {t("admin.ecotrackWorkspace.bulk.submit")}
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {rows.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-slate-400 border-2 border-dashed rounded-xl border-slate-200">
              {t("admin.ecotrackWorkspace.bulk.clear", "Click Add Row to start")}
            </div>
          ) : (
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2">{t("admin.ecotrackWorkspace.form.reference")}</th>
                  <th className="px-2 py-2">{t("admin.ecotrackWorkspace.form.recipientName")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackWorkspace.form.recipientPhone")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackWorkspace.form.wilaya")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackWorkspace.form.commune")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackWorkspace.form.address")}*</th>
                  <th className="px-2 py-2">{t("admin.ecotrackWorkspace.form.amount")}*</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="px-2 py-2"><Input className="h-8 text-xs" value={r.reference} onChange={e => updateRow(r.id, 'reference', e.target.value)} /></td>
                    <td className="px-2 py-2"><Input className="h-8 text-xs" value={r.nom_client} onChange={e => updateRow(r.id, 'nom_client', e.target.value)} /></td>
                    <td className="px-2 py-2"><Input className="h-8 text-xs" value={r.telephone} onChange={e => updateRow(r.id, 'telephone', e.target.value)} /></td>
                    <td className="px-2 py-2"><Input className="h-8 text-xs w-16" value={r.code_wilaya} onChange={e => updateRow(r.id, 'code_wilaya', e.target.value)} placeholder="ID" /></td>
                    <td className="px-2 py-2"><Input className="h-8 text-xs" value={r.commune} onChange={e => updateRow(r.id, 'commune', e.target.value)} /></td>
                    <td className="px-2 py-2"><Input className="h-8 text-xs" value={r.adresse} onChange={e => updateRow(r.id, 'adresse', e.target.value)} /></td>
                    <td className="px-2 py-2"><Input className="h-8 text-xs w-24" type="number" value={r.montant} onChange={e => updateRow(r.id, 'montant', e.target.value)} /></td>
                    <td className="px-2 py-2"><Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeRow(r.id)}><Trash2 className="w-4 h-4"/></Button></td>
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

function DesksTab() {
  const { t } = useTranslation();
  const { data, isLoading } = useEcotrackDesks();
  if (isLoading) return <div className="p-6"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>;
  return (
    <div className="p-6 overflow-auto">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h3 className="font-bold mb-4">{t("admin.ecotrackWorkspace.tabs.desks", "Desks")}</h3>
        <pre className="text-xs text-slate-600 bg-slate-50 p-4 rounded overflow-auto max-h-64">{JSON.stringify(data?.my_desk, null, 2)}</pre>
        <h3 className="font-bold my-4">{t("admin.ecotrackWorkspace.tabs.desks", "Other Desks")}</h3>
        <pre className="text-xs text-slate-600 bg-slate-50 p-4 rounded overflow-auto max-h-64">{JSON.stringify(data?.other_desks, null, 2)}</pre>
      </div>
    </div>
  );
}

function FeesTab() {
  const { t } = useTranslation();
  const { data, isLoading } = useEcotrackFees();
  if (isLoading) return <div className="p-6"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>;
  return (
    <div className="p-6 overflow-auto">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h3 className="font-bold mb-4">{t("admin.ecotrackWorkspace.tabs.fees", "Fees")}</h3>
        <pre className="text-xs text-slate-600 bg-slate-50 p-4 rounded overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      </div>
    </div>
  );
}

function ProductsTab() {
  const { t } = useTranslation();
  const { data, isLoading } = useEcotrackProducts();
  if (isLoading) return <div className="p-6"><Loader2 className="w-6 h-6 animate-spin text-slate-400"/></div>;
  return (
    <div className="p-6 overflow-auto">
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
        <h3 className="font-bold mb-4">{t("admin.ecotrackWorkspace.tabs.products", "Products")}</h3>
        <pre className="text-xs text-slate-600 bg-slate-50 p-4 rounded overflow-auto max-h-[60vh]">{JSON.stringify(data?.products, null, 2)}</pre>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Form & Detail Modals
// -----------------------------------------------------------------------------

function StatCard({ title, value, color = "text-slate-900", highlight = false }: { title: string, value: string | number, color?: string, highlight?: boolean }) {
  return (
    <div className={`p-4 rounded-xl border shadow-sm ${highlight ? 'bg-emerald-50/30 border-emerald-100' : 'bg-white border-slate-100'}`}>
      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 truncate">{title}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string | number }) {
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
      {status}
    </span>
  );
}

function ParcelModal({ 
  isOpen, onClose, parcel, isEdit
}: { 
  isOpen: boolean; onClose: () => void; parcel: any; isEdit: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const createMutation = useCreateEcotrackOrder();
  const updateMutation = useUpdateEcotrackOrder();
  
  const { data: wilayasData } = useEcotrackWilayas();
  
  const [formData, setFormData] = useState<any>(
    parcel || {
      reference: "",
      client: "",
      phone: "",
      phone_2: "",
      adresse: "",
      wilaya_id: "",
      commune_name: "", // Will hold the text name for API
      montant: 0,
      tarif_prestation: 0,
      tarif_retour: 0,
      products: "",
      stop_desk: false,
      fragile: false,
      gps_link: "",
      type: "1",
      remarque: ""
    }
  );

  // Initialize commune_name from parcel object if editing
  useEffect(() => {
    if (parcel && parcel.commune_id && !formData.commune_name) {
      setFormData((f: any) => ({ ...f, commune_name: parcel.commune_id }));
    }
  }, [parcel]);

  const { data: communesData } = useEcotrackCommunes(formData.wilaya_id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Map to exactly what Ecotrack needs for Creation vs Update
    const communeVal = communesData?.find((c: any) => c.nom === formData.commune_name)?.nom || formData.commune_name;

    if (isEdit && parcel) {
      const payload = {
        tracking: parcel.tracking,
        client: formData.client,
        tel: formData.phone,
        tel2: formData.phone_2,
        adresse: formData.adresse,
        commune: communeVal,
        wilaya: formData.wilaya_id,
        montant: formData.montant,
        remarque: formData.remarque,
        product: formData.products,
        type: formData.type || 1,
        stop_desk: formData.stop_desk ? 1 : 0,
        fragile: formData.fragile ? 1 : 0,
        gps_link: formData.gps_link
      };

      updateMutation.mutate(payload, {
        onSuccess: () => {
          toast({ title: t("admin.ecotrackWorkspace.toasts.updated") });
          onClose();
        },
        onError: (err) => toast({ title: t("admin.ecotrackWorkspace.toasts.error", "Error"), description: err.message, variant: "destructive" })
      });
    } else {
      const payload = {
        nom_client: formData.client,
        telephone: formData.phone,
        telephone_2: formData.phone_2,
        adresse: formData.adresse,
        commune: communeVal,
        code_wilaya: formData.wilaya_id,
        montant: formData.montant,
        type: formData.type || 1,
        reference: formData.reference,
        remarque: formData.remarque,
        produit: formData.products,
        stop_desk: formData.stop_desk ? 1 : 0,
        fragile: formData.fragile ? 1 : 0,
        gps_link: formData.gps_link
      };

      createMutation.mutate(payload, {
        onSuccess: () => {
          toast({ title: t("admin.ecotrackWorkspace.toasts.created") });
          onClose();
        },
        onError: (err) => toast({ title: t("admin.ecotrackWorkspace.toasts.error", "Error"), description: err.message, variant: "destructive" })
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">
            {isEdit ? t("admin.ecotrackWorkspace.form.title") : t("admin.ecotrackWorkspace.actions.create")}
          </h2>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <form id="parcel-form" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.reference")}</label>
                <Input 
                  value={formData.reference || ""} 
                  onChange={e => setFormData((f: any) => ({ ...f, reference: e.target.value }))}
                  disabled={isEdit} // Generally can't update reference later via this API
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.recipientName")} *</label>
                <Input 
                  required
                  value={formData.client || ""} 
                  onChange={e => setFormData((f: any) => ({ ...f, client: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.recipientPhone")} *</label>
                <Input 
                  required
                  value={formData.phone || ""} 
                  onChange={e => setFormData((f: any) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.phone_2")}</label>
                <Input 
                  value={formData.phone_2 || ""} 
                  onChange={e => setFormData((f: any) => ({ ...f, phone_2: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.wilaya")} *</label>
                <select 
                  required
                  className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                  value={formData.wilaya_id || ""}
                  onChange={e => setFormData((f: any) => ({ ...f, wilaya_id: e.target.value, commune_name: "" }))}
                >
                  <option value="">{t("admin.ecotrackWorkspace.form.select")}</option>
                  {wilayasData?.map((w: any) => (
                    <option key={w.id || w.wilaya_id} value={w.id || w.wilaya_id}>{w.name || w.wilaya_name}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.commune")} *</label>
                <select 
                  required
                  className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                  value={formData.commune_name || ""}
                  onChange={e => setFormData((f: any) => ({ ...f, commune_name: e.target.value }))}
                  disabled={!formData.wilaya_id}
                >
                  <option value="">{t("admin.ecotrackWorkspace.form.select")}</option>
                  {communesData?.map((c: any) => (
                    <option key={c.id || c.commune_id} value={c.nom}>{c.nom}</option>
                  ))}
                  {!communesData && formData.commune_name && <option value={formData.commune_name}>{formData.commune_name}</option>}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.address")} *</label>
              <Input 
                required
                value={formData.adresse || ""} 
                onChange={e => setFormData((f: any) => ({ ...f, adresse: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.amount")} *</label>
                <Input 
                  type="number"
                  required
                  min="0"
                  value={formData.montant || 0} 
                  onChange={e => setFormData((f: any) => ({ ...f, montant: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.type")} *</label>
                <select 
                  required
                  className="w-full h-10 px-3 py-2 rounded-md border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600]"
                  value={formData.type || "1"}
                  onChange={e => setFormData((f: any) => ({ ...f, type: e.target.value }))}
                >
                  <option value="1">1 - Standard</option>
                  <option value="2">2 - Echange</option>
                  <option value="3">3 - Ramassage</option>
                  <option value="4">4 - Autre</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.products")}</label>
              <Input 
                value={formData.products || ""} 
                onChange={e => setFormData((f: any) => ({ ...f, products: e.target.value }))}
                placeholder="Product 1, Product 2..."
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.remarque")}</label>
                <Input 
                  value={formData.remarque || ""} 
                  onChange={e => setFormData((f: any) => ({ ...f, remarque: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t("admin.ecotrackWorkspace.form.gps_link")}</label>
                <Input 
                  value={formData.gps_link || ""} 
                  onChange={e => setFormData((f: any) => ({ ...f, gps_link: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="flex gap-6 pt-2">
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                <input 
                  type="checkbox" 
                  checked={formData.stop_desk || false}
                  onChange={e => setFormData((f: any) => ({ ...f, stop_desk: e.target.checked }))}
                  className="rounded text-[#1a237e] focus:ring-[#1a237e] border-slate-300 h-4 w-4"
                />
                <span className="text-sm font-semibold text-slate-700">{t("admin.ecotrackWorkspace.form.stopDesk")}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                <input 
                  type="checkbox" 
                  checked={formData.fragile || false}
                  onChange={e => setFormData((f: any) => ({ ...f, fragile: e.target.checked }))}
                  className="rounded text-[#1a237e] focus:ring-[#1a237e] border-slate-300 h-4 w-4"
                />
                <span className="text-sm font-semibold text-slate-700">{t("admin.ecotrackWorkspace.form.fragile")}</span>
              </label>
            </div>
          </form>
        </div>
        
        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3 shrink-0">
          <Button type="button" variant="outline" onClick={onClose} className="border-slate-200">
            {t("admin.ecotrackWorkspace.form.cancel")}
          </Button>
          <Button 
            type="submit" 
            form="parcel-form"
            disabled={createMutation.isPending || updateMutation.isPending}
            className="bg-[#E10600] hover:bg-[#C50500] text-white"
          >
            {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("admin.ecotrackWorkspace.form.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ tracking, onClose }: { tracking: string; onClose: () => void; }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { data, isLoading } = useEcotrackOrderDetail(tracking);
  const addNoteMutation = useAddEcotrackNote();
  const [note, setNote] = useState("");

  const handleAddNote = () => {
    if (!note.trim()) return;
    addNoteMutation.mutate({ tracking, content: note.trim() }, {
      onSuccess: () => {
        setNote("");
        toast({ title: t("admin.ecotrackWorkspace.toasts.success", "Success") });
      },
      onError: (err) => toast({ title: t("admin.ecotrackWorkspace.toasts.error", "Error"), description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">{t("admin.ecotrackWorkspace.detail.title")}</h2>
            <div className="font-mono text-sm px-2 py-1 bg-white border border-slate-200 rounded font-semibold text-slate-700">{tracking}</div>
          </div>
          <button onClick={onClose} className="p-2 -mr-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#E10600]" />
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            <div className="flex-1 border-b md:border-b-0 md:border-r border-slate-100 p-6 overflow-y-auto">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">{t("admin.ecotrackWorkspace.detail.info")}</h3>
              
              {data?.info && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{t("admin.ecotrackWorkspace.form.recipientName")}</p>
                      <p className="font-medium text-slate-900">{data.info.client}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{t("admin.ecotrackWorkspace.form.recipientPhone")}</p>
                      <p className="font-medium text-slate-900">{data.info.phone}</p>
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs text-slate-500 mb-1">{t("admin.ecotrackWorkspace.form.address")}</p>
                    <p className="font-medium text-slate-900">{data.info.adresse}</p>
                    <p className="text-sm text-slate-600 mt-1">{data.info.commune_id} - {data.info.wilaya_id}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{t("admin.ecotrackWorkspace.form.amount")}</p>
                      <p className="font-bold text-[#E10600]">{formatDZD(data.info.montant || 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">{t("admin.ecotrackWorkspace.table.status")}</p>
                      <StatusBadge status={data.info.process_state_id || data.info.status} />
                    </div>
                  </div>

                  {(data.info.driver_name || data.info.driver_phone) && (
                    <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                      <p className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2">{t("admin.ecotrackWorkspace.detail.driver")}</p>
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-slate-900">{data.info.driver_name || '—'}</span>
                        <span className="text-slate-600 font-mono text-sm">{data.info.driver_phone}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 md:max-w-sm flex flex-col bg-slate-50/50">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">{t("admin.ecotrackWorkspace.detail.history")}</h3>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {data?.updates?.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center italic mt-4">{t("admin.ecotrackWorkspace.detail.noHistory")}</p>
                ) : (
                  data?.updates?.map((u: any, i: number) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-[#E10600] mt-1.5" />
                        {i < data.updates.length - 1 && <div className="w-px h-full bg-slate-200 mt-1" />}
                      </div>
                      <div className="pb-4 flex-1">
                        <p className="text-xs text-slate-400 mb-0.5 flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(u.created_at || u.date).toLocaleString()}</p>
                        <p className="text-sm font-medium text-slate-900">{u.status || u.action}</p>
                        {u.note && <p className="text-sm text-slate-600 mt-1 bg-white p-2 rounded border border-slate-100 shadow-sm">{u.note}</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-4 border-t border-slate-100 bg-white">
                <div className="flex gap-2">
                  <Input 
                    placeholder={t("admin.ecotrackWorkspace.detail.notePlaceholder")}
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddNote()}
                    className="flex-1"
                  />
                  <Button onClick={handleAddNote} disabled={addNoteMutation.isPending || !note.trim()} className="bg-[#1a237e] hover:bg-[#11185b] text-white">
                    {addNoteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
