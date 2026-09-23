---
name: Portal session expiry
description: Required client behavior when Admin or Expediteur authentication expires.
---

Protected frontend requests must treat HTTP 401 as an expired portal session: clear only the session keys for the current portal and redirect to its matching login. Do not present 401 as an Ecotrack connection failure. Keep 403 and 409 as business/connectivity errors unless an endpoint explicitly defines otherwise.

**Why:** Server sessions expire after their configured lifetime while browser storage persists. Leaving the stale token in place caused Ecotrack views and Queue to retry indefinitely and appear disconnected until the user manually logged out and back in.

**How to apply:** Route protected requests through the shared response-aware request helper. Preserve server-side Ecotrack credentials during session cleanup so signing in restores access without reconnecting Ecotrack.