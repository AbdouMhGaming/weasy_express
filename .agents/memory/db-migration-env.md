---
name: DB migration env vars
description: Migration scripts for this project use separate MySQL env vars, not DATABASE_URL which points to a Replit PostgreSQL instance.
---

## Rule
Migration scripts in `lib/db/` must connect using individual env vars, not `DATABASE_URL`.

```js
const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS ?? "",
  port: parseInt(process.env.DB_PORT ?? "3306", 10),
});
```

**Why:** `DATABASE_URL` in the Replit environment is a `postgresql://` connection string for Replit's built-in PostgreSQL service. The app uses a separate MySQL database (Hostinger) accessed via `DB_HOST/DB_NAME/DB_USER/DB_PASS`. Using `DATABASE_URL` in mysql2 scripts will cause a connection refusal.

**How to apply:** All files in `lib/db/add-*.mjs` should use the individual env vars above. Run with `cd lib/db && node script.mjs`.
