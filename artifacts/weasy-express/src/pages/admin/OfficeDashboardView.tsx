import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, adminHeaders } from "@/lib/api";

interface OfficeStats {
  totalReports: number;
  totalDelivered: number;
  totalDispatched: number;
  totalReturns: number;
  totalNetDzd: number;
  totalCodDzd: number;
}

interface OfficeReport {
  id: number;
  report_type: "delivery_receipt" | "route_sheet" | "returns_list" | "unknown";
  file_name: string;
  report_date: string;
  total_parcels: number;
  total_amount_dzd: number;
  net_amount_dzd: number;
  station: string | null;
  sender_name: string | null;
  tracking_numbers: string | null;
  wilayas: string | null;
  uploaded_by: string | null;
  created_at: string;
}

const REPORT_TYPE_INFO = {
  delivery_receipt: { label: "Décharge paiement", color: "bg-emerald-100 text-emerald-700", icon: "✅", desc: "Envois livrés & paiements" },
  route_sheet: { label: "Feuille de route", color: "bg-blue-100 text-blue-700", icon: "🗺️", desc: "Tournées et expéditions" },
  returns_list: { label: "Liste des retours", color: "bg-orange-100 text-orange-700", icon: "↩️", desc: "Retours à dispatcher" },
  unknown: { label: "Inconnu", color: "bg-gray-100 text-gray-600", icon: "📄", desc: "Type non reconnu" },
};

const fmtN = (n: number) => n.toLocaleString("fr-DZ");
const fmtD = (s: string) => {
  try { return new Date(s).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};

export default function OfficeDashboardView({
  onUnauth, isAdmin,
}: { onUnauth: () => void; isAdmin: boolean }) {
  const [stats, setStats] = useState<OfficeStats | null>(null);
  const [reports, setReports] = useState<OfficeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/api/office/reports/stats`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/office/reports`, { headers: adminHeaders() }),
      ]);
      if (sRes.status === 401) { onUnauth(); return; }
      const [sd, rd] = await Promise.all([sRes.json(), rRes.json()]);
      if (sd.ok) setStats(sd.stats);
      if (rd.ok) setReports(rd.reports ?? []);
    } catch { } finally { setLoading(false); }
  }, [onUnauth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("pdf", file);
      const res = await fetch(`${API_BASE}/api/office/reports/upload`, {
        method: "POST",
        headers: { Authorization: adminHeaders().Authorization },
        body: fd,
      });
      if (res.status === 401) { onUnauth(); return; }
      const data = await res.json();
      if (data.ok) {
        const typeInfo = REPORT_TYPE_INFO[data.reportType as keyof typeof REPORT_TYPE_INFO] ?? REPORT_TYPE_INFO.unknown;
        setUploadMsg({
          ok: true,
          text: `${typeInfo.icon} ${typeInfo.label} importé — ${data.totalParcels} colis · ${data.reportDate}`,
        });
        fetchAll();
      } else {
        setUploadMsg({ ok: false, text: `Erreur: ${data.error ?? "Fichier non reconnu"}` });
      }
    } catch {
      setUploadMsg({ ok: false, text: "Erreur de connexion. Réessayez." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deleteReport(id: number) {
    if (!confirm("Supprimer ce rapport ?")) return;
    const res = await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchAll();
  }

  const Spinner = () => (
    <svg className="animate-spin w-5 h-5 text-white" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  const SkeletonCard = () => <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-pulse"><div className="h-8 w-24 bg-gray-200 rounded mb-2" /><div className="h-4 w-32 bg-gray-100 rounded" /></div>;

  const kpiCards = stats ? [
    { label: "Colis livrés (PDFs)", value: stats.totalDelivered, icon: "✅", color: "from-emerald-500 to-emerald-600" },
    { label: "Colis dispatché", value: stats.totalDispatched, icon: "🚚", color: "from-blue-500 to-blue-600" },
    { label: "Retours traités", value: stats.totalReturns, icon: "↩️", color: "from-orange-500 to-orange-600" },
    { label: "COD total (DZD)", value: fmtN(stats.totalCodDzd), icon: "💰", color: "from-amber-500 to-amber-600" },
    { label: "Net reçu (DZD)", value: fmtN(stats.totalNetDzd), icon: "📊", color: "from-[#E10600] to-[#B80500]" },
    { label: "PDFs importés", value: stats.totalReports, icon: "📄", color: "from-slate-600 to-slate-700" },
  ] : [];

  const recentDelivery = reports.filter(r => r.report_type === "delivery_receipt").slice(0, 5);
  const recentRoutes = reports.filter(r => r.report_type === "route_sheet").slice(0, 5);
  const recentReturns = reports.filter(r => r.report_type === "returns_list").slice(0, 5);

  const allWilayas = reports
    .flatMap(r => (r.wilayas ?? "").split(",").map(w => w.trim()).filter(Boolean));
  const wilayaCount: Record<string, number> = {};
  for (const w of allWilayas) wilayaCount[w] = (wilayaCount[w] ?? 0) + 1;
  const topWilayas = Object.entries(wilayaCount).sort(([,a],[,b]) => b - a).slice(0, 8);
  const maxWCount = topWilayas[0]?.[1] ?? 1;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord Agence</h1>
          <p className="text-sm text-gray-500 mt-0.5">Statistiques extraites de vos rapports Ecotrack</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors">
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Actualiser
        </button>
      </div>

      {/* PDF Upload Zone */}
      <div
        className="relative bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-6 mb-8 overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file?.type === "application/pdf") handleUpload(file);
        }}
      >
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-4 right-4 text-8xl">📄</div>
          <div className="absolute bottom-2 left-8 text-6xl">📋</div>
        </div>
        <div className="relative">
          <h2 className="text-white font-bold text-lg mb-1">Importer un rapport Ecotrack</h2>
          <p className="text-white/50 text-sm mb-5">
            Déposez ou sélectionnez un PDF — le système détecte automatiquement le type (Décharge · Feuille de route · Liste des retours)
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" id="pdf-upload"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
            <label htmlFor="pdf-upload"
              className="flex items-center gap-2 text-sm font-bold bg-[#E10600] hover:bg-[#C50500] text-white px-5 py-2.5 rounded-xl cursor-pointer transition-colors shadow-lg shadow-red-900/30">
              {uploading ? <><Spinner />Analyse en cours…</> : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>Choisir un PDF</>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(REPORT_TYPE_INFO).filter(([k]) => k !== "unknown").map(([, info]) => (
                <span key={info.label} className="text-xs text-white/60 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                  {info.icon} {info.label}
                </span>
              ))}
            </div>
          </div>
          {uploadMsg && (
            <div className={`mt-4 flex items-start gap-2 text-sm px-4 py-3 rounded-xl ${uploadMsg.ok ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"}`}>
              <span className="shrink-0">{uploadMsg.ok ? "✅" : "❌"}</span>
              <span>{uploadMsg.text}</span>
              <button onClick={() => setUploadMsg(null)} className="ml-auto opacity-60 hover:opacity-100">×</button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-8">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          kpiCards.map((c) => (
            <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${c.color} text-white text-xl flex items-center justify-center shrink-0 shadow-sm`}>
                {c.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 leading-none">{c.value}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">{c.label}</p>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {/* Wilaya Breakdown */}
        {topWilayas.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h3 className="font-bold text-gray-900 mb-4">Wilayas fréquentes (tous rapports)</h3>
            <div className="space-y-3">
              {topWilayas.map(([name, count]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-28 truncate shrink-0">{name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-[#E10600] transition-all" style={{ width: `${Math.round((count / maxWCount) * 100)}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-6 text-right shrink-0">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-4">Derniers rapports importés</h3>
          {loading ? (
            <div className="space-y-3">{Array.from({length:4}).map((_,i)=><div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : reports.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucun rapport importé. Commencez par uploader un PDF.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {reports.slice(0, 8).map((r) => {
                const info = REPORT_TYPE_INFO[r.report_type] ?? REPORT_TYPE_INFO.unknown;
                return (
                  <div key={r.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                    <span className="text-lg shrink-0">{info.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${info.color}`}>{info.label}</span>
                        <span className="text-xs text-gray-400">{r.report_date}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{r.file_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-gray-700">{r.total_parcels} colis</p>
                      {r.total_amount_dzd > 0 && <p className="text-xs text-gray-400">{fmtN(r.total_amount_dzd)} DZD</p>}
                    </div>
                    {isAdmin && (
                      <button onClick={() => deleteReport(r.id)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Type breakdown tables */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {[
          { title: "Livraisons récentes", data: recentDelivery, key: "delivery" },
          { title: "Tournées récentes", data: recentRoutes, key: "routes" },
          { title: "Retours récents", data: recentReturns, key: "returns" },
        ].map((section) => (
          <div key={section.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 text-sm">{section.title}</h3>
            </div>
            {section.data.length === 0 ? (
              <p className="text-gray-400 text-xs text-center py-8">Aucun rapport</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {section.data.map((r) => (
                  <div key={r.id} className="px-5 py-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-700">{r.report_date}</p>
                      <p className="text-xs font-bold text-gray-900">{r.total_parcels} colis</p>
                    </div>
                    {r.station && <p className="text-xs text-gray-400 truncate mt-0.5">{r.station}</p>}
                    {r.wilayas && <p className="text-xs text-[#E10600] truncate mt-0.5">{r.wilayas}</p>}
                    {r.total_amount_dzd > 0 && (
                      <p className="text-xs text-gray-500 mt-0.5">{fmtN(r.total_amount_dzd)} DZD{r.net_amount_dzd > 0 ? ` · Net: ${fmtN(r.net_amount_dzd)}` : ""}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
