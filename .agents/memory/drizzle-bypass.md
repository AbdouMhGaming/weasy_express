---
name: Drizzle bypass for schema mismatch
description: When a DB column type was changed outside Drizzle (e.g. INT→VARCHAR), use raw SQL pool.getConnection() for writes to avoid type cast errors.
---

## Rule
If a column's DB type differs from the Drizzle schema definition, bypass Drizzle ORM for INSERT/UPDATE on that column using raw SQL via `pool.getConnection()`.

```ts
const conn = await pool.getConnection();
try {
  await conn.execute("INSERT INTO offices (...) VALUES (...)", [...values]);
} finally { conn.release(); }
```

**Why:** Drizzle will try to cast values to the schema type. If the actual DB column was altered (e.g. `wilaya_number` changed from INT to VARCHAR(10) to support values like "48.1"), Drizzle's int schema still tries to coerce the value, which may truncate or error.

**How to apply:** In `artifacts/api-server/src/routes/admin.ts`, the POST `/admin/offices` and PATCH `/admin/offices/:id` routes use raw SQL for this reason. Keep the Drizzle schema as-is for SELECT queries — they still work fine.
