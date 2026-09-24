---
name: Ecotrack API behavior
description: Production authentication behavior and integration constraints that differ from the supplied Ecotrack documentation.
---

The Ecotrack production API returns HTTP 401 with `{"message":"Unauthenticated."}` for an invalid token, although the supplied documentation describes a successful HTTP response containing `INVALID_TOKEN`.

**Why:** Treating this real response as a network outage gives Expediteurs the wrong recovery guidance and can hide expired or mistyped credentials.

**How to apply:** Across Ecotrack endpoints, classify HTTP 401 and the `Unauthenticated.` message as invalid credentials. Keep 429 separate for rate limiting and reserve unavailable states for transport failures or unexpected upstream responses.

Ecotrack's "informations de suivi" means the remote history of remarks/mises à jour, including notes from stations, delivery staff, and expéditeurs. It is distinct from order details, status transitions, the original order remark, and remarks logged only inside this application. Fetch the live Ecotrack remarks when a user opens that history; don't infer it from the cached order.

**Why:** The user provided a real parcel whose Ecotrack remark history contains station and expéditeur messages absent from the locally recorded remarks and cached status history. Conflating those sources made the follow-up action show the wrong information.

**How to apply:** Keep the order-details action, tracking-status action, and remark-history action separate across merchant, admin, and suivi views. Preserve the remote text, source, author, and timestamp, and keep access scoped to both the owning expéditeur and tracking number.

For live remark history, Ecotrack's `get/maj` accepts GET even though its documentation shows a POST example. A station entry may put a generic "Écrire une remarque" placeholder in `remarque`; its actual message is in `commentaires`. `station` names a branch/location, while `livreur` identifies the person who wrote the station note. Sender-authored entries have neither field, and this API does not supply their individual author names.

**Why:** A live comparison against a user-reported parcel showed the exact mismatch: rendering the branch as author and the placeholder as text while hiding the actual comment. The order-level shipping account also differed from the per-entry sender names shown on Ecotrack's own site.

**How to apply:** Call GET directly; show the station as the source without substituting its location for the author, place the delivery person's name alongside the actual comment, and leave a sender note's author unspecified unless that specific entry explicitly provides one. Never guess from the order owner or shipping account.

Production authentication requires the token in the `api_token` query parameter; Bearer authentication alone fails. Send both forms from the backend gateway, and ensure request logging never includes upstream query strings.

**Why:** Live contract checks succeeded with the query parameter (with or without Bearer) and failed with Bearer alone, contrary to the general authentication guidance in the supplied documentation.

**How to apply:** Keep all Ecotrack calls server-side, inject both authentication forms centrally, and never expose the token or an authenticated upstream URL to the browser.

Complete statistics must come from an incremental per-Expediteur order cache rather than fetching the whole order history during dashboard requests. Team members may operate through the root account's credential only when granted the Ecotrack section; credential settings remain root-only.

**Why:** Production enforces tight minute/hour/day limits, while order history is paginated. Re-fetching every page for each dashboard view is slow and can exhaust the account's quota.

**How to apply:** Synchronize bounded page batches, persist the cursor and rate-limit block, serve aggregates from the cache, and enforce team permissions server-side before decrypting the root credential.

The numeric keys returned by `/api/v1/get/communes` are array positions, not the `commune_id` values returned on orders. Never join an order to a commune by those keys.

**Why:** Every array position from 0 through 1541 exists, so an incorrect key lookup appears successful while silently assigning the wrong real-world commune.

**How to apply:** For an existing order, resolve the commune from the order's own Ecotrack label, restricted to commune names belonging to its known wilaya. Prefer the longest printed name when one candidate is a substring of another, and cache the result to protect API limits.

Replacing or disconnecting an Ecotrack credential is an account-boundary event: clear that Expediteur's persisted order cache, synchronization state, server reference caches, and browser Ecotrack queries before loading the new account.

**Why:** Cache keys scoped only to the root Expediteur remain the same when its token changes. Without coordinated invalidation, orders and statistics from the previous Ecotrack account appear beside data from the newly connected account.

**How to apply:** Validate the new token first, then replace the credential and delete account-scoped database caches in one transaction. After commit, clear runtime caches and remove all browser queries under the Ecotrack query-key prefix.

Ecotrack tracking details are split across endpoints: `/get/tracking/info` returns status activity, while `/get/maj` can return a root array containing station, driver, comments, remark, and `created_at`.

**Why:** Reading only `info.activity`, or expecting `maj.activity`, silently hides delivery-attempt notes even though Ecotrack shows them in its own interface.

**How to apply:** Merge both sources by their complete date/time, retain unmatched rows, and preserve unknown non-empty fields for display so new upstream detail fields do not disappear.

Ecotrack order synchronization is server-driven: saving a token and API startup resume the one-time full import, then background refreshes fetch only the newest pages while the UI polls the local cache.

**Why:** Browser-triggered partial syncs left most pages unloaded and stopped when the user closed the page. Ecotrack also rate-limits bursts with short 429 retry windows.

**How to apply:** Pace order-list requests at roughly one per second, honor `Retry-After`, bulk-upsert each page, serialize each account with a MySQL advisory lock, and only reconcile deletions after the initial complete cycle. Never restart a full-history scan every minute.

Hostinger’s shared MySQL user has a strict hourly connection-handshake quota. Keep the application pool small and long-lived.

**Why:** Repeated deployment/startup and importer activity exhausted `max_connections_per_hour`, simultaneously breaking sync and every dashboard query.

**How to apply:** Use no more than three pooled connections with a long idle timeout, batch cache inserts, and avoid code that creates independent pools or reconnects for each sync page.

Ecotrack `/get/orders` silently defaults to non-archived orders created in the last 90 days; pagination can be complete while older active orders and status counts are still missing.

**Why:** A current API returned 63 orders and one `vers_wilaya` with default parameters, but 68 orders and two `vers_wilaya` when the documented historical date range was supplied.

**How to apply:** Every full order sync must send explicit `start_date` and `end_date`. Treat `next_page=1` as complete only when `last_page` and `last_synced_at` are also present.

Successful Ecotrack mutations must update the local order cache before responding; browser invalidation alone only rereads stale MySQL data. Bulk-create references must be unique, including generated references for blank values.

**Why:** Waiting for the background cycle hid create/update/delete results after refresh, and Ecotrack keys bulk-create results by reference, so blank or repeated references collide and can associate multiple rows with one tracking/label.

**How to apply:** Cache creates and edits synchronously, delete cached rows synchronously, then await browser list/dashboard invalidation. Correlate each bulk result through its unique submitted reference.

Ecotrack can leave an order's raw `status` as `encaisse_non_paye` after assigning it to a payment batch. A non-null `payment_id` is the discriminator for the separate `paiements_prets` filter state.

**Why:** Production data showed both payment stages sharing the same raw status; using that field alone collapsed “Encaissé non payé” and “Paiement prêt” into one filter and badge.

**How to apply:** When caching orders, derive `paiements_prets` only when the normalized raw status is `encaisse_non_paye` and `payment_id` is non-null. Return the derived cache status to list clients.

Ecotrack bulk creation can partially succeed inside an HTTP 200 response. Exchange orders (`type=2`) intentionally produce two labels: one outgoing label and one exchange/return label.

**Why:** Treating a partial response as one generic failure left successful rows available for retry and created duplicates. A two-label exchange PDF was mistaken for duplicate label generation.

**How to apply:** Correlate every bulk result to its client row, remove successes, retain failures with upstream field messages, and preserve stable references for retries. Do not crop exchange PDFs; users wanting one label must submit a delivery order (`type=1`).

STOP DESK is valid only when Ecotrack lists a relay office for the destination commune. If an imported row requests STOP DESK where none exists, keep the commune and switch that row to home delivery.

**Why:** Changing the commune would misroute the parcel, while forwarding `stop_desk=1` makes Ecotrack reject the order with “Aucun bureau n'est disponible”.

**How to apply:** Load Ecotrack's live `other_desks` list before bulk submission, compare normalized commune names, set `stop_desk=0` for unavailable communes, and clearly warn which rows were changed.

Cached Ecotrack orders identify their commune with `commune_id`; the commune display name is commonly absent from raw order JSON.

**Why:** Filtering cached orders by a selected commune name returned no matches even though the destination existed; production-shaped cache rows contained only the ID.

**How to apply:** Order-list filters must submit the selected commune's real Ecotrack ID and compare it to `commune_id`. Keep name matching only as a compatibility fallback.