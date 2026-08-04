import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { API_BASE, adminHeaders } from "@/lib/api";
import { usePagination, PaginationBar } from "@/components/Pagination";

interface Worker {
  id: number;
  first_name: string;
  last_name: string;
  worker_id: string;
  phone: string;
  nin: string;
  position: string;
  hub: string;
  created_at: string;
}

interface Office {
  id: number;
  wilaya: string;
  commune: string | null;
  phone: string | null;
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const INPUT_CLS = "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E10600]/20 focus:border-[#E10600] transition-colors bg-white";
const LABEL_CLS = "block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5";

function officeLabel(o: Office) {
  return `${o.wilaya}${o.commune ? " — " + o.commune : ""}`;
}

export default function WorkersView() {
  const { t } = useTranslation();
  const role = localStorage.getItem("admin_role") ?? "";

  const [workers, setWorkers] = useState<Worker[]>([]);
  const [positions, setPositions] = useState<string[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editWorker, setEditWorker] = useState<Worker | null>(null);
  const [fName, setFName] = useState("");
  const [lName, setLName] = useState("");
  const [wId, setWId] = useState("");
  const [phone, setPhone] = useState("");
  const [nin, setNin] = useState("");
  const [position, setPosition] = useState("");
  const [hub, setHub] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const fetchWorkers = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/admin/workers`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setWorkers(d.workers ?? []);
    } catch {} finally { setLoading(false); }
  }, []);

  const fetchPositions = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/settings/worker_positions`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok && d.value) {
        try { setPositions(JSON.parse(d.value)); } catch {}
      }
    } catch {}
  }, []);

  const fetchOffices = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/admin/offices`, { headers: adminHeaders() });
      const d = await r.json();
      if (d.ok) setOffices(d.offices ?? []);
    } catch {}
  }, []);

  useEffect(() => { fetchWorkers(); fetchPositions(); fetchOffices(); }, [fetchWorkers, fetchPositions, fetchOffices]);

  function openAdd() {
    setEditWorker(null);
    setFName(""); setLName(""); setWId(""); setPhone(""); setNin("");
    setPosition(positions[0] ?? ""); setHub("");
    setFormError("");
    setShowModal(true);
  }

  function openEdit(w: Worker) {
    setEditWorker(w);
    setFName(w.first_name); setLName(w.last_name); setWId(w.worker_id);
    setPhone(w.phone); setNin(w.nin); setPosition(w.position); setHub(w.hub);
    setFormError("");
    setShowModal(true);
  }

  async function saveWorker() {
    if (!fName.trim() || !lName.trim()) { setFormError(t("admin.workers.formError")); return; }
    setSaving(true); setFormError("");
    try {
      const body = { first_name: fName.trim(), last_name: lName.trim(), worker_id: wId.trim(), phone: phone.trim(), nin: nin.trim(), position: position.trim(), hub: hub.trim() };
      const url = editWorker ? `${API_BASE}/api/admin/workers/${editWorker.id}` : `${API_BASE}/api/admin/workers`;
      const method = editWorker ? "PUT" : "POST";
      const r = await fetch(url, { method, headers: adminHeaders(), body: JSON.stringify(body) });
      const d = await r.json();
      if (d.ok) { setShowModal(false); fetchWorkers(); }
      else setFormError(t("admin.workers.saveError"));
    } catch { setFormError(t("admin.workers.saveError")); } finally { setSaving(false); }
  }

  async function deleteWorker(id: number) {
    try {
      await fetch(`${API_BASE}/api/admin/workers/${id}`, { method: "DELETE", headers: adminHeaders() });
      setConfirmDeleteId(null);
      fetchWorkers();
    } catch {}
  }

  const filtered = useMemo(() =>
    workers.filter(w =>
      `${w.first_name} ${w.last_name} ${w.worker_id} ${w.position} ${w.hub}`.toLowerCase().includes(search.toLowerCase())
    ),
    [workers, search]
  );
  const pagedWorkers = usePagination(filtered);

  return (
    <div className="p-3 sm:p-6 lg:p-8 min-h-screen bg-gray-50/50">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("admin.workers.title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("admin.workers.subtitle")}</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-[#E10600] hover:bg-[#C50500] text-white rounded-xl shadow-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
          {t("admin.workers.add")}
        </button>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-5 flex items-center gap-3">
        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t("admin.workers.search")}
          className="flex-1 text-sm outline-none placeholder-gray-300 bg-transparent" />
        {search && <button onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2 text-gray-400"><Spinner /><span className="text-sm">{t("admin.workers.loading")}</span></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-16 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <p className="text-gray-400 text-sm">{search ? t("admin.workers.noResults") : t("admin.workers.empty")}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/60">
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-5 py-3">{t("admin.workers.cols.name")}</th>
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden sm:table-cell">{t("admin.workers.cols.id")}</th>
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">{t("admin.workers.cols.phone")}</th>
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden lg:table-cell">{t("admin.workers.cols.nin")}</th>
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3">{t("admin.workers.cols.position")}</th>
                  <th className="text-left text-xs font-bold text-gray-400 uppercase tracking-wide px-4 py-3 hidden md:table-cell">{t("admin.workers.cols.hub")}</th>
                  <th className="px-4 py-3 w-20" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagedWorkers.paged.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#E10600] to-[#B80500] flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {w.first_name[0]}{w.last_name[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{w.first_name} {w.last_name}</p>
                          <p className="text-xs text-gray-400">{new Date(w.created_at).toLocaleDateString("fr-DZ")}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-gray-600 font-mono text-xs hidden sm:table-cell">{w.worker_id || "—"}</td>
                    <td className="px-4 py-3.5 text-gray-600 hidden md:table-cell">{w.phone || "—"}</td>
                    <td className="px-4 py-3.5 text-gray-600 font-mono text-xs hidden lg:table-cell">{w.nin || "—"}</td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-[#E10600] border border-red-100">{w.position || "—"}</span>
                    </td>
                    <td className="px-4 py-3.5 text-gray-500 text-sm hidden md:table-cell">{w.hub || "—"}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => openEdit(w)} className="p-1.5 rounded-lg text-gray-300 hover:text-[#E10600] hover:bg-red-50 transition-colors" title={t("admin.workers.edit")}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        {role === "admin" && (
                          <button onClick={() => setConfirmDeleteId(w.id)} className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar {...pagedWorkers} />
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white w-full max-w-lg rounded-2xl shadow-2xl mx-4 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-[#E10600] to-[#B80500] px-6 pt-5 pb-4 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">{editWorker ? t("admin.workers.editTitle") : t("admin.workers.addTitle")}</h3>
                    {editWorker && <p className="text-white/70 text-xs">{editWorker.first_name} {editWorker.last_name}</p>}
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="text-white/70 hover:text-white w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors text-xl">×</button>
              </div>
            </div>
            <div className="px-6 py-5 overflow-y-auto">
              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-4 flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>{t("admin.workers.fields.firstName")}</label>
                  <input value={fName} onChange={e => setFName(e.target.value)} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>{t("admin.workers.fields.lastName")}</label>
                  <input value={lName} onChange={e => setLName(e.target.value)} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>{t("admin.workers.fields.workerId")}</label>
                  <input value={wId} onChange={e => setWId(e.target.value)} className={INPUT_CLS} placeholder="N° carte d'identité" />
                </div>
                <div>
                  <label className={LABEL_CLS}>{t("admin.workers.fields.phone")}</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} className={INPUT_CLS} />
                </div>
                <div>
                  <label className={LABEL_CLS}>{t("admin.workers.fields.nin")}</label>
                  <input value={nin} onChange={e => setNin(e.target.value)} className={INPUT_CLS} placeholder="Numéro d'immatriculation" />
                </div>
                <div>
                  <label className={LABEL_CLS}>{t("admin.workers.fields.position")}</label>
                  {positions.length > 0 ? (
                    <select value={position} onChange={e => setPosition(e.target.value)} className={INPUT_CLS}>
                      <option value="">— {t("admin.workers.fields.selectPosition")} —</option>
                      {positions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <input value={position} onChange={e => setPosition(e.target.value)} className={INPUT_CLS} />
                  )}
                </div>
                <div className="col-span-2">
                  <label className={LABEL_CLS}>{t("admin.workers.fields.hub")}</label>
                  {offices.length > 0 ? (
                    <select value={hub} onChange={e => setHub(e.target.value)} className={INPUT_CLS}>
                      <option value="">— Choisir un hub —</option>
                      {offices.map(o => (
                        <option key={o.id} value={officeLabel(o)}>{officeLabel(o)}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={hub} onChange={e => setHub(e.target.value)} className={INPUT_CLS} placeholder="Hub / Wilaya" />
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 pb-5 flex gap-2.5 shrink-0">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 text-sm text-gray-600 font-semibold rounded-xl border border-gray-200 hover:bg-gray-50">{t("admin.workers.cancel")}</button>
              <button onClick={saveWorker} disabled={saving} className="flex-1 py-2.5 text-sm bg-gradient-to-r from-[#E10600] to-[#C50500] hover:from-[#C50500] hover:to-[#A50400] text-white font-bold rounded-xl shadow-md shadow-red-200 disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <><Spinner />{t("admin.workers.saving")}</> : t("admin.workers.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setConfirmDeleteId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl mx-4 w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <p className="font-bold text-gray-900 mb-1">{t("admin.workers.deleteConfirm")}</p>
            <p className="text-sm text-gray-400 mb-5">{t("admin.workers.deleteHint")}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">{t("admin.workers.cancel")}</button>
              <button onClick={() => deleteWorker(confirmDeleteId)} className="flex-1 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors">{t("admin.workers.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
