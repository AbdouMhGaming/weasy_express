import { useState, useEffect, useCallback } from "react";
import { API_BASE, adminHeaders } from "@/lib/api";

type ChargeCategory = "marketing" | "hr" | "it" | "packaging" | "cod" | "warehouse" | "various";

interface Charge {
  id: number; category: ChargeCategory; amount_dzd: number;
  description: string | null; charge_date: string; created_at: string;
}

interface Payout {
  id: number; category: string; amount_dzd: number; method: string;
  reference: string | null; notes: string | null; payout_date: string; created_at: string;
}

const CATS: { key: ChargeCategory; label: string; icon: string }[] = [
  { key: "marketing", label: "Marketing", icon: "📣" },
  { key: "hr", label: "RH", icon: "👥" },
  { key: "it", label: "IT", icon: "💻" },
  { key: "packaging", label: "Emballage", icon: "📦" },
  { key: "cod", label: "COD", icon: "💰" },
  { key: "warehouse", label: "Entrepôt", icon: "🏭" },
  { key: "various", label: "Divers", icon: "📋" },
];

const fmtN = (n: number) => n.toLocaleString("fr-DZ");
const fmtD = (s: string) => {
  try { return new Date(s).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};

export default function ChargesView({ onUnauth }: { onUnauth: () => void }) {
  const [summary, setSummary] = useState<{ byCategory: Record<string, number>; totalCharges: number; totalPaid: number } | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [showCharge, setShowCharge] = useState(false);
  const [chgCat, setChgCat] = useState<ChargeCategory>("marketing");
  const [chgAmt, setChgAmt] = useState("");
  const [chgDesc, setChgDesc] = useState("");
  const [chgDate, setChgDate] = useState(new Date().toISOString().split("T")[0]);
  const [chgSaving, setChgSaving] = useState(false);

  const [showPayout, setShowPayout] = useState(false);
  const [payCat, setPayCat] = useState("general");
  const [payAmt, setPayAmt] = useState("");
  const [payMethod, setPayMethod] = useState("virement");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [paySaving, setPaySaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterFrom) qs.set("from", filterFrom);
      if (filterTo) qs.set("to", filterTo);
      const q = qs.toString() ? `?${qs.toString()}` : "";
      const [s, c, p] = await Promise.all([
        fetch(`${API_BASE}/api/admin/charges-summary`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/charges${q}`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/payouts${q}`, { headers: adminHeaders() }),
      ]);
      if (s.status === 401) { onUnauth(); return; }
      const [sd, cd, pd] = await Promise.all([s.json(), c.json(), p.json()]);
      if (sd.ok) setSummary(sd);
      if (cd.ok) setCharges(cd.charges ?? []);
      if (pd.ok) setPayouts(pd.payouts ?? []);
    } catch { } finally { setLoading(false); }
  }, [filterFrom, filterTo, onUnauth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function saveCharge() {
    if (!chgAmt || isNaN(parseInt(chgAmt))) return;
    setChgSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/charges`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ category: chgCat, amount_dzd: parseInt(chgAmt), description: chgDesc || null, charge_date: chgDate }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const d = await res.json();
      if (d.ok) { setShowCharge(false); setChgAmt(""); setChgDesc(""); fetchAll(); }
    } finally { setChgSaving(false); }
  }

  async function savePayout() {
    if (!payAmt || isNaN(parseInt(payAmt))) return;
    setPaySaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/payouts`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ category: payCat, amount_dzd: parseInt(payAmt), method: payMethod, reference: payRef || null, notes: payNotes || null, payout_date: payDate }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const d = await res.json();
      if (d.ok) { setShowPayout(false); setPayAmt(""); setPayRef(""); setPayNotes(""); fetchAll(); }
    } finally { setPaySaving(false); }
  }

  async function delCharge(id: number) {
    if (!confirm("Supprimer cette charge ?")) return;
    const res = await fetch(`${API_BASE}/api/admin/charges/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchAll();
  }

  async function delPayout(id: number) {
    if (!confirm("Supprimer ce virement ?")) return;
    const res = await fetch(`${API_BASE}/api/admin/payouts/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchAll();
  }

  const total = summary?.totalCharges ?? 0;
  const paid = summary?.totalPaid ?? 0;
  const balance = total - paid;

  const Spinner = () => (
    <svg className="animate-spin w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Charges</h1>
          <p className="text-sm text-gray-500 mt-0.5">Gestion des charges et virements</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowPayout(true)}
            className="flex items-center gap-2 text-sm font-semibold border border-emerald-500 text-emerald-600 px-4 py-2.5 rounded-xl hover:bg-emerald-50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Créer virement
          </button>
          <button onClick={() => setShowCharge(true)}
            className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            Ajouter charge
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Du</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">Au</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
        </div>
        <button onClick={fetchAll} className="px-4 py-2 text-sm font-bold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm transition-colors">Appliquer</button>
        {(filterFrom || filterTo) && (
          <button onClick={() => { setFilterFrom(""); setFilterTo(""); }} className="px-4 py-2 text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">Réinitialiser</button>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total Charges", value: total, color: "text-gray-900" },
          { label: "Total Virements", value: paid, color: "text-emerald-600" },
          { label: "Solde restant", value: balance, color: balance > 0 ? "text-[#E10600]" : "text-emerald-600" },
          { label: "Entrées de charge", value: charges.length, color: "text-gray-900", noDzd: true },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            {loading ? <Spinner /> : (
              <p className={`text-2xl font-bold ${k.color} leading-none`}>
                {fmtN(k.value)}{!k.noDzd && <span className="text-sm font-normal text-gray-400 ml-1">DZD</span>}
              </p>
            )}
            <p className="text-xs text-gray-500 mt-1 font-medium">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Category Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-8">
        {CATS.map((cat) => {
          const catTotal = summary?.byCategory[cat.key] ?? 0;
          const maxTotal = Math.max(...CATS.map(c => summary?.byCategory[c.key] ?? 0), 1);
          const pct = Math.round((catTotal / maxTotal) * 100);
          return (
            <div key={cat.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col items-center text-center gap-2">
              <span className="text-2xl">{cat.icon}</span>
              <p className="text-base font-bold text-gray-900 leading-none">{loading ? "—" : fmtN(catTotal)}</p>
              <p className="text-xs text-gray-400">DZD</p>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                <div className="h-1.5 rounded-full bg-[#E10600] transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs font-semibold text-gray-600 leading-tight">{cat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Lists */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Charges list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Historique des charges</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{charges.length}</span>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />Chargement…</div>
          ) : charges.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">Aucune charge enregistrée</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {charges.map((c) => {
                const cat = CATS.find(x => x.key === c.category);
                return (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                    <span className="text-lg shrink-0">{cat?.icon ?? "📋"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{cat?.label ?? c.category}</p>
                      {c.description && <p className="text-xs text-gray-500 truncate">{c.description}</p>}
                      <p className="text-xs text-gray-400">{fmtD(c.charge_date)}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 shrink-0">{fmtN(c.amount_dzd)} DZD</p>
                    <button onClick={() => delCharge(c.id)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"><TrashIcon /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payouts list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Virements effectués</h2>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{payouts.length}</span>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />Chargement…</div>
          ) : payouts.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">Aucun virement enregistré</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {payouts.map((p) => (
                <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 capitalize">{p.method}{p.reference ? ` · ${p.reference}` : ""}</p>
                    {p.notes && <p className="text-xs text-gray-500 truncate">{p.notes}</p>}
                    <p className="text-xs text-gray-400">{fmtD(p.payout_date)}</p>
                  </div>
                  <p className="text-sm font-bold text-emerald-600 shrink-0">{fmtN(p.amount_dzd)} DZD</p>
                  <button onClick={() => delPayout(p.id)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"><TrashIcon /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Charge Modal */}
      {showCharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowCharge(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 text-lg">Ajouter une charge</h3>
              <button onClick={() => setShowCharge(false)} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl">×</button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catégorie</label>
                <select value={chgCat} onChange={(e) => setChgCat(e.target.value as ChargeCategory)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                  {CATS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Montant (DZD)</label>
                  <input type="number" min="0" value={chgAmt} onChange={(e) => setChgAmt(e.target.value)} placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date</label>
                  <input type="date" value={chgDate} onChange={(e) => setChgDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Description (optionnel)</label>
                <input type="text" value={chgDesc} onChange={(e) => setChgDesc(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowCharge(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">Annuler</button>
              <button onClick={saveCharge} disabled={chgSaving || !chgAmt}
                className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] text-white font-bold rounded-xl shadow-md disabled:opacity-60">
                {chgSaving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Payout Modal */}
      {showPayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowPayout(false)} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-gray-900 text-lg">Créer un virement</h3>
              <button onClick={() => setShowPayout(false)} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl">×</button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Montant (DZD)</label>
                  <input type="number" min="0" value={payAmt} onChange={(e) => setPayAmt(e.target.value)} placeholder="0"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Date</label>
                  <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Méthode</label>
                  <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                    <option value="virement">Virement bancaire</option>
                    <option value="cash">Espèces</option>
                    <option value="cheque">Chèque</option>
                    <option value="ccp">CCP</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Catégorie</label>
                  <select value={payCat} onChange={(e) => setPayCat(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] bg-white">
                    <option value="general">Général</option>
                    {CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Référence</label>
                <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="REF-001"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Notes</label>
                <textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} rows={2} placeholder="Notes optionnelles…"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600] resize-none" />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowPayout(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">Annuler</button>
              <button onClick={savePayout} disabled={paySaving || !payAmt}
                className="flex-1 py-2.5 text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl shadow-md disabled:opacity-60">
                {paySaving ? "En cours…" : "Virer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
