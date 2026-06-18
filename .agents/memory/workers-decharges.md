---
name: Workers & Décharges sections
description: Workers list + salary receipt (décharge) PDF generation added to the admin dashboard.
---

## Workers table
Columns: id, first_name, last_name, worker_id (ID card), phone, nin, position, hub, created_at.
All CRUD via `financeOrAdminOnly` middleware (finance + admin both have access).

## Décharges table
Columns: id, worker_db_id, worker_* (snapshot fields), recu_number, salaire_fixe, primes, montant_net, period_label, created_by, created_at.
Worker fields are snapshotted at creation time so PDFs remain accurate even if the worker record changes.

## Reçu number format
`DEC-{year}-{NNNN}` (zero-padded 4 digits). Counter stored in `app_settings` as `decharge_counter` (plain integer string). Auto-incremented with `FOR UPDATE` lock on creation.

## PDF generation
Client-side with `jspdf` + `jsbarcode` (both dynamically imported in `DechargesView.tsx`).
- JsBarcode renders CODE128 barcode to a hidden `<canvas>` → data URL → embedded in jsPDF
- PDF auto-downloads after creation; re-download available from the list.

## Worker positions
Stored as JSON array in `app_settings` with key `worker_positions`.
Managed via super-admin Settings page (new "Postes des employés" section).
Workers view reads this list via `GET /api/admin/settings/worker_positions`.

**Why:** Positions are configurable so the admin can adapt them to company needs without a code change.

## Sidebar access
Both `workers` and `decharges` appear in admin sidebar AND finance sidebar.
Finance view routing handles these views in addition to charges/commissions.
