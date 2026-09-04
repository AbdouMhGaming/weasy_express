---
name: Ecotrack API behavior
description: Production authentication behavior and integration constraints that differ from the supplied Ecotrack documentation.
---

The Ecotrack production API returns HTTP 401 with `{"message":"Unauthenticated."}` for an invalid token, although the supplied documentation describes a successful HTTP response containing `INVALID_TOKEN`.

**Why:** Treating this real response as a network outage gives Expediteurs the wrong recovery guidance and can hide expired or mistyped credentials.

**How to apply:** Across Ecotrack endpoints, classify HTTP 401 and the `Unauthenticated.` message as invalid credentials. Keep 429 separate for rate limiting and reserve unavailable states for transport failures or unexpected upstream responses.