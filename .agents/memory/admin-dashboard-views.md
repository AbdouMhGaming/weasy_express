---
name: Admin dashboard views
description: Architecture of the admin dashboard views — separate component files, routing, and role-based access.
---

## View files
- `src/pages/admin/PerformanceView.tsx` — 4-tab analytics (Revenue, Expenses, Customers, Delivery)
- `src/pages/admin/ChargesView.tsx` — Charges CRUD + Payouts CRUD + category breakdown
- `src/pages/admin/OfficeDashboardView.tsx` — PDF upload (Ecotrack reports) + stats; used for both office role and admin "Tableau Agence"

## Routing in AdminDashboard
```
role === "office" → OfficeDashboardView (isAdmin=false)
!isAdmin         → EmptyRoleView
view === "performance"     → PerformanceView
view === "charges"         → ChargesView
view === "office-dashboard"→ OfficeDashboardView (isAdmin=true)
```

## Sidebar nav
- Admin gets: dashboard, partners, offices, admins | separator | performance, charges, office-dashboard
- Office role gets: own nav with "office-dashboard" only (no EmptyRoleView shown)

## API endpoints (all require adminAuth; charges/payouts also require superAdminOnly)
- GET /api/admin/top-stats — top senders, wilayas, office agents, commercial
- GET /api/admin/charges-summary — by-category totals + grand totals
- GET/POST/DELETE /api/admin/charges
- GET/POST/DELETE /api/admin/payouts
- GET/POST/DELETE /api/office/reports — PDF upload via multer+pdf-parse

## DB tables created
`charges`, `payouts`, `office_reports` — created via `cd lib/db && node add-tables.mjs`

**Why:** Drizzle-kit push fails on the MySQL host; tables must be created with raw SQL scripts run from the lib/db package directory (mysql2 only resolves from there).
