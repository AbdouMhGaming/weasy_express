import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";

type ChargeCategory = "marketing" | "hr" | "it" | "packaging" | "cod" | "warehouse" | "various";
type ChargeType = "outcome" | "income";

interface Charge {
  id: number; category: ChargeCategory; amount_dzd: number;
  description: string | null; charge_date: string; type: ChargeType;
  attachment_name: string | null; created_at: string;
}

const fmtN = (n: number) => n.toLocaleString("fr-DZ");
const fmtD = (s: string) => {
  try { return new Date(s).toLocaleDateString("fr-DZ", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return s; }
};

const MAX_FILE_MB = 10;

export default function ChargesView({ onUnauth }: { onUnauth: () => void }) {
  const { t } = useTranslation();

  const CATS: { key: ChargeCategory; label: string; icon: string }[] = [
    { key: "marketing", label: t("admin.charges.catLabels.marketing"), icon: "📣" },
    { key: "hr",        label: t("admin.charges.catLabels.hr"),        icon: "👥" },
    { key: "it",        label: t("admin.charges.catLabels.it"),        icon: "💻" },
    { key: "packaging", label: t("admin.charges.catLabels.packaging"), icon: "📦" },
    { key: "cod",       label: t("admin.charges.catLabels.cod"),       icon: "💰" },
    { key: "warehouse", label: t("admin.charges.catLabels.warehouse"), icon: "🏭" },
    { key: "various",   label: t("admin.charges.catLabels.various"),   icon: "📋" },
  ];

  const [summary, setSummary] = useState<{ byCategory: Record<string, number>; totalCharges: number; totalIncome: number } | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // ── Outcome (charge) modal ──
  const [showCharge, setShowCharge] = useState(false);
  const [chgCat, setChgCat] = useState<ChargeCategory>("marketing");
  const [chgAmt, setChgAmt] = useState("");
  const [chgDesc, setChgDesc] = useState("");
  const [chgDate, setChgDate] = useState(new Date().toISOString().split("T")[0]);
  const [chgFile, setChgFile] = useState<{ name: string; b64: string } | null>(null);
  const [chgFileErr, setChgFileErr] = useState("");
  const [chgSaving, setChgSaving] = useState(false);
  const chgFileRef = useRef<HTMLInputElement>(null);

  // ── Income modal ──
  const [showIncome, setShowIncome] = useState(false);
  const [incCat, setIncCat] = useState<ChargeCategory>("marketing");
  const [incAmt, setIncAmt] = useState("");
  const [incDesc, setIncDesc] = useState("");
  const [incDate, setIncDate] = useState(new Date().toISOString().split("T")[0]);
  const [incSaving, setIncSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (filterFrom) qs.set("from", filterFrom);
      if (filterTo) qs.set("to", filterTo);
      const q = qs.toString() ? `?${qs.toString()}` : "";
      const [s, c] = await Promise.all([
        fetch(`${API_BASE}/api/admin/charges-summary`, { headers: adminHeaders() }),
        fetch(`${API_BASE}/api/admin/charges${q}`, { headers: adminHeaders() }),
      ]);
      if (s.status === 401) { onUnauth(); return; }
      const [sd, cd] = await Promise.all([s.json(), c.json()]);
      if (sd.ok) setSummary(sd);
      if (cd.ok) setCharges(cd.charges ?? []);
    } catch { } finally { setLoading(false); }
  }, [filterFrom, filterTo, onUnauth]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function resetChgModal() {
    setChgAmt(""); setChgDesc(""); setChgFile(null); setChgFileErr("");
    setChgDate(new Date().toISOString().split("T")[0]);
    setChgCat("marketing");
    if (chgFileRef.current) chgFileRef.current.value = "";
  }

  function resetIncModal() {
    setIncAmt(""); setIncDesc("");
    setIncDate(new Date().toISOString().split("T")[0]);
    setIncCat("marketing");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setChgFileErr("");
    const file = e.target.files?.[0];
    if (!file) { setChgFile(null); return; }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setChgFileErr(t("admin.charges.chargeModal.fileTooBig", { max: MAX_FILE_MB }));
      setChgFile(null); e.target.value = ""; return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(",")[1];
      setChgFile({ name: file.name, b64 });
    };
    reader.readAsDataURL(file);
  }

  async function saveCharge() {
    if (!chgAmt || isNaN(parseInt(chgAmt))) return;
    setChgSaving(true);
    try {
      const body: Record<string, unknown> = {
        category: chgCat, amount_dzd: parseInt(chgAmt),
        description: chgDesc || null, charge_date: chgDate, type: "outcome",
      };
      if (chgFile) { body.attachment_name = chgFile.name; body.attachment_data = chgFile.b64; }
      const res = await fetch(`${API_BASE}/api/admin/charges`, {
        method: "POST", headers: adminHeaders(), body: JSON.stringify(body),
      });
      if (res.status === 401) { onUnauth(); return; }
      const d = await res.json();
      if (d.ok) { setShowCharge(false); resetChgModal(); fetchAll(); }
    } finally { setChgSaving(false); }
  }

  async function saveIncome() {
    if (!incAmt || isNaN(parseInt(incAmt))) return;
    setIncSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/charges`, {
        method: "POST", headers: adminHeaders(),
        body: JSON.stringify({ category: incCat, amount_dzd: parseInt(incAmt), description: incDesc || null, charge_date: incDate, type: "income" }),
      });
      if (res.status === 401) { onUnauth(); return; }
      const d = await res.json();
      if (d.ok) { setShowIncome(false); resetIncModal(); fetchAll(); }
    } finally { setIncSaving(false); }
  }

  async function delCharge(id: number) {
    if (!confirm(t("admin.charges.deleteChargeConfirm"))) return;
    const res = await fetch(`${API_BASE}/api/admin/charges/${id}`, { method: "DELETE", headers: adminHeaders() });
    if (res.status === 401) { onUnauth(); return; }
    fetchAll();
  }

  const outcomes = charges.filter(c => c.type === "outcome" || !c.type);
  const incomes = charges.filter(c => c.type === "income");
  const totalOutcome = summary?.totalCharges ?? 0;
  const totalIncome = summary?.totalIncome ?? 0;
  const balance = totalIncome - totalOutcome;

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

  const SharedFields = ({
    cat, setcat, amt, setamt, desc, setdesc, date, setdate, accent,
  }: {
    cat: ChargeCategory; setcat: (v: ChargeCategory) => void;
    amt: string; setamt: (v: string) => void;
    desc: string; setdesc: (v: string) => void;
    date: string; setdate: (v: string) => void;
    accent: string;
  }) => (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.charges.chargeModal.category")}</label>
        <select value={cat} onChange={(e) => setcat(e.target.value as ChargeCategory)}
          className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${accent} bg-white`}>
          {CATS.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.charges.chargeModal.amount")}</label>
          <input type="number" min="0" value={amt} onChange={(e) => setamt(e.target.value)} placeholder="0"
            className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${accent}`} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.charges.chargeModal.date")}</label>
          <input type="date" value={date} onChange={(e) => setdate(e.target.value)}
            className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${accent}`} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.charges.chargeModal.description")}</label>
        <input type="text" value={desc} onChange={(e) => setdesc(e.target.value)} placeholder={t("admin.charges.chargeModal.descPh")}
          className={`w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${accent}`} />
      </div>
    </div>
  );

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.charges.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.charges.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowIncome(true)}
            className="flex items-center gap-2 text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {t("admin.charges.addIncome")}
          </button>
          <button onClick={() => setShowCharge(true)}
            className="flex items-center gap-2 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white px-4 py-2.5 rounded-xl shadow-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            {t("admin.charges.addCharge")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("admin.charges.from")}</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1.5">{t("admin.charges.to")}</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]" />
        </div>
        <button onClick={fetchAll} className="px-4 py-2 text-sm font-bold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm transition-colors">{t("admin.charges.apply")}</button>
        {(filterFrom || filterTo) && (
          <button onClick={() => { setFilterFrom(""); setFilterTo(""); }} className="px-4 py-2 text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors">{t("admin.charges.reset")}</button>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
        {[
          { label: t("admin.charges.kpi.totalOutcome"), value: totalOutcome, color: "text-[#E10600]" },
          { label: t("admin.charges.kpi.totalIncome"), value: totalIncome, color: "text-emerald-600" },
          { label: t("admin.charges.kpi.balance"), value: balance, color: balance >= 0 ? "text-emerald-600" : "text-[#E10600]" },
          { label: t("admin.charges.kpi.entries"), value: charges.length, color: "text-gray-900", noDzd: true },
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

      {/* Category Cards (outcome only) */}
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
        {/* Outcome list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E10600] shrink-0" />
              <h2 className="font-bold text-gray-900">{t("admin.charges.list.chargesTitle")}</h2>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{outcomes.length}</span>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />{t("admin.charges.loading")}</div>
          ) : outcomes.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">{t("admin.charges.list.noCharges")}</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {outcomes.map((c) => {
                const cat = CATS.find(x => x.key === c.category);
                return (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                    <span className="text-lg shrink-0">{cat?.icon ?? "📋"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{cat?.label ?? c.category}</p>
                      {c.description && <p className="text-xs text-gray-500 truncate">{c.description}</p>}
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-gray-400">{fmtD(c.charge_date)}</p>
                        {c.attachment_name && (
                          <a href={`${API_BASE}/api/admin/charges/${c.id}/attachment`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-0.5 font-medium">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            {c.attachment_name.length > 16 ? c.attachment_name.slice(0, 14) + "…" : c.attachment_name}
                          </a>
                        )}
                      </div>
                    </div>
                    <p className="text-sm font-bold text-[#E10600] shrink-0">-{fmtN(c.amount_dzd)} DZD</p>
                    <button onClick={() => delCharge(c.id)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"><TrashIcon /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Income list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              <h2 className="font-bold text-gray-900">{t("admin.charges.list.incomeTitle")}</h2>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full font-semibold">{incomes.length}</span>
          </div>
          {loading ? (
            <div className="py-16 flex items-center justify-center gap-2 text-gray-400 text-sm"><Spinner />{t("admin.charges.loading")}</div>
          ) : incomes.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">{t("admin.charges.list.noIncome")}</div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
              {incomes.map((c) => {
                const cat = CATS.find(x => x.key === c.category);
                return (
                  <div key={c.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/50 transition-colors">
                    <span className="text-lg shrink-0">{cat?.icon ?? "📋"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{cat?.label ?? c.category}</p>
                      {c.description && <p className="text-xs text-gray-500 truncate">{c.description}</p>}
                      <p className="text-xs text-gray-400">{fmtD(c.charge_date)}</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-600 shrink-0">+{fmtN(c.amount_dzd)} DZD</p>
                    <button onClick={() => delCharge(c.id)} className="text-gray-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"><TrashIcon /></button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add Charge (Outcome) Modal */}
      {showCharge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowCharge(false); resetChgModal(); }} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-[#E10600]" />
                <h3 className="font-bold text-gray-900 text-lg">{t("admin.charges.chargeModal.title")}</h3>
              </div>
              <button onClick={() => { setShowCharge(false); resetChgModal(); }} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl">×</button>
            </div>
            <p className="text-xs text-gray-400 mb-5 ml-5">{t("admin.charges.chargeModal.subtitle")}</p>
            <SharedFields
              cat={chgCat} setcat={setChgCat}
              amt={chgAmt} setamt={setChgAmt}
              desc={chgDesc} setdesc={setChgDesc}
              date={chgDate} setdate={setChgDate}
              accent="focus:ring-[#E10600]/30 focus:border-[#E10600]"
            />
            {/* File attachment */}
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("admin.charges.chargeModal.attachment")}</label>
              <div className="relative">
                <input
                  ref={chgFileRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleFileChange}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-600 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#E10600]/30 focus:border-[#E10600]"
                />
              </div>
              {chgFileErr && <p className="text-xs text-red-500 mt-1">{chgFileErr}</p>}
              {chgFile && !chgFileErr && (
                <div className="flex items-center gap-2 mt-1.5">
                  <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  <span className="text-xs text-gray-500 truncate">{chgFile.name}</span>
                  <button type="button" onClick={() => { setChgFile(null); if (chgFileRef.current) chgFileRef.current.value = ""; }} className="ml-auto text-gray-300 hover:text-red-400 text-sm">×</button>
                </div>
              )}
              <p className="text-xs text-gray-400 mt-1">{t("admin.charges.chargeModal.attachmentHint", { max: MAX_FILE_MB })}</p>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setShowCharge(false); resetChgModal(); }} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.charges.chargeModal.cancel")}</button>
              <button onClick={saveCharge} disabled={chgSaving || !chgAmt}
                className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] text-white font-bold rounded-xl shadow-md disabled:opacity-60">
                {chgSaving ? t("admin.charges.chargeModal.saving") : t("admin.charges.chargeModal.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Income Modal */}
      {showIncome && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowIncome(false); resetIncModal(); }} />
          <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-500" />
                <h3 className="font-bold text-gray-900 text-lg">{t("admin.charges.incomeModal.title")}</h3>
              </div>
              <button onClick={() => { setShowIncome(false); resetIncModal(); }} className="text-gray-400 hover:text-gray-700 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-xl">×</button>
            </div>
            <p className="text-xs text-gray-400 mb-5 ml-5">{t("admin.charges.incomeModal.subtitle")}</p>
            <SharedFields
              cat={incCat} setcat={setIncCat}
              amt={incAmt} setamt={setIncAmt}
              desc={incDesc} setdesc={setIncDesc}
              date={incDate} setdate={setIncDate}
              accent="focus:ring-emerald-500/30 focus:border-emerald-500"
            />
            <div className="flex gap-2 mt-6">
              <button onClick={() => { setShowIncome(false); resetIncModal(); }} className="flex-1 py-2.5 text-sm text-gray-600 font-medium rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.charges.incomeModal.cancel")}</button>
              <button onClick={saveIncome} disabled={incSaving || !incAmt}
                className="flex-1 py-2.5 text-sm bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold rounded-xl shadow-md disabled:opacity-60">
                {incSaving ? t("admin.charges.incomeModal.saving") : t("admin.charges.incomeModal.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
