---
name: Web Push Notifications
description: Architecture and key decisions for the push notification system added to api-server and weasy-express.
---

# Web Push Notification System

## Architecture
- **VAPID keys**: generated with Node.js `createECDH('prime256v1')`, stored as env vars `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (shared env). The private key should be moved to a Replit Secret for production.
- **Service Worker**: `artifacts/weasy-express/public/sw.js` — handles `push` and `notificationclick` events. Registered in AdminDashboard's useEffect on mount.
- **Backend helper**: `artifacts/api-server/src/lib/pushNotify.ts` — exports `sendPushToUser`, `sendPushToRole`, `sendPushToOfficeHub`. Calls `webpush.setVapidDetails` at module load time.
- **Push route**: `artifacts/api-server/src/routes/push.ts` — mounted in `routes/index.ts`; provides `/api/push/vapid-public-key`, `/api/push/subscribe`, `/api/push/unsubscribe`.
- **DB table**: `push_subscriptions` (id, username, endpoint, p256dh, auth, created_at), UNIQUE on `endpoint(255)`. Added via `lib/db/add-push-subscriptions-table.mjs`.

## Notification Triggers (in tickets.ts)
- Ticket created → notify recipient (sendPushToUser for merchant, sendPushToOfficeHub for pickup_desk, sendPushToRole("admin") for central_team)
- Status changed → notify created_by
- Comment added → notify the OTHER party (creator commented → notify recipient; recipient commented → notify creator)
- All triggers are fire-and-forget (`.catch(() => {})`) so they never block the HTTP response.

## Frontend Bell Icon
- Lives inside `SidebarInner` in `dashboard.tsx` around line ~290 (before changePassword button).
- State: `notifEnabled` (localStorage "push_enabled"==="1"), `notifLoading`.
- Toggle calls `Notification.requestPermission()` → `reg.pushManager.subscribe(...)` → `POST /api/push/subscribe`.
- Renders only when `"Notification" in window && "serviceWorker" in navigator`.

**Why fire-and-forget for triggers:** Push sends are network calls to external push services (FCM, APNS) that can take >1s. Awaiting them would slow down every ticket operation.

**How to apply:** When adding new ticket event types, import from `pushNotify.ts` and fire `.catch(() => {})` after the DB write, not before the HTTP response.
