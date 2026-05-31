import { useState, useEffect, useCallback } from "react";
import { API_BASE, adminHeaders } from "@/lib/api";

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

const fmtN = (n: number) => Math.round(n).toLocaleString("fr-DZ");
const fmtDZ = (n: number) => `${fmtN(n)} DZD`;

const catLabels: Record<string, string> = {
  marketing: "Marketing", hr: "RH", it: "IT", packaging: "Emballage",
  cod: "COD", warehouse: "Entrepôt", various: "Divers",
};

function MiniBar({ value, max, color = "bg-[#E10600]" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-1.5">
      <div className={`h-1.5 rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function MetricRow({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: "green" | "red" | "amber" }) {
  const valColor = highlight === "green" ? "text-emerald-600" : highlight === "red" ? "text-[#E10600]" : highlight === "amber" ? "text-amber-600" : "text-gray-900";
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
      <div>
        <p className="text-xs font-medium text-gray-600">{label}</p>
        {sub && <p className="text-xs text-gray-400">{sub}</p>}
      </div>
      <p className={`text-sm font-bold shrink-0 ml-2 ${valColor}`}>{value}</p>
    </div>
  );
}

export default function PerformanceView({ onUnauth }: { onUnauth: () => void }) {
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
    <div className={`bg-gray-100 rounded animate-pulse ${className}`} />
  );

  const estRevPerDelivery = 800;
  const delivered = stats?.delivered ?? 0;
  const total = stats?.total ?? 0;
  const inTransit = stats?.in_transit ?? 0;
  const returned = stats?.returned ?? 0;
  const failed = stats?.failed ?? 0;
  const estTotalRev = delivered * estRevPerDelivery;
  const totalCharges = charges?.totalCharges ?? 0;
  const totalPaid = charges?.totalPaid ?? 0;
  const estProfit = estTotalRev - totalCharges;
  const margin = estTotalRev > 0 ? Math.round((estProfit / estTotalRev) * 100) : 0;
  const solde = totalCharges - totalPaid;
  const aov = total > 0 ? Math.round(estTotalRev / total) : 0;
  const returnRate = total > 0 ? Math.round((returned / total) * 100) : 0;
  const failRate = total > 0 ? Math.round((failed / total) * 100) : 0;
  const successRate = stats?.successRate ?? 0;
  const uniqueSenders = topStats?.topSenders.length ?? 0;
  const topWilayas = (stats?.byWilaya ?? []).filter(w => w.delivered > 0).slice(0, 5);
  const maxWilaya = topWilayas[0]?.delivered ?? 1;
  const catEntries = Object.entries(charges?.byCategory ?? {}).sort(([, a], [, b]) => b - a);
  const maxCat = catEntries[0]?.[1] ?? 1;

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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ── Panel 1: Revenus & Profits ────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 flex items-center gap-2">
            <span className="text-lg">📈</span>
            <h2 className="font-bold text-white text-sm">Revenus & Profits</h2>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
              <>
                <MetricRow label="Ventes (total commandes)" value={fmtN(total)} />
                <MetricRow label="Revenus estimés" value={fmtDZ(estTotalRev)} sub={`${delivered} liv. × 800 DZD`} highlight="green" />
                <MetricRow label="Charges totales" value={fmtDZ(totalCharges)} highlight="red" />
                <MetricRow label="Bénéfice estimé" value={fmtDZ(estProfit)} highlight={estProfit >= 0 ? "green" : "red"} />
                <MetricRow label="Marge / ROI" value={`${margin}%`} highlight={margin >= 30 ? "green" : margin >= 10 ? "amber" : "red"} />
                <MetricRow label="Virements effectués" value={fmtDZ(totalPaid)} />
              </>
            )}
            {!loading && total > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Répartition par statut</p>
                <div className="space-y-2">
                  {[
                    { label: "Livré", value: delivered, color: "bg-emerald-500" },
                    { label: "En transit", value: inTransit, color: "bg-blue-500" },
                    { label: "Retourné", value: returned, color: "bg-orange-500" },
                    { label: "Échoué", value: failed, color: "bg-red-500" },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{row.label}</span>
                      <MiniBar value={row.value} max={total} color={row.color} />
                      <span className="text-xs font-semibold text-gray-700 w-6 text-right shrink-0">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Panel 2: Dépenses & Frais ─────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-[#E10600] to-[#C50500] flex items-center gap-2">
            <span className="text-lg">💸</span>
            <h2 className="font-bold text-white text-sm">Dépenses & Frais</h2>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
              <>
                <MetricRow label="Total charges" value={fmtDZ(totalCharges)} highlight="red" />
                <MetricRow label="Virements effectués" value={fmtDZ(totalPaid)} highlight="green" />
                <MetricRow label="Solde restant à payer" value={fmtDZ(solde)} highlight={solde > 0 ? "amber" : "green"} />
              </>
            )}
            {!loading && catEntries.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Par catégorie</p>
                <div className="space-y-2">
                  {catEntries.map(([cat, val]) => (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 shrink-0">{catLabels[cat] ?? cat}</span>
                      <MiniBar value={val} max={maxCat} color="bg-[#E10600]" />
                      <span className="text-xs font-semibold text-gray-700 shrink-0">{fmtDZ(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!loading && catEntries.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 mt-2">Aucune charge enregistrée</p>
            )}
          </div>
        </div>

        {/* ── Panel 3: Métriques Clients ────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-blue-500 to-blue-600 flex items-center gap-2">
            <span className="text-lg">👥</span>
            <h2 className="font-bold text-white text-sm">Métriques Clients</h2>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
              <>
                <MetricRow label="Total commandes" value={fmtN(total)} />
                <MetricRow label="Expéditeurs actifs" value={fmtN(uniqueSenders)} sub="Clients uniques détectés" />
                <MetricRow label="Taux de succès" value={`${successRate}%`} highlight={successRate >= 80 ? "green" : successRate >= 60 ? "amber" : "red"} />
                <MetricRow label="Taux de retour" value={`${returnRate}%`} highlight={returnRate <= 10 ? "green" : returnRate <= 20 ? "amber" : "red"} />
                <MetricRow label="AOV (valeur moy. commande)" value={aov > 0 ? fmtDZ(aov) : "—"} sub="Revenu estimé ÷ total" />
              </>
            )}
            {!loading && (topStats?.topSenders ?? []).length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Top expéditeurs</p>
                <div className="space-y-2">
                  {(topStats?.topSenders ?? []).slice(0, 5).map((s, i) => {
                    const cnt = Number(s.count); const del = Number(s.delivered);
                    const rate = cnt > 0 ? Math.round((del / cnt) * 100) : 0;
                    const maxCnt = Number(topStats?.topSenders[0]?.count ?? 1);
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-4 shrink-0">{i + 1}</span>
                        <span className="text-xs text-gray-600 flex-1 truncate">{s.name}</span>
                        <MiniBar value={cnt} max={maxCnt} color="bg-blue-500" />
                        <span className="text-xs font-semibold text-gray-700 w-8 text-right shrink-0">{cnt}</span>
                        <span className={`text-xs font-bold w-8 text-right shrink-0 ${rate >= 80 ? "text-emerald-600" : "text-amber-600"}`}>{rate}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Panel 4: Impact de Livraison ──────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3 bg-gradient-to-r from-slate-600 to-slate-700 flex items-center gap-2">
            <span className="text-lg">🚚</span>
            <h2 className="font-bold text-white text-sm">Impact de Livraison</h2>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
              <>
                <MetricRow label="Livraisons réussies" value={fmtN(delivered)} highlight="green" />
                <MetricRow label="En cours de livraison" value={fmtN(inTransit)} />
                <MetricRow label="Retours à traiter" value={fmtN(returned)} highlight={returned > 0 ? "amber" : "green"} />
                <MetricRow label="Taux de livraison" value={`${successRate}%`} highlight={successRate >= 80 ? "green" : "amber"} />
                <MetricRow label="Taux d'échec" value={`${failRate}%`} highlight={failRate <= 5 ? "green" : failRate <= 15 ? "amber" : "red"} />
              </>
            )}
            {!loading && topWilayas.length > 0 && (
              <div className="mt-4 pt-3 border-t border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">Top wilayas livrées</p>
                <div className="space-y-2">
                  {topWilayas.map((w) => (
                    <div key={w.code} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-28 truncate shrink-0">{w.name || w.code}</span>
                      <MiniBar value={w.delivered} max={maxWilaya} color="bg-slate-500" />
                      <span className="text-xs font-semibold text-gray-700 w-6 text-right shrink-0">{w.delivered}</span>
                      <span className="text-xs text-gray-400 shrink-0">/{w.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!loading && topWilayas.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6 mt-2">Aucune livraison enregistrée</p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
