---
name: Ecotrack tracking collations
description: Cross-table tracking comparisons in the existing MySQL database.
---

The existing cached-order and locally recorded remark tables use different implicit MySQL collations for tracking identifiers. Comparing their tracking columns directly can raise `ER_CANT_AGGREGATE_2COLLATIONS` even when the identifiers are equal.

**Why:** A Suivi delivery-failures query failed for every user because an unrelated remark-existence filter compared the two columns; the UI only showed a generic error.

**How to apply:** When a feature genuinely needs to join those records, specify an explicit common collation for the tracking comparison (and preserve the owning expéditeur ID check). When the feature does not need local remarks, do not join or compare those tables.