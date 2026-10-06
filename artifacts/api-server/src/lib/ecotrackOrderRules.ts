// Only explicit upstream rates may be quoted. Missing data is not a zero fee.
export function lookup(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}
export function unwrap(value: any): any {
  for (let i = 0; i < 2 && value?.data && typeof value.data === "object"; i++) value = value.data;
  return value;
}
/** Ecotrack's list-order keys differ from its live tracking display labels. */
export function canonicalOrderStatus(value: unknown) {
  const status = lookup(value).replace(/[\s-]+/g, "_");
  if (status === "retour_recu") return "retours_prets";
  if (status === "retour_archive") return "return_received";
  if (status === "paye_et_archive") return "paiement_archive";
  return value;
}
export function quoteFees(fees: any, wilaya: string, type: string, desk: boolean, weight: number | null) {
  const services = ({ "1": ["livraison", "delivery"], "2": ["echange", "exchange"], "3": ["pickup"], "4": ["recouvrement", "collection"] } as Record<string, string[]>)[type] ?? [];
  const data = unwrap(fees) ?? {};
  const rows = Object.entries(data).find(([service, values]) => Array.isArray(values) && services.includes(lookup(service)))?.[1] as any[] | undefined;
  const row = rows?.find(r => String(r.wilaya_id ?? r.wilaya) === wilaya);
  const numeric = (value: any) => (typeof value === "number" || typeof value === "string") && String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const deliveryFee = numeric(desk ? row?.tarif_stopdesk : row?.tarif);
  // Ecotrack's live /get/fees response quotes a surcharge per kg increment,
  // separately for each operation and for home delivery versus Stop Desk.
  const rules = Object.entries(data.poids ?? {}).find(([service]) => services.includes(lookup(service)))?.[1] as any;
  const included = numeric(rules?.a_partir_de_KG);
  const price = numeric(desk ? rules?.surfacturation_stopdesk_DA : rules?.surfacturation_a_domicile_DA);
  const step = numeric(rules?.pour_chaque_KG);
  const weightPricingAvailable = included !== null && price !== null && step !== null && step > 0;
  const weightFee = weight === null ? null : weightPricingAvailable
    ? Math.round(Math.max(0, Math.ceil(Math.max(0, weight - included!) / step! - 1e-9)) * price! * 100) / 100
    : null;
  return { deliveryFee, weightFee, totalFee: deliveryFee === null || (weight !== null && weightFee === null) ? null : deliveryFee + (weightFee ?? 0), weightPricingAvailable };
}
