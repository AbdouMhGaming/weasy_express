---
name: MySQL setup
description: Switching lib/db from PostgreSQL to MySQL2 for Hostinger shared hosting, and import resolution quirks.
---

## Rule
- lib/db uses `drizzle-orm/mysql2` + `mysql2/promise` pool. Env vars: DB_HOST, DB_NAME, DB_USER, DB_PASS, DB_PORT (default 3306).
- `mysql2` must be listed as a runtime dependency in BOTH `lib/db/package.json` AND `artifacts/api-server/package.json` because esbuild externalizes it (line 82 of build.mjs) and Node needs it at runtime.
- `drizzle-orm` query helpers (eq, desc, etc.) CANNOT be imported directly in api-server routes — pnpm does not hoist drizzle-orm into api-server's node_modules. Instead, re-export them from `lib/db/src/index.ts` and import from `@workspace/db`.

**Why:** Hostinger Business hosting only provides MySQL (no PostgreSQL). The shared hosting server is localhost-only, so DB connections from Replit dev may fail (timeout) but the server will still start since mysql2.createPool() is lazy.

**How to apply:** Any new db query in api-server must import { eq, desc, etc. } from "@workspace/db", not from "drizzle-orm".
