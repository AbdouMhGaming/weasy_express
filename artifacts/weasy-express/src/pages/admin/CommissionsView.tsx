import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

interface CommissionRate { id: number; wilaya_name: string; wilaya_number: string | null; rate_dzd: number; }
interface CommissionResult { office: string; wilaya: string; delivered: number; rate?: number; commission: number; }
interface Office { id: number; wilaya: string; wilaya_number: string; commune: string; }

const fmtN = (n: number) => n.toLocaleString("fr-DZ");
const fmtDZ = (n: number) => `${fmtN(Math.round(n))} DZD`;

const ALL_WILAYAS: { num: string; name: string }[] = [
  { num: "01", name: "Adrar" }, { num: "02", name: "Chlef" }, { num: "03", name: "Laghouat" },
  { num: "04", name: "Oum El Bouaghi" }, { num: "05", name: "Batna" }, { num: "06", name: "Béjaïa" },
  { num: "07", name: "Biskra" }, { num: "08", name: "Béchar" }, { num: "09", name: "Blida" },
  { num: "10", name: "Bouira" }, { num: "11", name: "Tamanrasset" }, { num: "12", name: "Tébessa" },
  { num: "13", name: "Tlemcen" }, { num: "14", name: "Tiaret" }, { num: "15", name: "Tizi Ouzou" },
  { num: "16", name: "Alger" }, { num: "17", name: "Djelfa" }, { num: "18", name: "Jijel" },
  { num: "19", name: "Sétif" }, { num: "20", name: "Saïda" }, { num: "21", name: "Skikda" },
  { num: "22", name: "Sidi Bel Abbès" }, { num: "23", name: "Annaba" }, { num: "24", name: "Guelma" },
  { num: "25", name: "Constantine" }, { num: "26", name: "Médéa" }, { num: "27", name: "Mostaganem" },
  { num: "28", name: "M'Sila" }, { num: "29", name: "Mascara" }, { num: "30", name: "Ouargla" },
  { num: "31", name: "Oran" }, { num: "32", name: "El Bayadh" }, { num: "33", name: "Illizi" },
  { num: "34", name: "Bordj Bou Arréridj" }, { num: "35", name: "Boumerdès" }, { num: "36", name: "El Tarf" },
  { num: "37", name: "Tindouf" }, { num: "38", name: "Tissemsilt" }, { num: "39", name: "El Oued" },
  { num: "40", name: "Khenchela" }, { num: "41", name: "Souk Ahras" }, { num: "42", name: "Tipaza" },
  { num: "43", name: "Mila" }, { num: "44", name: "Aïn Defla" }, { num: "45", name: "Naâma" },
  { num: "46", name: "Aïn Témouchent" }, { num: "47", name: "Ghardaïa" }, { num: "48", name: "Relizane" },
  { num: "49", name: "Timimoun" }, { num: "50", name: "Bordj Badji Mokhtar" }, { num: "51", name: "Ouled Djellal" },
  { num: "52", name: "Béni Abbès" }, { num: "53", name: "In Salah" }, { num: "54", name: "In Guezzam" },
  { num: "55", name: "Touggourt" }, { num: "56", name: "Djanet" }, { num: "57", name: "El M'Ghair" },
  { num: "58", name: "El Menia" },
];

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
  const [dbRates, setDbRates] = useState<CommissionRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(true);
  const [rateInputs, setRateInputs] = useState<Record<string, string>>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkSaved, setBulkSaved] = useState(false);
  const [rateError, setRateError] = useState("");

  // ── Calculate tab ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [offices, setOffices] = useState<Office[]>([]);
  const [officesLoading, setOfficesLoading] = useState(false);
  const [selectedOffice, setSelectedOffice] = useState("");
  const addFileRef = useRef<HTMLInputElement>(null);
  const [addUploading, setAddUploading] = useState(false);
  const [addError, setAddError] = useState("");

  const [results, setResults] = useState<CommissionResult[]>([]);
  const [totalCommissions, setTotalCommissions] = useState(0);
  const [resultOffice, setResultOffice] = useState("");
  const [detectedCols, setDetectedCols] = useState<{ delivered: string; wilaya: string } | null>(null);

  const fetchRates = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/commission-rates`, { headers: adminHeaders() });
      const d = await res.json();
      if (d.ok) setDbRates(d.rates ?? []);
    } catch { } finally { setRatesLoading(false); }
  }, []);

  const fetchOffices = useCallback(async () => {
    setOfficesLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/offices`, { headers: adminHeaders() });
      const d = await res.json();
      if (d.ok) setOffices(d.offices ?? []);
    } catch { } finally { setOfficesLoading(false); }
  }, []);

  useEffect(() => { fetchRates(); }, [fetchRates]);

  useEffect(() => {
    if (dbRates.length > 0) {
      const map: Record<string, string> = {};
      for (const r of dbRates) {
        map[r.wilaya_name] = String(r.rate_dzd);
      }
      setRateInputs(prev => {
        const merged: Record<string, string> = {};
        for (const w of ALL_WILAYAS) {
          merged[w.name] = prev[w.name] !== undefined ? prev[w.name] : (map[w.name] ?? "0");
        }
        return merged;
      });
    } else if (!ratesLoading) {
      const map: Record<string, string> = {};
      for (const w of ALL_WILAYAS) map[w.name] = "0";
      setRateInputs(map);
    }
  }, [dbRates, ratesLoading]);

  async function saveAllRates() {
    setBulkSaving(true); setRateError(""); setBulkSaved(false);
    try {
      const rates = ALL_WILAYAS.map(w => ({
        wilaya_name: w.name,
        wilaya_number: w.num,
        rate_dzd: parseFloat(rateInputs[w.name] ?? "0") || 0,
      }));
      const res = await fetch(`${API_BASE}/api/admin/commission-rates/bulk`, {
        method: "PUT", headers: adminHeaders(),
        body: JSON.stringify({ rates }),
      });
      const d = await res.json();
      if (d.ok) { setBulkSaved(true); fetchRates(); setTimeout(() => setBulkSaved(false), 2500); }
      else setRateError(d.error ?? "error");
    } catch { setRateError("connection error"); } finally { setBulkSaving(false); }
  }

  function openAddModal() {
    setShowAddModal(true);
    setSelectedOffice("");
    setAddError("");
    if (addFileRef.current) addFileRef.current.value = "";
    fetchOffices();
  }

  function closeAddModal() {
    setShowAddModal(false);
    setAddError("");
    if (addFileRef.current) addFileRef.current.value = "";
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = addFileRef.current?.files?.[0];
    if (!selectedOffice || !file) { setAddError("Veuillez sélectionner un bureau et un fichier."); return; }
    setAddUploading(true); setAddError("");
    try {
      const fd = new FormData();
      fd.append("officeName", selectedOffice);
      fd.append("xlsx", file);
      const res = await fetch(`${API_BASE}/api/admin/commissions/add`, {
        method: "POST",
        headers: { Authorization: adminHeaders().Authorization },
        body: fd,
      });
      const d = await res.json();
      if (d.ok) {
        setResults(d.results ?? []);
        setTotalCommissions(d.totalCommissions ?? 0);
        setResultOffice(d.officeName ?? selectedOffice);
        setDetectedCols({ delivered: d.detectedDeliveredCol ?? "", wilaya: d.detectedWilayaCol ?? "" });
        closeAddModal();
        setTab("calculate");
      } else {
        setAddError(d.detail ?? d.error ?? "Erreur lors du traitement du fichier.");
      }
    } catch { setAddError("Erreur de connexion."); } finally { setAddUploading(false); }
  }

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.commissions.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.commissions.subtitle")}</p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Ajouter Commission
        </button>
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-gray-900">{t("admin.commissions.rates.title")}</h2>
              <p className="text-xs text-gray-400 mt-0.5">Définissez le taux de commission (DZD) pour chaque wilaya puis cliquez sur Enregistrer.</p>
            </div>
            <button
              onClick={saveAllRates}
              disabled={bulkSaving}
              className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors shrink-0"
            >
              {bulkSaving ? <Spinner /> : bulkSaved ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              )}
              {bulkSaved ? "Enregistré !" : "Enregistrer tout"}
            </button>
          </div>
          {rateError && <p className="px-6 py-2 text-xs text-red-500 bg-red-50 border-b border-red-100">{rateError}</p>}
          {ratesLoading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />{t("admin.commissions.rates.loading")}</div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-gray-100 bg-gray-50/80">
                    <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3 w-14">#</th>
                    <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Wilaya</th>
                    <th className="text-right text-xs font-semibold text-gray-500 px-5 py-3 w-44">Taux (DZD / colis livré)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ALL_WILAYAS.map(w => {
                    const currentDb = dbRates.find(r => r.wilaya_name === w.name);
                    const val = rateInputs[w.name] ?? "0";
                    const numVal = parseFloat(val) || 0;
                    const isDirty = currentDb ? numVal !== currentDb.rate_dzd : numVal !== 0;
                    return (
                      <tr key={w.num} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-5 py-2.5 text-xs font-bold text-gray-400">{w.num}</td>
                        <td className="px-4 py-2.5 font-semibold text-gray-800">{w.name}</td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" title="Modifié" />}
                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value={val}
                              onChange={e => setRateInputs(prev => ({ ...prev, [w.name]: e.target.value }))}
                              className="w-28 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right font-semibold text-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 bg-white"
                            />
                            <span className="text-xs text-gray-400 shrink-0">DZD</span>
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
      )}

      {/* ── Tab: Calculate (Results) ── */}
      {tab === "calculate" && (
        <div className="space-y-4">
          {results.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
              <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M12 7h.01M15 7h.01M9 7H7a2 2 0 00-2 2v9a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-2" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium mb-1">Aucun calcul de commission</p>
              <p className="text-sm text-gray-400 mb-4">Cliquez sur <span className="font-semibold text-amber-600">Ajouter Commission</span> pour importer un fichier XLSX et calculer.</p>
              <button onClick={openAddModal} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                Ajouter Commission
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h2 className="font-bold text-gray-900">Résultats — {resultOffice}</h2>
                  {detectedCols && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Colonne livraisons : <span className="font-medium text-gray-600">{detectedCols.delivered}</span>
                      {" · "}Colonne wilaya : <span className="font-medium text-gray-600">{detectedCols.wilaya}</span>
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xl font-bold text-amber-600">{fmtDZ(totalCommissions)}</p>
                    <p className="text-xs text-gray-400">Commission totale</p>
                  </div>
                  <button onClick={openAddModal} className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                    Nouveau calcul
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="text-left text-xs font-semibold text-gray-500 px-6 py-3">Wilaya</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Colis livrés</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Taux / colis</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-4 py-3">Commission</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {results.map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                        <td className="px-6 py-3 font-semibold text-gray-800">{r.wilaya}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{fmtN(r.delivered)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{r.rate !== undefined ? fmtDZ(r.rate) : "—"}</td>
                        <td className={`px-4 py-3 text-right font-bold ${r.commission > 0 ? "text-amber-600" : "text-gray-400"}`}>{fmtDZ(r.commission)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-amber-50 border-t-2 border-amber-200">
                      <td colSpan={3} className="px-6 py-3 font-bold text-gray-900">Total</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-700 text-base">{fmtDZ(totalCommissions)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Add Commission Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeAddModal} />
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">Ajouter Commission</h3>
                <p className="text-xs text-gray-400 mt-0.5">Importez un fichier XLSX Ecotrack pour calculer les commissions.</p>
              </div>
              <button onClick={closeAddModal} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl">×</button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-6 space-y-6">
              {/* Section 1: Office */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">1</span>
                  <h4 className="font-semibold text-gray-800">Sélectionner le bureau</h4>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  {officesLoading ? (
                    <div className="flex items-center gap-2 text-gray-400 text-sm"><Spinner />Chargement des bureaux…</div>
                  ) : offices.length === 0 ? (
                    <p className="text-sm text-gray-400">Aucun bureau trouvé.</p>
                  ) : (
                    <select
                      value={selectedOffice}
                      onChange={e => setSelectedOffice(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 bg-white"
                    >
                      <option value="">— Choisir un bureau —</option>
                      {offices.map(o => (
                        <option key={o.id} value={o.wilaya}>
                          {o.wilaya_number ? `${o.wilaya_number} - ` : ""}{o.wilaya}{o.commune ? ` (${o.commune})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Section 2: xlsx file */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center shrink-0">2</span>
                  <h4 className="font-semibold text-gray-800">Choisir le fichier XLSX</h4>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-3">
                    Le fichier doit contenir une colonne <span className="font-semibold text-gray-600">wilaya</span> et une colonne <span className="font-semibold text-gray-600">Livrés À partir de la date de livraison des colis</span>.
                  </p>
                  <label className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white rounded-xl cursor-pointer transition-colors w-fit">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Choisir le fichier
                    <input ref={addFileRef} type="file" accept=".xlsx,.xls" className="sr-only" />
                  </label>
                  <p className="text-xs text-gray-400 mt-2">Format accepté : .xlsx, .xls</p>
                </div>
              </div>

              {addError && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-600">
                  {addError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeAddModal} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={addUploading || !selectedOffice}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm disabled:opacity-60 transition-colors"
                >
                  {addUploading ? <><Spinner />Calcul en cours…</> : "Calculer les commissions"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
