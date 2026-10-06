export const normalizeLookup = (value: unknown) => String(value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLocaleLowerCase();

/** Returns normalized 0[567]XXXXXXXX or null. Accepts +213 / 00213 prefixes and separators. */
export function normalizeDzMobile(value: unknown): string | null {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00213")) digits = digits.slice(5);
  else if (digits.startsWith("213")) digits = digits.slice(3);
  if (/^[567]\d{8}$/.test(digits)) digits = `0${digits}`;
  return /^0[567]\d{8}$/.test(digits) ? digits : null;
}

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const firstText = (...v: unknown[]) => v.map(text).find(Boolean) ?? "";

export function getDriver(order: any): { name: string; phone: string } {
  const raw = order?.livreur ?? order?.driver;
  const obj = raw && typeof raw === "object" ? raw : null;
  const name = obj
    ? firstText(obj.name, obj.nom, obj.full_name, obj.fullname, [obj.nom, obj.prenom].filter(Boolean).join(" "))
    : firstText(raw, order?.livreur_name, order?.driver_name, order?.livreur_nom);
  const phone = obj
    ? firstText(obj.phone, obj.telephone, obj.tel, obj.mobile)
    : "";
  return {
    name: name || firstText(order?.livreur_name, order?.driver_name),
    phone: phone || firstText(order?.livreur_phone, order?.driver_phone, order?.livreur_tel, order?.driver_tel, order?.livreur_telephone, order?.driver_telephone),
  };
}

const truthyFlag = (v: unknown) => v === true || ["1", "true", "oui", "yes"].includes(String(v ?? "").trim().toLowerCase());
/** Ecotrack /get/communes flag. Authoritative Stop Desk availability. */
export const communeHasStopDesk = (c: any) => truthyFlag(c?.has_stop_desk);
export const sameId = (a: unknown, b: unknown) => {
  const x = String(a ?? "").replace(/^DZ/i, "").replace(/^0+/, ""), y = String(b ?? "").replace(/^DZ/i, "").replace(/^0+/, "");
  return x !== "" && x === y;
};
export const communeInWilaya = (c: any, wilaya: any) =>
  Boolean(wilaya) && (sameId(c?.wilaya_id, wilaya.wilaya_id) || (c?.wilaya_id == null && c?.wilaya_name != null && normalizeLookup(c.wilaya_name) === normalizeLookup(wilaya.wilaya_name)));
/** Wilayas (from /get/wilayas, which has no flag) that own at least one flagged commune. */
export function stopDeskWilayas(wilayas: any[], allCommunes: any[]) {
  const flagged = allCommunes.filter(communeHasStopDesk);
  return wilayas.filter(w => flagged.some(c => communeInWilaya(c, w)));
}
export const communesOfWilaya = (wilaya: any, allCommunes: any[]) => allCommunes.filter(c => communeInWilaya(c, wilaya));

const FEE_KEYS: Record<string, string[]> = { "1": ["livraison", "delivery"], "2": ["echange", "exchange"], "3": ["pickup", "ramassage"], "4": ["recouvrement", "collection"] };
const findByType = (obj: any, type: string): any => {
  if (!obj || typeof obj !== "object") return undefined;
  const want = FEE_KEYS[type] ?? FEE_KEYS["1"];
  for (const [k, v] of Object.entries(obj)) if (want.some(w => normalizeLookup(k).includes(w))) return v;
  return undefined;
};
const num = (v: unknown) => { if (v === null || v === undefined || String(v).trim() === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

export type FeeQuote = { delivery: number | null; weightFee: number | null; weightUnavailable: boolean; total: number | null; hasWeight: boolean };
/** Pure derivation from /get/fees: tarif / tarif_stopdesk per wilaya + poids rules. No invented values. */
export function quoteFromFees(fees: any, wilayaId: string, type: string, stopDesk: boolean, weightRaw: unknown): FeeQuote {
  const w = num(weightRaw);
  const hasWeight = w !== null && w > 0;
  const rows = findByType(fees, type);
  const row: any = Array.isArray(rows) ? rows.find((r: any) => sameId(r?.wilaya_id ?? r?.wilaya, wilayaId)) : null;
  const delivery = row ? num(stopDesk ? row.tarif_stopdesk : row.tarif) : null;
  let weightFee: number | null = null, weightUnavailable = false;
  if (hasWeight) {
    const rule: any = findByType(fees?.poids, type);
    const from = num(rule?.a_partir_de_KG), step = num(rule?.pour_chaque_KG);
    const charge = num(stopDesk ? rule?.surfacturation_stopdesk_DA : rule?.surfacturation_a_domicile_DA);
    if (from === null || step === null || step <= 0 || charge === null) weightUnavailable = true;
    else weightFee = Math.max(0, Math.ceil((w! - from) / step - 1e-9)) * charge;
  }
  if (weightFee !== null) weightFee = Math.round(weightFee * 100) / 100 + 0;
  const total = delivery === null || weightUnavailable ? null : delivery + (weightFee ?? 0);
  return { delivery, weightFee, weightUnavailable, total, hasWeight };
}
