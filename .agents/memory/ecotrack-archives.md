---
name: Ecotrack archived history
description: Archive retrieval limitations and authoritative receipt status sources.
---

Received-payment and received-return histories cannot be reconstructed by filtering the active-order list alone. Retrieve receipt statuses for the owning account's retained tracking numbers and preserve archive data separately.

**Why:** Ecotrack's documented `/get/orders` excludes archived parcels; active-cache pruning removes those parcels locally. `/get/orders/status` can retrieve confirmed archives by tracking number. `/get/trackings/info` supplies parcel details, but its human status can still say “Retours prêts” when the status endpoint confirms `retour_archive`.

**How to apply:** Treat `paye_et_archive` and `retour_archive` as receipt confirmations; ready statuses are not confirmations. Match every returned tracking to an owner-scoped requested tracking before attaching details. Keep an explicit coverage warning: older, never-synchronized tracking numbers cannot be enumerated through the supplied public API. Do not promise a complete pre-integration archive or invent missing payment data.
