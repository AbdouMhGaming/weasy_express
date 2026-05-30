---
name: MySQL schema push quirk
description: How to add new tables to the DB — drizzle-kit push fails, use raw SQL via Node script instead.
---

drizzle-kit push fails on int(11)→int or when PK already exists. To add new tables:

1. Define the table in `lib/db/src/schema/index.ts` (drizzle schema, for TypeScript types)
2. Run raw SQL via Node from workspace root using the pnpm-installed mysql2:

```bash
node -e "
const mysql = require('/home/runner/workspace/node_modules/.pnpm/mysql2@3.22.4_@types+node@25.3.5/node_modules/mysql2/promise');
const pool = mysql.createPool({ host: process.env.DB_HOST, database: process.env.DB_NAME, user: process.env.DB_USER, password: process.env.DB_PASS || '', port: parseInt(process.env.DB_PORT || '3306') });
(async () => { const conn = await pool.getConnection(); await conn.execute(\`CREATE TABLE IF NOT EXISTS ...\`); conn.release(); await pool.end(); })();
"
```

**Why:** drizzle-kit introspects the live DB and generates a diff; if column types or PK constraints differ even slightly from what drizzle generates, it errors or tries destructive ops. Raw SQL with `IF NOT EXISTS` is safe and idempotent.

**How to apply:** Any time a new table is added to schema/index.ts, also run the raw SQL CREATE TABLE manually before restarting the API server.

The mysql2 exact path may change with pnpm version upgrades — re-run `find /home/runner/workspace/node_modules -name "promise.js" -path "*/mysql2/*"` to confirm the path if it fails.
