---
name: Ecotrack API behavior
description: Production authentication behavior and integration constraints that differ from the supplied Ecotrack documentation.
---

The Ecotrack production API returns HTTP 401 with `{"message":"Unauthenticated."}` for an invalid token, although the supplied documentation describes a successful HTTP response containing `INVALID_TOKEN`.

**Why:** Treating this real response as a network outage gives Expediteurs the wrong recovery guidance and can hide expired or mistyped credentials.

**How to apply:** Across Ecotrack endpoints, classify HTTP 401 and the `Unauthenticated.` message as invalid credentials. Keep 429 separate for rate limiting and reserve unavailable states for transport failures or unexpected upstream responses.

Production authentication requires the token in the `api_token` query parameter; Bearer authentication alone fails. Send both forms from the backend gateway, and ensure request logging never includes upstream query strings.

**Why:** Live contract checks succeeded with the query parameter (with or without Bearer) and failed with Bearer alone, contrary to the general authentication guidance in the supplied documentation.

**How to apply:** Keep all Ecotrack calls server-side, inject both authentication forms centrally, and never expose the token or an authenticated upstream URL to the browser.

Complete statistics must come from an incremental per-Expediteur order cache rather than fetching the whole order history during dashboard requests. Team members may operate through the root account's credential only when granted the Ecotrack section; credential settings remain root-only.

**Why:** Production enforces tight minute/hour/day limits, while order history is paginated. Re-fetching every page for each dashboard view is slow and can exhaust the account's quota.

**How to apply:** Synchronize bounded page batches, persist the cursor and rate-limit block, serve aggregates from the cache, and enforce team permissions server-side before decrypting the root credential.

The numeric keys returned by `/api/v1/get/communes` are array positions, not the `commune_id` values returned on orders. Never join an order to a commune by those keys.

**Why:** Every array position from 0 through 1541 exists, so an incorrect key lookup appears successful while silently assigning the wrong real-world commune.

**How to apply:** For an existing order, resolve the commune from the order's own Ecotrack label, restricted to commune names belonging to its known wilaya. Prefer the longest printed name when one candidate is a substring of another, and cache the result to protect API limits.