---
name: Ecotrack archived history
description: Archive retrieval limitations and authoritative receipt status sources.
---

Received-payment and received-return histories cannot be reconstructed by filtering the active-order list alone. Retrieve receipt statuses for the owning account's retained tracking numbers and preserve archive data separately.

**Why:** Ecotrack's documented `/get/orders` excludes archived parcels; active-cache pruning removes those parcels locally. `/get/orders/status` can retrieve confirmed archives by tracking number. `/get/trackings/info` supplies parcel details, but its human status can still say “Retours prêts” when the status endpoint confirms `retour_archive`.

**How to apply:** Treat `paye_et_archive` and `retour_archive` as receipt confirmations; ready statuses are not confirmations. Match every returned tracking to an owner-scoped requested tracking before attaching details. Keep an explicit coverage warning: older, never-synchronized tracking numbers cannot be enumerated through the supplied public API. Do not promise a complete pre-integration archive or invent missing payment data.

The received-payment history must be a transaction ledger, not a flat list of paid parcels: expandable transactions contain actual gross collections, service fees, net amounts, billing state, payment receipts, and constituent parcels with detailed fee breakdowns. Received-return history must show request, transfer, and validation dates/person, plus the transfer reference and parcel details.

**Why:** The user supplied Ecotrack screenshots clarifying these two business views. A confirmed archived parcel does not establish the payment transaction, all deductions, receipt document, or return handoff dates.

**How to apply:** Obtain authoritative transaction and transfer data before filling these fields. Do not substitute the application's own payout requests for Ecotrack transactions, infer official net payments from delivery tariffs, or represent parcel creation dates as receipt dates.

History must remain API-first. Uploaded screenshots and spreadsheet exports are reference material, not authorization to replace automatic Ecotrack synchronization with manual imports.

**Why:** After supplying the requested Excel samples, the user explicitly reiterated that the histories should be found through the API and previously supplied documentation. The supplied status/tracking responses confirm archived returns but omit the handoff dates shown in the exports.

**How to apply:** Investigate the actual Ecotrack page/data routes when the documented parcel endpoints lack ledger fields. Do not silently import reference files, guess transaction totals, or equate parcel tracking events with return-transfer validation events.
