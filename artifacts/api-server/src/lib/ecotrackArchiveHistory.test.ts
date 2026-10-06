import { test } from "node:test";
import assert from "node:assert/strict";
import { receivedArchiveKind, verifiedArchiveEntries } from "./ecotrackArchiveHistory";

test("only confirmed archived payments and received returns belong in received history", () => {
  assert.equal(receivedArchiveKind("payé_et_archivé"), "payment");
  assert.equal(receivedArchiveKind("paye_et_archive"), "payment");
  assert.equal(receivedArchiveKind("retour_archive"), "return");
  assert.equal(receivedArchiveKind("retour_reçu"), null);
  assert.equal(receivedArchiveKind("retours_prets"), null);
  assert.equal(receivedArchiveKind("paiements_prets"), null);
  assert.equal(receivedArchiveKind("encaisse_non_paye"), null);
});
test("history rejects unsolicited parcel IDs and unconfirmed statuses", () => {
  const rows = verifiedArchiveEntries({ data: {
    OWN_RETURN: { status: "retour_archive" },
    OWN_PAYMENT: { status: "payé_et_archivé" },
    OWN_READY: { status: "retour_reçu" },
    OTHER_MERCHANT: { status: "retour_archive" },
  } }, ["OWN_RETURN", "OWN_PAYMENT", "OWN_READY"]);
  assert.deepEqual(rows.map(r => [r.tracking, r.kind]), [["OWN_RETURN", "return"], ["OWN_PAYMENT", "payment"]]);
});
