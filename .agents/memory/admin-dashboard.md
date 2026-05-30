---
name: Admin dashboard
description: Auth mechanism and routing for the /admin pages in weasy-express.
---

## Rule
- Auth: HMAC-SHA256 token, 24h TTL, signed with ADMIN_SECRET env var. No JWT library needed.
- Token stored in localStorage as `admin_token`, sent as `Authorization: Bearer <token>`.
- Credentials from env vars: ADMIN_USER (default: "admin"), ADMIN_PASS (default: "weasy2024"). User should override via Replit secrets.
- API endpoints: POST /api/admin/login, GET /api/admin/partners, PATCH /api/admin/partners/:id, DELETE /api/admin/partners/:id.
- Frontend: /admin/login (login page), /admin (dashboard). Both outside the Layout component in App.tsx — placed as top-level routes before the catch-all Layout route.

**Why:** Simple stateless token auth without external dependencies, suitable for a single-admin back-office.

**How to apply:** Add new admin API routes in artifacts/api-server/src/routes/admin.ts with the adminAuth middleware. Add new admin pages outside the Layout wrapper in App.tsx.
