import { useState, useEffect, useCallback } from "react";
import { API_BASE, adminHeaders } from "@/lib/api";

type PerfTab = "revenue" | "expenses" | "customers" | "delivery";

interface PerfData {
  total: number; delivered: number; returned: number; in_transit: number;
  pending: number; failed: number; cancelled: number; successRate: number;
  byWilaya: Array<{ code: string; name: string; total: number; delivered: number }>;
}

interface ChargesSummary {
  byCategory: Record<string, number>;
  totalCharges: number;
  totalPaid: number;
}

interface TopStats {
  topSenders: Array<{ name: string; count: string | number; delivered: string | number }>;
  topWilayas: Array<{ name: string; count: string | number }>;
  officeAgents: Array<{ name: string; created_at: string }>;
  marketers: Array<{ name: string; created_at: string }>;
}

const TAB_LABELS: { key: PerfTab; label: string; icon: string }[] = [
  { key: "revenue", label: "Revenus & Profits", icon: "📈" },
  { key: "expenses", label: "Dépenses & Charges", icon: "💸" },
  { key: "customers", label: "Métriques Clients", icon: "👥" },
  { key: "delivery", label: "Impact Livraison", icon: "🚚" },
];

const fmtN = (n: number) => Math.round(n).toLocaleString("fr-DZ");

function MiniBar({ value, max, color = "bg-[#E10600]" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2">
      <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function PerformanceView({ onUnauth }: { onUnauth: () => void }) {
  const [tab, setTab] = useState<PerfTab>("revenue");
  const [stats, setStats] = useState<PerfData | null>(null);
  const [charges, setCharges] = useState<ChargesSummary | null>(null);
  const [topStats, setTopStats] = useState<TopStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes, tRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/charges-summary`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/top-stats`, { headers: adminHeaders() }),
      ]);
      if (sRes.status === 401) { onUnauth(); return; }
      const [sd, cd, td] = await Promise.all([sRes.json(), cRes.json(), tRes.json()]);
      if (sd.ok) setStats(sd.stats);
      if (cd.ok) setCharges(cd);
      if (td.ok) setTopStats(td);
    } catch { } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const Skeleton = ({ className = "" }: { className?: string }) => (
    <div className={`bg-gray-200 rounded animate-pulse ${className}`} />
  );

  const KpiCard = ({ label, value, sub, color = "text-gray-900", badge }: {
    label: string; value: string | number; sub?: string; color?: string; badge?: string;
  }) => (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      {loading ? <Skeleton className="h-8 w-24 mb-2" /> : (
        <div className="flex items-start justify-between">
          <p className={`text-2xl font-bold leading-none ${color}`}>{value}</p>
          {badge && <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{badge}</span>}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-1.5 font-medium">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );

  const estRevPerDelivery = 800;
  const estTotalRev = (stats?.delivered ?? 0) * estRevPerDelivery;
  const estProfit = estTotalRev - (charges?.totalCharges ?? 0);
  const margin = estTotalRev > 0 ? Math.round((estProfit / estTotalRev) * 100) : 0;

  const catLabels: Record<string, string> = {
    marketing: "Marketing", hr: "RH", it: "IT", packaging: "Emballage",
    cod: "COD", warehouse: "Entrepôt", various: "Divers",
  };
  const maxCatVal = Math.max(...Object.values(charges?.byCategory ?? {}), 1);
  const topWilayasData = stats?.byWilaya.slice(0, 6) ?? [];
  const maxWilaya = Math.max(...topWilayasData.map(w => w.delivered), 1);

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Performance</h1>
          <p className="text-sm text-gray-500 mt-0.5">Tableau de bord analytique</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors">
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Actualiser
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-2xl w-fit flex-wrap">
        {TAB_LABELS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl transition-all ${
              tab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            <span>{t.icon}</span>
            <span className="hidden md:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Revenue & Profits */}
      {tab === "revenue" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard label="Revenu estimé (livraisons)" value={`${fmtN(estTotalRev)} DZD`} sub={`${stats?.delivered ?? 0} livraisons × 800 DZD`} color="text-emerald-600" />
            <KpiCard label="Charges totales" value={`${fmtN(charges?.totalCharges ?? 0)} DZD`} color="text-[#E10600]" />
            <KpiCard label="Profit estimé" value={`${fmtN(estProfit)} DZD`} color={estProfit >= 0 ? "text-emerald-600" : "text-red-600"} badge={`${margin}%`} />
            <KpiCard label="Virements effectués" value={`${fmtN(charges?.totalPaid ?? 0)} DZD`} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">Répartition des revenus par statut</h3>
            {loading ? <Skeleton className="h-32 w-full" /> : (
              <div className="space-y-3">
                {[
                  { label: "Livré", value: stats?.delivered ?? 0, total: stats?.total ?? 1, color: "bg-emerald-500" },
                  { label: "En transit", value: stats?.in_transit ?? 0, total: stats?.total ?? 1, color: "bg-blue-500" },
                  { label: "En attente", value: stats?.pending ?? 0, total: stats?.total ?? 1, color: "bg-amber-500" },
                  { label: "Retourné", value: stats?.returned ?? 0, total: stats?.total ?? 1, color: "bg-orange-500" },
                  { label: "Échoué", value: stats?.failed ?? 0, total: stats?.total ?? 1, color: "bg-red-500" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-sm text-gray-600 w-24 shrink-0">{row.label}</span>
                    <MiniBar value={row.value} max={row.total} color={row.color} />
                    <span className="text-sm font-semibold text-gray-800 w-10 text-right shrink-0">{row.value}</span>
                    <span className="text-xs text-gray-400 w-8 text-right shrink-0">{row.total > 0 ? Math.round((row.value / row.total) * 100) : 0}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Expenses & Charges */}
      {tab === "expenses" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <KpiCard label="Total Charges" value={`${fmtN(charges?.totalCharges ?? 0)} DZD`} color="text-[#E10600]" />
            <KpiCard label="Virements effectués" value={`${fmtN(charges?.totalPaid ?? 0)} DZD`} color="text-emerald-600" />
            <KpiCard label="Solde restant à payer" value={`${fmtN((charges?.totalCharges ?? 0) - (charges?.totalPaid ?? 0))} DZD`}
              color={(charges?.totalCharges ?? 0) > (charges?.totalPaid ?? 0) ? "text-amber-600" : "text-emerald-600"} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">Charges par catégorie</h3>
            {loading ? <Skeleton className="h-48 w-full" /> : (
              <div className="space-y-3">
                {Object.entries(charges?.byCategory ?? {}).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">Aucune charge enregistrée</p>
                ) : (
                  Object.entries(charges?.byCategory ?? {}).sort(([,a],[,b]) => b - a).map(([cat, val]) => (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-sm text-gray-600 w-24 shrink-0">{catLabels[cat] ?? cat}</span>
                      <MiniBar value={val} max={maxCatVal} color="bg-[#E10600]" />
                      <span className="text-sm font-semibold text-gray-800 shrink-0">{fmtN(val)} DZD</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Customer Metrics */}
      {tab === "customers" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <KpiCard label="Total commandes" value={stats?.total ?? 0} />
            <KpiCard label="Taux de succès" value={`${stats?.successRate ?? 0}%`}
              color={(stats?.successRate ?? 0) >= 80 ? "text-emerald-600" : (stats?.successRate ?? 0) >= 60 ? "text-amber-600" : "text-red-600"} />
            <KpiCard label="Expéditeurs actifs" value={topStats?.topSenders.length ?? 0} />
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">Top expéditeurs (clients)</h3>
            {loading ? <Skeleton className="h-40 w-full" /> : (
              topStats?.topSenders.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">Aucune donnée disponible</p>
              ) : (
                <div className="space-y-3">
                  {topStats?.topSenders.map((s, i) => {
                    const cnt = Number(s.count); const del = Number(s.delivered);
                    const rate = cnt > 0 ? Math.round((del / cnt) * 100) : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-gray-100 text-xs font-bold text-gray-500 flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-sm text-gray-700 flex-1 truncate font-medium">{s.name}</span>
                        <MiniBar value={cnt} max={Number(topStats.topSenders[0]?.count ?? 1)} color="bg-blue-500" />
                        <span className="text-xs text-gray-500 shrink-0">{cnt} colis</span>
                        <span className={`text-xs font-bold shrink-0 ${rate >= 80 ? "text-emerald-600" : "text-amber-600"}`}>{rate}%</span>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* Delivery Impact */}
      {tab === "delivery" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <KpiCard label="Livraisons réussies" value={stats?.delivered ?? 0} color="text-emerald-600" badge={`${stats?.successRate ?? 0}%`} />
            <KpiCard label="En cours de livraison" value={stats?.in_transit ?? 0} color="text-blue-600" />
            <KpiCard label="Retours à traiter" value={stats?.returned ?? 0} color="text-orange-600" />
            <KpiCard label="Wilayas desservies" value={topWilayasData.filter(w => w.delivered > 0).length} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4">Livraisons par wilaya</h3>
              {loading ? <Skeleton className="h-48 w-full" /> : (
                topWilayasData.filter(w => w.delivered > 0).length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-8">Aucune donnée disponible</p>
                ) : (
                  <div className="space-y-3">
                    {topWilayasData.filter(w => w.delivered > 0).map((w) => (
                      <div key={w.code} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-28 truncate shrink-0">{w.name || w.code}</span>
                        <MiniBar value={w.delivered} max={maxWilaya} color="bg-[#E10600]" />
                        <span className="text-sm font-semibold text-gray-800 shrink-0">{w.delivered}</span>
                        <span className="text-xs text-gray-400 shrink-0">/{w.total}</span>
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4">Indicateurs de performance</h3>
              {loading ? <Skeleton className="h-48 w-full" /> : (
                <div className="space-y-4">
                  {[
                    { label: "Taux de livraison", value: stats?.successRate ?? 0, target: 85, unit: "%" },
                    { label: "Taux de retour", value: stats && stats.total > 0 ? Math.round((stats.returned / stats.total) * 100) : 0, target: 10, unit: "%", invert: true },
                    { label: "Taux d'échec", value: stats && stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0, target: 5, unit: "%", invert: true },
                  ].map((kpi) => {
                    const good = kpi.invert ? kpi.value <= kpi.target : kpi.value >= kpi.target;
                    return (
                      <div key={kpi.label} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-36 shrink-0">{kpi.label}</span>
                        <MiniBar value={kpi.value} max={100} color={good ? "bg-emerald-500" : "bg-amber-500"} />
                        <span className={`text-sm font-bold shrink-0 ${good ? "text-emerald-600" : "text-amber-600"}`}>{kpi.value}{kpi.unit}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
