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

type DeskLoc = { wilayaRaw: string; commune: string };
export function deskLocations(desks: any): DeskLoc[] {
  const list: any[] = [];
  if (desks?.my_desk) list.push(desks.my_desk);
  if (Array.isArray(desks?.other_desks)) list.push(...desks.other_desks);
  const out: DeskLoc[] = [];
  for (const d of list) {
    const loc = d?.location ?? {};
    const w = loc.wilaya ?? d?.wilaya ?? loc.wilaya_name ?? d?.wilaya_name ?? loc.wilaya_id ?? d?.wilaya_id;
    const wilayaRaw = w && typeof w === "object" ? firstText(w.wilaya_id, w.id, w.name, w.nom) : text(w);
    const commune = text(loc.commune ?? d?.commune ?? loc.commune_name ?? d?.commune_name);
    if (wilayaRaw && commune) out.push({ wilayaRaw, commune });
  }
  return out;
}
export const deskMatchesWilaya = (loc: DeskLoc, wilaya: any) =>
  String(wilaya.wilaya_id) === loc.wilayaRaw || normalizeLookup(wilaya.wilaya_name) === normalizeLookup(loc.wilayaRaw);

export function deskWilayas(wilayas: any[], locs: DeskLoc[]) {
  return wilayas.filter(w => locs.some(l => deskMatchesWilaya(l, w)));
}
export function deskCommuneSet(wilaya: any | undefined, locs: DeskLoc[]) {
  return new Set(locs.filter(l => wilaya && deskMatchesWilaya(l, wilaya)).map(l => normalizeLookup(l.commune)));
}

export function feeFor(fees: any, wilayaId: string, type: string, stopDesk: boolean): number | null {
  if (!fees || typeof fees !== "object" || !wilayaId) return null;
  const want = type === "2" ? ["echange", "exchange"] : ["livraison", "delivery"];
  for (const [service, rows] of Object.entries(fees)) {
    if (!Array.isArray(rows) || !want.some(k => normalizeLookup(service).includes(k))) continue;
    const row: any = rows.find((r: any) => String(r?.wilaya_id ?? r?.wilaya ?? "") === String(wilayaId));
    const value = row ? (stopDesk ? row.tarif_stopdesk : row.tarif) : null;
    const n = value === null || value === undefined || value === "" ? NaN : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
