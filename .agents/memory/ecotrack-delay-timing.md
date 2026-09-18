---
name: Ecotrack delay timing
description: Durable rules for calculating late Ecotrack orders and configuring thresholds.
---

Delay thresholds are global operational settings keyed by wilaya, with separate normalized hour values for `vers_wilaya` and `en_livraison`. The UI may edit them in hours or days, but the API and database use integer hours.

**Why:** Thresholds are configured centrally by the superadmin and apply consistently to every Expediteur. Storing one normalized unit avoids ambiguous comparisons.

**How to apply:** Calculate elapsed time from the latest recorded entry into the order's current status. Use the remote update/creation timestamp only for pre-history orders that do not yet have a recorded transition.