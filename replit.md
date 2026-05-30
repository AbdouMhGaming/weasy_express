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

### Tracking integration

- The tracking system proxies the public Ecotrack page (`https://suivi.ecotrack.dz/{lang}/suivi/{number}`) through the API server.
- Endpoint: `GET /api/track/:number?lang=fr|en|ar` (in `artifacts/api-server/src/routes/tracking.ts`).
- The server fetches the page with a browser User-Agent, parses it with `cheerio`, and returns a structured JSON payload (status, progress steps, full event timeline with date+location, carrier, sender, origin/destination wilaya, hub).
- A 302 redirect from Ecotrack means "tracking number not found" → returns 404.
- Status text and step labels come back already localized by Ecotrack (we forward the user's i18n language).
- Frontend client lives in `artifacts/weasy-express/src/lib/tracking.ts`; rich rendering in `src/components/TrackingResult.tsx`.
- Iframe embedding of Ecotrack is blocked by their `X-Frame-Options: SAMEORIGIN`, which is why we proxy + parse instead.
