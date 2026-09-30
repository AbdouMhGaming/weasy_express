---
name: Web Push Notifications
description: Durable decisions for the web push notification system.
---

# Web Push Notifications — Durable Decisions

**Fire-and-forget for ticket triggers.** Push sends hit external services and can take >1 s. Always use `.catch(() => {})` after trigger calls; never await them before the HTTP response.

**Connection must be released before network sends.** `sendPushToRole` / `sendPushToOfficeHub` query usernames, release the connection in `finally`, then call `sendPushToUser` after. Holding a connection across external push-service HTTP calls exhausts the MySQL pool under load.

**`endpoint` column is `varchar(500)`, not `text`.** MySQL requires a fixed-length column to create a full unique index without a prefix. `varchar(500)` in `utf8mb4` = 2000 bytes, within the 3072-byte `innodb_large_prefix` limit. The `text` type would require a prefix unique key, which Drizzle cannot express; changing to `text` again breaks the schema-managed unique constraint.

**VAPID_PRIVATE_KEY is a Replit Secret, not an env var.** `VAPID_PUBLIC_KEY` is a shared env var (intentionally public). Never move the private key back to env vars — it would be committed to `.replit`.

**One browser push subscription can belong to only one signed-in portal identity at a time.** Transferring it to another account must turn off the prior account's local preference; disabling or logging out must not revoke a subscription now owned by someone else. Partition notification caches by portal and username, and clear protected caches on logout.

**Why:** The browser shares a service-worker subscription across same-origin portal sessions. The server can reassign its endpoint to a different username, and an unscoped client cache can briefly show the former user's notifications after a session switch.

**How to apply:** Compare the recorded browser owner before subscription revocation; make unsubscribe APIs report whether they actually deleted the caller's row. On logout, revoke the browser subscription only when the current identity still owns it, including when the API is temporarily unavailable.
