---
name: Cross-portal Ecotrack identity
description: Durable authorization and identity rules for Admin, Expediteur, Suivi, and admin-owned team accounts.
---

Privileged cross-account Ecotrack operations must identify an order by both its tracking number and immutable Expediteur owner ID. A tracking number alone is not globally unique.

**Why:** Admin and Suivi can inspect orders across all Expediteurs. Resolving a tracking number with an unscoped first match can expose history or submit a remark using the wrong merchant account.

**How to apply:** Every Admin/Suivi delay, failure, notification, history, and remark flow must carry and validate the owner ID. Merchant-scoped flows should continue deriving the owner from their authenticated session.

Suivi uses an audience-bound token and its own local session namespace. Admin-owned team members use a non-superadmin role with server-loaded, deny-by-default permissions.

**Why:** Shared session keys caused portal crossover, and inheriting the root admin role would let a child account bypass section permissions.

**How to apply:** Keep Admin, Expediteur, and Suivi token storage and login audiences separate. Never let an admin-team account pass superadmin-only authorization; every permitted route must check its server-side permission, not only hide UI navigation.

Notification read state is per reader and portal audience, not a global field on the notification.

**Why:** A global read timestamp lets one Admin or Suivi user clear another user's unread state.

**How to apply:** List, unread-count, detail, and mark-read operations must consistently key read state to notification, authenticated username, and portal audience.

Expediteur users can replace their Ecotrack API while keeping the same local account. Shipping alerts must follow the API used for the original operation, not only the local merchant identity.

**Why:** The user reported that switching APIs left the previous API's notifications visible. Tracking numbers and the currently cached parcels cannot reliably prove the origin of a legacy alert; a late response from a previous API must not become an alert for the new API.

**How to apply:** Bind new shipping alerts to their originating API and consistently restrict lists, unread counts, detail access, and read mutations to the currently connected source. Retain unlinked legacy records without guessing their source or displaying them. Reconnecting the same API may retain its own linked alerts. Payout OTPs are local account-level notices, not shipping-API alerts: keep them available to the owning merchant regardless of external API changes, and never expose them to staff or team members.