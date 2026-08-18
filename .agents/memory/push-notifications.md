---
name: Web Push Notifications
description: Durable decisions for the web push notification system.
---

# Web Push Notifications — Durable Decisions

**Fire-and-forget for ticket triggers.** Push sends hit external services and can take >1 s. Always use `.catch(() => {})` after trigger calls; never await them before the HTTP response.

**Connection must be released before network sends.** `sendPushToRole` / `sendPushToOfficeHub` query usernames, release the connection in `finally`, then call `sendPushToUser` after. Holding a connection across external push-service HTTP calls exhausts the MySQL pool under load.

**`endpoint` column is `varchar(500)`, not `text`.** MySQL requires a fixed-length column to create a full unique index without a prefix. `varchar(500)` in `utf8mb4` = 2000 bytes, within the 3072-byte `innodb_large_prefix` limit. The `text` type would require a prefix unique key, which Drizzle cannot express; changing to `text` again breaks the schema-managed unique constraint.

**VAPID_PRIVATE_KEY is a Replit Secret, not an env var.** `VAPID_PUBLIC_KEY` is a shared env var (intentionally public). Never move the private key back to env vars — it would be committed to `.replit`.
