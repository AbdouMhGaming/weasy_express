---
name: MySQL schema push quirk
description: How to add new tables to the DB — drizzle-kit push is dangerous, use raw SQL Node scripts instead. Never run db push in post-merge.
---

**drizzle-kit push must never run in automated/post-merge contexts.** The DB has many tables not in the Drizzle schema (created via raw SQL scripts). drizzle-kit sees them as "extra" and prompts to DROP them — with stdin closed in post-merge, it hangs until timeout. The post-merge script runs only `pnpm install --frozen-lockfile`.

**Why:** drizzle-kit introspects the live DB, generates a diff, and when it finds tables/columns not declared in the schema it offers to delete them. Since most tables in this project were added via raw SQL (not Drizzle schema), running push risks destroying data. Raw SQL scripts with `IF NOT EXISTS` are safe and idempotent.

**How to add new tables:**
1. Define the table in `lib/db/src/schema/index.ts` for TypeScript types only.
2. Create a `lib/db/add-<name>.mjs` migration script using mysql2/promise.
3. Run it manually: `cd lib/db && node add-<name>.mjs`

**How to apply:** Never add `pnpm --filter db push` back to `scripts/post-merge.sh`. Any new table needs its own add-*.mjs script run manually after deploy.
