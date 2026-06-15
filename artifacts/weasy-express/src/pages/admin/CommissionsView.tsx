import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

interface CommissionRate { id: number; wilaya_name: string; wilaya_number: string | null; rate_dzd: number; }
interface CommissionResult { office: string; wilaya: string; delivered: number; commission: number; }

const fmtN = (n: number) => n.toLocaleString("fr-DZ");
const fmtDZ = (n: number) => `${fmtN(Math.round(n))} DZD`;

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

type Tab = "rates" | "calculate";

export default function CommissionsView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("rates");

  // ── Commission Rates ──
  const [rates, setRates] = useState<CommissionRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [newWilayaName, setNewWilayaName] = useState("");
  const [newWilayaNum, setNewWilayaNum] = useState("");
  const [newRate, setNewRate] = useState("");
  const [rateSaving, setRateSaving] = useState(false);
  const [rateError, setRateError] = useState("");

  // ── Xlsx Upload & Calculation ──
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [xlsxHeaders, setXlsxHeaders] = useState<string[]>([]);
  const [xlsxRows, setXlsxRows] = useState<Array<Record<string, unknown>>>([]);
  const [xlsxPreview, setXlsxPreview] = useState<Array<Record<string, unknown>>>([]);
  const [officeCol, setOfficeCol] = useState("");
  const [deliveredCol, setDeliveredCol] = useState("");
  const [wilayaCol, setWilayaCol] = useState("");
  const [periodLabel, setPeriodLabel] = useState("");
  const [computing, setComputing] = useState(false);
  const [results, setResults] = useState<CommissionResult[]>([]);
  const [totalCommissions, setTotalCommissions] = useState(0);
  const [uploadError, setUploadError] = useState("");

  const fetchRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/commission-rates`, { headers: adminHeaders() });
      const d = await res.json();
      if (d.ok) setRates(d.rates ?? []);
    } catch { } finally { setRatesLoading(false); }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  async function saveRate() {
    if (!newWilayaName.trim() || !newRate) { setRateError(t("admin.commissions.rates.fillRequired")); return; }
    setRateSaving(true); setRateError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/commission-rates`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ wilaya_name: newWilayaName.trim(), wilaya_number: newWilayaNum.trim() || null, rate_dzd: parseFloat(newRate) }),
      });
      const d = await res.json();
      if (d.ok) { setNewWilayaName(""); setNewWilayaNum(""); setNewRate(""); fetchRates(); }
      else setRateError(d.error ?? "error");
    } catch { setRateError("connection error"); } finally { setRateSaving(false); }
  }

  async function deleteRate(id: number) {
    if (!confirm(t("admin.commissions.rates.deleteConfirm"))) return;
    await fetch(`${API_BASE}/api/admin/commission-rates/${id}`, { method: "DELETE", headers: adminHeaders() });
    fetchRates();
  }

  async function handleXlsxUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setUploadError(""); setXlsxHeaders([]); setXlsxRows([]); setResults([]);
    try {
      const fd = new FormData();
      fd.append("xlsx", file);
      const res = await fetch(`${API_BASE}/api/admin/commissions/calculate`, {
        method: "POST",
        headers: { Authorization: adminHeaders().Authorization },
        body: fd,
      });
      const d = await res.json();
      if (d.ok) {
        setXlsxHeaders(d.headers ?? []);
        setXlsxRows(d.rows ?? []);
        setXlsxPreview(d.preview ?? []);
        // Auto-detect columns
        const h = (d.headers ?? []) as string[];
        const findCol = (...keywords: string[]) => h.find(c => keywords.some(k => c.toLowerCase().includes(k.toLowerCase()))) ?? "";
        setOfficeCol(findCol("station", "agence", "office", "bureau"));
        setDeliveredCol(findCol("livré", "livre", "delivered", "success", "total livré"));
        setWilayaCol(findCol("wilaya", "wilaya dest", "destination"));
      } else {
        setUploadError(d.detail ?? d.error ?? t("admin.commissions.calc.parseError"));
      }
    } catch { setUploadError(t("admin.commissions.calc.parseError")); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function computeCommissions() {
    if (!officeCol || !deliveredCol || !xlsxRows.length) return;
    setComputing(true); setUploadError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/commissions/compute`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ rows: xlsxRows, officeCol, deliveredCol, wilayaCol: wilayaCol || null, periodLabel }),
      });
      const d = await res.json();
      if (d.ok) { setResults(d.results ?? []); setTotalCommissions(d.totalCommissions ?? 0); }
      else setUploadError(d.detail ?? d.error ?? "error");
    } catch { setUploadError("connection error"); } finally { setComputing(false); }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("admin.commissions.title")}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{t("admin.commissions.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {([["rates", t("admin.commissions.tabs.rates")], ["calculate", t("admin.commissions.tabs.calculate")]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${tab === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab: Commission Rates ── */}
      {tab === "rates" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{t("admin.commissions.rates.title")}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{t("admin.commissions.rates.subtitle")}</p>
            </div>

            {/* Add rate form */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-36">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.rates.wilayaName")}</label>
                  <input type="text" value={newWilayaName} onChange={e => setNewWilayaName(e.target.value)}
                    placeholder={t("admin.commissions.rates.wilayaNamePh")}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.rates.wilayaNum")}</label>
                  <input type="text" value={newWilayaNum} onChange={e => setNewWilayaNum(e.target.value)}
                    placeholder="16"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.rates.rateDzd")}</label>
                  <input type="number" min="0" step="0.5" value={newRate} onChange={e => setNewRate(e.target.value)}
                    placeholder="50"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
                </div>
                <button onClick={saveRate} disabled={rateSaving || !newWilayaName || !newRate}
                  className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors shrink-0">
                  {rateSaving ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>}
                  {t("admin.commissions.rates.add")}
                </button>
              </div>
              {rateError && <p className="text-xs text-red-500 mt-2">{rateError}</p>}
            </div>

            {/* Rates list */}
            {ratesLoading ? (
              <div className="py-12 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />{t("admin.commissions.rates.loading")}</div>
            ) : rates.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">{t("admin.commissions.rates.empty")}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3">{t("admin.commissions.rates.wilayaName")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{t("admin.commissions.rates.wilayaNum")}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{t("admin.commissions.rates.rateDzd")}</th>
                      <th className="w-10 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rates.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-3 font-semibold text-gray-800">{r.wilaya_name}</td>
                        <td className="px-4 py-3 text-gray-500">{r.wilaya_number ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-600">{fmtN(r.rate_dzd)} DZD</td>
                        <td className="px-3 py-3">
                          <button onClick={() => deleteRate(r.id)} className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Calculate ── */}
      {tab === "calculate" && (
        <div className="space-y-6">
          {/* Upload xlsx */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-gray-900 mb-1">{t("admin.commissions.calc.uploadTitle")}</h2>
            <p className="text-xs text-gray-400 mb-4">{t("admin.commissions.calc.uploadSubtitle")}</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white rounded-xl cursor-pointer transition-colors">
                {uploading ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>}
                {t("admin.commissions.calc.chooseFile")}
                <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleXlsxUpload} className="sr-only" />
              </label>
              {xlsxHeaders.length > 0 && (
                <span className="text-sm text-gray-500">{xlsxRows.length} {t("admin.commissions.calc.rows")}</span>
              )}
            </div>
            {uploadError && <p className="text-xs text-red-500 mt-3">{uploadError}</p>}
          </div>

          {/* Column mapping */}
          {xlsxHeaders.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="font-bold text-gray-900 mb-4">{t("admin.commissions.calc.mapColumns")}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.calc.officeCol")} *</label>
                  <select value={officeCol} onChange={e => setOfficeCol(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 bg-white">
                    <option value="">{t("admin.commissions.calc.selectCol")}</option>
                    {xlsxHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.calc.deliveredCol")} *</label>
                  <select value={deliveredCol} onChange={e => setDeliveredCol(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 bg-white">
                    <option value="">{t("admin.commissions.calc.selectCol")}</option>
                    {xlsxHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.calc.wilayaCol")}</label>
                  <select value={wilayaCol} onChange={e => setWilayaCol(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 bg-white">
                    <option value="">{t("admin.commissions.calc.none")}</option>
                    {xlsxHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.commissions.calc.periodLabel")}</label>
                <input type="text" value={periodLabel} onChange={e => setPeriodLabel(e.target.value)}
                  placeholder={t("admin.commissions.calc.periodPh")}
                  className="w-full max-w-xs border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400" />
              </div>

              {/* Preview table */}
              {xlsxPreview.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-gray-100 mb-4">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {xlsxHeaders.map(h => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 whitespace-nowrap">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {xlsxPreview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50/60">
                          {xlsxHeaders.map(h => <td key={h} className="px-3 py-2 text-gray-700 whitespace-nowrap max-w-32 truncate">{String(row[h] ?? "")}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button onClick={computeCommissions} disabled={computing || !officeCol || !deliveredCol}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors">
                {computing ? <Spinner /> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v9a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2" /></svg>}
                {t("admin.commissions.calc.compute")}
              </button>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="font-bold text-gray-900">{t("admin.commissions.calc.results")}</h2>
                  {periodLabel && <p className="text-xs text-gray-400 mt-0.5">{periodLabel}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-amber-600">{fmtDZ(totalCommissions)}</p>
                  <p className="text-xs text-gray-400">{t("admin.commissions.calc.total")}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3">{t("admin.commissions.calc.officeCol")}</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">{t("admin.commissions.rates.wilayaName")}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{t("admin.commissions.calc.delivered")}</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">{t("admin.commissions.calc.commission")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {results.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-3 font-semibold text-gray-800">{r.office}</td>
                        <td className="px-4 py-3 text-gray-500">{r.wilaya || <span className="text-gray-300 italic text-xs">{t("admin.commissions.calc.noWilaya")}</span>}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmtN(r.delivered)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${r.commission > 0 ? "text-amber-600" : "text-gray-400"}`}>{fmtDZ(r.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-amber-50 border-t-2 border-amber-200">
                      <td colSpan={3} className="px-6 py-3 font-bold text-gray-900">{t("admin.commissions.calc.total")}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700 text-base">{fmtDZ(totalCommissions)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
