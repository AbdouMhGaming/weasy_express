import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, adminHeaders } from "@/lib/api";

interface OfficeStats {
  totalReports: number;
  totalDelivered: number;
  totalDispatched: number;
  totalReturns: number;
  totalNetDzd: number;
  totalCodDzd: number;
  totalDispatchedDzd: number;
  fraisLivraison: number;
}

interface TopSender {
  sender_name: string;
  report_count: number;
  total_parcels: number;
  net_dzd: number;
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

const TYPE = {
  delivery_receipt: { label: "Décharge paiement", badge: "bg-emerald-100 text-emerald-700", icon: "✅" },
  route_sheet:      { label: "Feuille de route",  badge: "bg-blue-100 text-blue-700",    icon: "🗺️" },
  returns_list:     { label: "Liste des retours",  badge: "bg-orange-100 text-orange-700", icon: "↩️" },
  unknown:          { label: "Inconnu",            badge: "bg-gray-100 text-gray-500",     icon: "📄" },
};

const fmtN  = (n: number) => n.toLocaleString("fr-DZ");
const fmtDZ = (n: number) => `${fmtN(n)} DZD`;
const fmtDate = (s: string) => {
  try { return new Date(s).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};

export default function OfficeDashboardView({ onUnauth, isAdmin }: { onUnauth: () => void; isAdmin: boolean }) {
  const [stats, setStats]         = useState<OfficeStats | null>(null);
  const [senders, setSenders]     = useState<TopSender[]>([]);
  const [reports, setReports]     = useState<OfficeReport[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(`${API_BASE}/api/office/reports/stats`,  { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/office/reports`,        { headers: adminHeaders() }),
      ]);
      if (sRes.status === 401) { onUnauth(); return; }
      const [sd, rd] = await Promise.all([sRes.json(), rRes.json()]);
      if (sd.ok) {
        setStats(sd.stats);
        setSenders(sd.topSenders ?? []);
      }
      if (rd.ok) setReports(rd.reports ?? []);
    } catch { /* ignore */ } finally { setLoading(false); }
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
        const t = TYPE[data.reportType as keyof typeof TYPE] ?? TYPE.unknown;
        const parts = [
          `${t.icon} ${t.label} importé`,
          `${data.totalParcels} colis`,
          data.senderName ? `expéditeur : ${data.senderName}` : "",
          data.netAmount   ? `net : ${fmtDZ(data.netAmount)}`  : "",
          data.totalAmount && !data.netAmount ? `total : ${fmtDZ(data.totalAmount)}` : "",
        ].filter(Boolean);
        setUploadMsg({ ok: true, text: parts.join(" · ") });
        fetchAll();
      } else {
        setUploadMsg({ ok: false, text: `Erreur : ${data.detail ?? data.error ?? "Fichier non reconnu"}` });
      }
    } catch {
      setUploadMsg({ ok: false, text: "Erreur de connexion. Réessayez." });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // Wilaya breakdown from all reports
  const wilayaCount: Record<string, number> = {};
  for (const r of reports) {
    for (const w of (r.wilayas ?? "").split(",").map(s => s.trim()).filter(Boolean)) {
      wilayaCount[w] = (wilayaCount[w] ?? 0) + (r.total_parcels || 1);
    }
  }
  const topWilayas = Object.entries(wilayaCount).sort(([, a], [, b]) => b - a).slice(0, 8);
  const maxW = topWilayas[0]?.[1] ?? 1;

  const deliveries = reports.filter(r => r.report_type === "delivery_receipt");
  const routes     = reports.filter(r => r.report_type === "route_sheet");
  const returns_   = reports.filter(r => r.report_type === "returns_list");

  const Spinner = () => (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  const Skeleton = ({ h = "h-8", w = "w-20" }: { h?: string; w?: string }) => (
    <div className={`${h} ${w} bg-gray-100 rounded animate-pulse`} />
  );

  return (
    <div className="p-6 lg:p-8 space-y-8">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tableau de bord Agence</h1>
          <p className="text-sm text-gray-400 mt-0.5">Statistiques extraites des rapports Ecotrack importés</p>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm transition-colors"
        >
          <svg className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Actualiser
        </button>
      </div>

      {/* ── Upload zone ────────────────────────────────────────────── */}
      <div
        className="relative bg-gradient-to-br from-[#0F172A] to-[#1E293B] rounded-2xl p-6 overflow-hidden"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === "application/pdf") handleUpload(f); }}
      >
        <div className="absolute inset-0 opacity-5 pointer-events-none select-none">
          <span className="absolute top-3 right-4 text-8xl">📄</span>
          <span className="absolute bottom-2 left-6 text-6xl">📋</span>
        </div>
        <div className="relative">
          <h2 className="text-white font-bold text-lg mb-0.5">Importer un rapport Ecotrack</h2>
          <p className="text-white/50 text-sm mb-4">
            Décharge de paiement · Feuille de route · Liste des retours — le type est détecté automatiquement
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef} type="file" accept="application/pdf" className="hidden" id="pdf-upload"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
            />
            <label
              htmlFor="pdf-upload"
              className="flex items-center gap-2 text-sm font-bold bg-[#E10600] hover:bg-[#C50500] text-white px-5 py-2.5 rounded-xl cursor-pointer transition-colors shadow-lg shadow-red-900/30"
            >
              {uploading ? <><Spinner />Analyse…</> : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Choisir un PDF
                </>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {(["delivery_receipt", "route_sheet", "returns_list"] as const).map(k => (
                <span key={k} className="text-xs text-white/60 bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
                  {TYPE[k].icon} {TYPE[k].label}
                </span>
              ))}
            </div>
          </div>
          {uploadMsg && (
            <div className={`mt-4 flex items-start gap-2 text-sm px-4 py-3 rounded-xl border ${uploadMsg.ok ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/25" : "bg-red-500/15 text-red-300 border-red-500/25"}`}>
              <span className="shrink-0">{uploadMsg.ok ? "✅" : "❌"}</span>
              <span className="flex-1">{uploadMsg.text}</span>
              <button onClick={() => setUploadMsg(null)} className="opacity-50 hover:opacity-100 ml-auto">✕</button>
            </div>
          )}
        </div>
      </div>

      {/* ── KPI strip ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
        {[
          { icon: "💰", label: "COD collecté",    value: stats ? fmtDZ(stats.totalCodDzd        ?? 0) : null, color: "from-amber-500 to-amber-600",    sub: "Montant brut livré" },
          { icon: "📊", label: "Net reçu",         value: stats ? fmtDZ(stats.totalNetDzd        ?? 0) : null, color: "from-[#E10600] to-[#B80500]",  sub: "Après déduction frais" },
          { icon: "💸", label: "Frais livraison",  value: stats ? fmtDZ(stats.fraisLivraison      ?? 0) : null, color: "from-slate-500 to-slate-700",  sub: "Tarifs Ecotrack" },
          { icon: "🚚", label: "Valeur dispatché", value: stats ? fmtDZ(stats.totalDispatchedDzd  ?? 0) : null, color: "from-blue-500 to-blue-600",    sub: "Feuilles de route" },
          { icon: "✅", label: "Colis livrés",     value: stats ? fmtN(stats.totalDelivered   ?? 0)    : null, color: "from-emerald-500 to-emerald-600", sub: "Décharges de paiement" },
          { icon: "🗺️", label: "Colis dispatchés", value: stats ? fmtN(stats.totalDispatched  ?? 0)    : null, color: "from-sky-500 to-sky-600",         sub: "Feuilles de route" },
          { icon: "↩️", label: "Retours",          value: stats ? fmtN(stats.totalReturns     ?? 0)    : null, color: "from-orange-500 to-orange-600",   sub: "À dispatcher aux exp." },
          { icon: "📄", label: "PDFs importés",    value: stats ? fmtN(stats.totalReports     ?? 0)    : null, color: "from-gray-500 to-gray-700",        sub: "Total rapports" },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${c.color} text-white text-base flex items-center justify-center shrink-0`}>
              {c.icon}
            </div>
            <div className="min-w-0">
              {loading || !c.value ? <Skeleton h="h-6" w="w-20" /> : (
                <p className="text-lg font-bold text-gray-900 leading-none truncate">{c.value}</p>
              )}
              <p className="text-xs text-gray-400 mt-0.5 font-medium truncate">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Charts row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* Wilaya breakdown */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-1">Wilayas couvertes</h3>
          <p className="text-xs text-gray-400 mb-4">Nombre de colis par wilaya (tous rapports)</p>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-7 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          ) : topWilayas.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucune donnée — importez des PDFs</p>
          ) : (
            <div className="space-y-3">
              {topWilayas.map(([name, count]) => (
                <div key={name} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-32 truncate shrink-0 font-medium">{name}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div
                      className="h-2.5 rounded-full bg-gradient-to-r from-[#E10600] to-[#FF4444] transition-all"
                      style={{ width: `${Math.round((count / maxW) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-8 text-right shrink-0">{fmtN(count)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top senders */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-1">Top expéditeurs</h3>
          <p className="text-xs text-gray-400 mb-4">Par nombre de colis traités</p>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : senders.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucun expéditeur détecté</p>
          ) : (
            <div className="space-y-2">
              {senders.map((s, i) => (
                <div key={s.sender_name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors">
                  <span className="text-xs font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{s.sender_name}</p>
                    <p className="text-xs text-gray-400">{s.report_count} rapport{s.report_count > 1 ? "s" : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gray-900">{fmtN(Number(s.total_parcels))} colis</p>
                    {Number(s.net_dzd) > 0 && (
                      <p className="text-xs text-emerald-600">{fmtDZ(Number(s.net_dzd))}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Per-type tables ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Décharges */}
        <ReportSection
          title="Décharges de paiement"
          icon="✅"
          accent="emerald"
          empty="Aucune décharge importée"
          rows={deliveries.slice(0, 6)}
          isAdmin={isAdmin}
          onDelete={async (id) => {
            await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() });
            fetchAll();
          }}
          renderRow={r => (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                <span className="text-xs font-bold text-gray-900">{r.total_parcels} colis</span>
              </div>
              {r.sender_name && <p className="text-xs text-gray-500 truncate mt-0.5">📦 {r.sender_name}</p>}
              {r.wilayas    && <p className="text-xs text-[#E10600] truncate mt-0.5">📍 {r.wilayas}</p>}
              <div className="flex gap-2 mt-1 flex-wrap">
                {r.total_amount_dzd > 0 && <span className="text-xs text-gray-400">COD: {fmtDZ(r.total_amount_dzd)}</span>}
                {r.net_amount_dzd   > 0 && <span className="text-xs text-emerald-600 font-semibold">Net: {fmtDZ(r.net_amount_dzd)}</span>}
              </div>
            </>
          )}
        />

        {/* Feuilles de route */}
        <ReportSection
          title="Feuilles de route"
          icon="🗺️"
          accent="blue"
          empty="Aucune feuille de route importée"
          rows={routes.slice(0, 6)}
          isAdmin={isAdmin}
          onDelete={async (id) => {
            await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() });
            fetchAll();
          }}
          renderRow={r => (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                <span className="text-xs font-bold text-gray-900">{r.total_parcels} colis</span>
              </div>
              {r.station     && <p className="text-xs text-gray-500 truncate mt-0.5">🏢 {r.station}</p>}
              {r.wilayas     && <p className="text-xs text-blue-600 truncate mt-0.5">📍 {r.wilayas}</p>}
              {r.sender_name && <p className="text-xs text-gray-400 truncate mt-0.5">📦 {r.sender_name}</p>}
              {r.total_amount_dzd > 0 && <p className="text-xs text-gray-500 mt-0.5">Valeur: {fmtDZ(r.total_amount_dzd)}</p>}
            </>
          )}
        />

        {/* Retours */}
        <ReportSection
          title="Listes des retours"
          icon="↩️"
          accent="orange"
          empty="Aucune liste de retours importée"
          rows={returns_.slice(0, 6)}
          isAdmin={isAdmin}
          onDelete={async (id) => {
            await fetch(`${API_BASE}/api/office/reports/${id}`, { method: "DELETE", headers: adminHeaders() });
            fetchAll();
          }}
          renderRow={r => (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-700">{fmtDate(r.report_date)}</span>
                <span className="text-xs font-bold text-gray-900">{r.total_parcels} retours</span>
              </div>
              {r.sender_name && <p className="text-xs text-gray-500 truncate mt-0.5">📦 {r.sender_name}</p>}
              {r.station     && <p className="text-xs text-gray-500 truncate mt-0.5">🏢 {r.station}</p>}
              {r.wilayas     && <p className="text-xs text-orange-600 truncate mt-0.5">📍 {r.wilayas}</p>}
            </>
          )}
        />
      </div>

      {/* ── Full history ────────────────────────────────────────────── */}
      {reports.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Tous les rapports importés</h3>
            <span className="text-xs text-gray-400">{reports.length} fichier{reports.length > 1 ? "s" : ""}</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {reports.map(r => {
              const t = TYPE[r.report_type] ?? TYPE.unknown;
              return (
                <div key={r.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <span className="text-base shrink-0">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${t.badge}`}>{t.label}</span>
                      <span className="text-xs text-gray-400">{fmtDate(r.report_date)}</span>
                      {r.sender_name && <span className="text-xs text-gray-500 truncate max-w-[120px]">{r.sender_name}</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate mt-0.5">{r.file_name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold text-gray-700">{r.total_parcels} colis</p>
                    {r.net_amount_dzd > 0 && <p className="text-xs text-emerald-600">{fmtDZ(r.net_amount_dzd)}</p>}
                    {r.total_amount_dzd > 0 && r.net_amount_dzd === 0 && (
                      <p className="text-xs text-gray-400">{fmtDZ(r.total_amount_dzd)}</p>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={async () => {
                        if (!confirm("Supprimer ce rapport ?")) return;
                        await fetch(`${API_BASE}/api/office/reports/${r.id}`, { method: "DELETE", headers: adminHeaders() });
                        fetchAll();
                      }}
                      className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reusable report section ──────────────────────────────────────────────────

function ReportSection({
  title, icon, accent, empty, rows, isAdmin, onDelete, renderRow,
}: {
  title: string;
  icon: string;
  accent: "emerald" | "blue" | "orange";
  empty: string;
  rows: OfficeReport[];
  isAdmin: boolean;
  onDelete: (id: number) => void;
  renderRow: (r: OfficeReport) => React.ReactNode;
}) {
  const borderColor = { emerald: "border-emerald-200", blue: "border-blue-200", orange: "border-orange-200" }[accent];
  const iconBg      = { emerald: "bg-emerald-50",      blue: "bg-blue-50",      orange: "bg-orange-50"      }[accent];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className={`px-5 py-3 border-b ${borderColor} flex items-center gap-2`}>
        <span className={`w-7 h-7 rounded-lg ${iconBg} flex items-center justify-center text-sm`}>{icon}</span>
        <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
        <span className="ml-auto text-xs text-gray-400">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-gray-400 text-xs text-center py-8">{empty}</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {rows.map(r => (
            <div key={r.id} className="px-4 py-3 hover:bg-gray-50 transition-colors flex gap-2">
              <div className="flex-1 min-w-0">{renderRow(r)}</div>
              {isAdmin && (
                <button
                  onClick={() => { if (confirm("Supprimer ?")) onDelete(r.id); }}
                  className="text-gray-200 hover:text-red-500 hover:bg-red-50 p-1 rounded-lg transition-colors shrink-0 self-start"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
