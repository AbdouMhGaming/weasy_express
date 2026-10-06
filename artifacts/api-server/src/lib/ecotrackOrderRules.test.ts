import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalOrderStatus, quoteFees } from "./ecotrackOrderRules";
import { matchesOtp, otpHash } from "./payoutOtp";

const fees = { Livraison: [{ wilaya_id: 16, tarif: 500, tarif_stopdesk: 300 }], Echange: [{ wilaya_id: 16, tarif: 650, tarif_stopdesk: 450 }] };
test("list statuses match Ecotrack's live tracking labels and separate archival history", () => {
  assert.equal(canonicalOrderStatus("retour_reçu"), "retours_prets");
  assert.equal(canonicalOrderStatus("retour_recu"), "retours_prets");
  assert.equal(canonicalOrderStatus("retour_archive"), "return_received");
  assert.equal(canonicalOrderStatus("return_received"), "return_received");
  assert.equal(canonicalOrderStatus("retour_en_stock"), "retour_en_stock");
  assert.equal(canonicalOrderStatus("paye_et_archive"), "paiement_archive");
});
test("delivery tariffs use actual service and stop desk rate", () => {
  assert.equal(quoteFees(fees, "16", "1", false, null).deliveryFee, 500);
  assert.equal(quoteFees(fees, "16", "1", true, null).totalFee, 300);
  assert.equal(quoteFees({ data: fees }, "16", "2", true, null).deliveryFee, 450);
});
test("missing fees and unspecified weight schedules are not zero", () => {
  assert.equal(quoteFees(fees, "1", "1", false, null).deliveryFee, null);
  const quote = quoteFees(fees, "16", "1", false, 10);
  assert.equal(quote.weightFee, null);
  assert.equal(quote.totalFee, null);
  assert.equal(quote.weightPricingAvailable, false);
});
test("Ecotrack poids schedules respect thresholds, service and desk-specific increments", () => {
  const schedule = { ...fees, poids: {
    livraison: { a_partir_de_KG: "5.00", surfacturation_a_domicile_DA: "50", surfacturation_stopdesk_DA: "75", pour_chaque_KG: "1.00" },
    echange: { a_partir_de_KG: "3.00", surfacturation_a_domicile_DA: "80", surfacturation_stopdesk_DA: "100", pour_chaque_KG: "2.00" },
    pickup: null,
  } };
  assert.equal(quoteFees(schedule, "16", "1", false, 4).weightFee, 0);
  assert.equal(quoteFees(schedule, "16", "1", false, 5).weightFee, 0);
  assert.equal(quoteFees(schedule, "16", "1", false, 5.2).weightFee, 50);
  assert.equal(quoteFees(schedule, "16", "1", false, 6.2).totalFee, 600);
  assert.equal(quoteFees(schedule, "16", "1", true, 6.2).totalFee, 450);
  assert.equal(quoteFees({ data: schedule }, "16", "2", false, 5.1).weightFee, 160);
  assert.equal(quoteFees(schedule, "16", "2", true, 5.1).totalFee, 650);
  assert.equal(quoteFees(schedule, "16", "3", false, 6).weightPricingAvailable, false);
  const decimalStep = { ...fees, poids: { livraison: { a_partir_de_KG: "5", surfacturation_a_domicile_DA: "10", pour_chaque_KG: "0.1" } } };
  assert.equal(quoteFees(decimalStep, "16", "1", false, 5.2).weightFee, 20);
});
test("payout codes are salted, bound to the payout, and compared safely", () => {
  const hash = otpHash(123, "salt-a", "123456");
  assert.ok(matchesOtp(123, "salt-a", "123456", hash));
  assert.ok(!matchesOtp(124, "salt-a", "123456", hash));
  assert.ok(!matchesOtp(123, "salt-b", "123456", hash));
  assert.ok(!matchesOtp(123, "salt-a", "123457", hash));
  assert.ok(!matchesOtp(123, "salt-a", "123", hash));
  assert.ok(!matchesOtp(123, "salt-a", "123456", ""));
});
