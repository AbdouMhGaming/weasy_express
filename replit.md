# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Weasy Express artifact

Multilingual (FR/EN/AR) logistics website for Algeria.

### Standing implementation requirements

- Any new or modified interface must follow the main website's existing visual theme, colors, typography, spacing, and component patterns.
- Every user-facing addition or change must support all three languages: French, English, and Arabic. Add or update translation keys in every locale and preserve proper RTL behavior for Arabic.
- Every new or modified interface must be mobile-friendly and responsive across phones, tablets, and desktop screens. Avoid desktop-only layouts, horizontal overflow, and controls that are difficult to use on touchscreens.
- Any list or table that may contain a large amount of data must include pagination. Follow the established compact pattern: rows-per-page selector, visible item range and total count, numbered pages, previous/next controls, and a sensible default page size. Keep the controls usable on mobile and fully localized in FR/EN/AR.
- When a feature requires persistent data, include the necessary database table, columns, relationships, and safe migration/setup script as part of the same implementation. Do not leave database setup as an implicit manual step.
- The production application uses the existing MySQL database. Never use `drizzle-kit push` because the database contains tables outside the Drizzle schema; use explicit, safe SQL migration scripts instead.
- Build Hostinger deployment archives only with `node scripts/build-hostinger.mjs`. Do not manually assemble or zip production files. The script is the source of truth: it builds both artifacts, copies the SPA and API output, includes the required production dependencies (`mysql2` and `drizzle-orm`), creates the expected upload directories, and produces `deploy/weasy-express-<date>.zip`.
- Before delivering a Hostinger archive, confirm that `node scripts/build-hostinger.mjs` completes successfully and report the generated archive path. If server imports or external dependencies change, update the build script's generated production `package.json` so Hostinger installs everything required at runtime.
- Ecotrack Portal and Ecotrack Settings must remain available in the Replit project. Exclude them only from Hostinger public builds through the `VITE_HOSTINGER_BUILD` build flag; never remove their shared source or Replit navigation.

### Tracking integration

- The tracking system proxies the public Ecotrack page (`https://suivi.ecotrack.dz/{lang}/suivi/{number}`) through the API server.
- Endpoint: `GET /api/track/:number?lang=fr|en|ar` (in `artifacts/api-server/src/routes/tracking.ts`).
- The server fetches the page with a browser User-Agent, parses it with `cheerio`, and returns a structured JSON payload (status, progress steps, full event timeline with date+location, carrier, sender, origin/destination wilaya, hub).
- A 302 redirect from Ecotrack means "tracking number not found" → returns 404.
- Status text and step labels come back already localized by Ecotrack (we forward the user's i18n language).
- Frontend client lives in `artifacts/weasy-express/src/lib/tracking.ts`; rich rendering in `src/components/TrackingResult.tsx`.
- Iframe embedding of Ecotrack is blocked by their `X-Frame-Options: SAMEORIGIN`, which is why we proxy + parse instead.
