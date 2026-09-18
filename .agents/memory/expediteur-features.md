---
name: Expediteur role & features
description: Full implementation of Expediteur user type, payout requests, team sub-accounts, and ticket system overhaul.
---

# Expediteur Role & Features

## Role
- `AdminRole` type now includes `"expediteur"` alongside admin/office/finance/commercial.
- Expediteur accounts live in the `admins` table but are managed via separate `/api/admin/expediteurs` routes (NOT the existing `/api/admin/admins` routes).
- Expediteurs are created from `artifacts/api-server/src/routes/expediteurs.ts`.
- On login, `office_hub`, `isTeam`, `permissions` are stored in localStorage (`admin_office_hub`, `admin_is_team`, `admin_permissions`).

## DB columns added
- `admins`: `phone`, `email`, `parent_id`, `permissions`
- `tickets`: `recipient_office` (VARCHAR 200 NULL) — used when destination_type = pickup_desk
- New table: `expediteur_payouts` (id, expediteur_username, office_hub, amount_dzd, requested_date, status ENUM, notes, admin_notes)
- Migration script: `lib/db/add-expediteur-features.mjs`

## Queue system changes
- `destination_type = "merchant"` maps to Expéditeur users (UI label changed, DB value unchanged).
- `pickup_desk` now stores `recipient_office` (office hub string) NOT `recipient_username`.
- Expediteur users fetched from `/api/admin/users/expediteur` (not /users/commercial).
- Offices fetched from `/api/admin/offices-simple` for pickup_desk dropdown.
- Expediteur role: cannot use merchant destination tab; direction filter shown.
- Office role: can create tickets; direction filter shown.
- Backend visibility: admin sees all; office sees pickup_desk for their hub + central_team + their own; expediteur sees merchant addressed to them + their own.

## Key files
- `artifacts/api-server/src/routes/expediteurs.ts` — all expediteur CRUD, payouts CRUD, team accounts, users/expediteur, offices-simple
- `artifacts/api-server/src/routes/tickets.ts` — rewritten for new visibility rules
- `artifacts/weasy-express/src/pages/admin/dashboard.tsx` — ExpediteursView component; PayoutsRequestView/TeamView lazy-imported; expediteur sidebar branch
- `artifacts/weasy-express/src/pages/admin/QueueView.tsx` — recipient_office, expediteurUsers, officesList
- `artifacts/weasy-express/src/pages/admin/PayoutsRequestView.tsx` — payout request UI
- `artifacts/weasy-express/src/pages/admin/TeamView.tsx` — team sub-accounts UI

## Team sub-accounts
- Stored in `admins` table with `parent_id` pointing to creator and `permissions` JSON.
- Created via `/api/admin/team` routes in expediteurs.ts.
- Sub-accounts inherit parent role; permission subset shown in TeamView.tsx.

**Why:** Expediteur is a separate role from commercial. Keep expediteur CRUD routes separate from admin/office/finance/commercial routes to avoid coupling.

## Ecotrack analytics source

Expediteur analytics must be scoped to the authenticated root Expediteur account and calculated from the persisted Ecotrack order cache. Do not implement dashboard filters by repeatedly fetching the merchant's full upstream Ecotrack history.

**Why:** Full-history upstream requests are slow and risk Ecotrack rate limits; the synchronized cache supports fast server-side filtering and consistent period comparisons.

**How to apply:** Add analytics dimensions to the authenticated Expediteur analytics endpoint and cached-order query. Keep Super Admin analytics endpoints separate because they are not merchant-scoped.

## Ecotrack order navigation

Commandes is a collapsible status-based workspace. History is the read-only all-orders view, while only the ready-to-ship status keeps edit, ship, label-download, and delete actions. Order creation starts from the dashboard action menu.

**Why:** Merchants need active operational work separated from historical inspection; newly created orders must remain immediately actionable without making completed orders mutable.

**How to apply:** Add new order states beneath Commandes, keep History details-only, and support both `pret_a_expedier` and Ecotrack's documented `prete_a_expedier` spelling.
