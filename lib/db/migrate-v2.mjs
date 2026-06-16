/**
 * DB migration v2 — run from lib/db directory:
 *   cd lib/db && node migrate-v2.mjs
 *
 * Changes:
 * 1. charge_categories: add parent_id column (for sub-categories)
 * 2. wilaya_commission_rates: rename rate_dzd → classic_stop_desk_dzd, add 3 more rate columns
 * 3. office_commission_rates: same 4-column expansion
 */

import mysql from "mysql2/promise";

const pool = await mysql.createPool({
  host:     process.env.DB_HOST     ?? "localhost",
  database: process.env.DB_NAME     ?? "weasy",
  user:     process.env.DB_USER     ?? "root",
  password: process.env.DB_PASS     ?? "",
  port:     parseInt(process.env.DB_PORT ?? "3306", 10),
  waitForConnections: true,
  connectionLimit: 3,
});

const conn = await pool.getConnection();

try {
  // ── 1. charge_categories: add parent_id ──────────────────────────────────────
  const [cols0] = await conn.execute(
    "SHOW COLUMNS FROM charge_categories LIKE 'parent_id'"
  );
  if (cols0.length === 0) {
    await conn.execute(
      "ALTER TABLE charge_categories ADD COLUMN parent_id INT NULL DEFAULT NULL"
    );
    console.log("✓ charge_categories.parent_id added");
  } else {
    console.log("· charge_categories.parent_id already exists, skipping");
  }

  // ── 2. wilaya_commission_rates: expand to 4 rate columns ─────────────────────
  const [cols1] = await conn.execute(
    "SHOW COLUMNS FROM wilaya_commission_rates LIKE 'classic_stop_desk_dzd'"
  );
  if (cols1.length === 0) {
    // Rename existing rate_dzd → classic_stop_desk_dzd
    await conn.execute(
      "ALTER TABLE wilaya_commission_rates CHANGE COLUMN rate_dzd classic_stop_desk_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await conn.execute(
      "ALTER TABLE wilaya_commission_rates ADD COLUMN classic_domicile_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await conn.execute(
      "ALTER TABLE wilaya_commission_rates ADD COLUMN ecommerce_stop_desk_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await conn.execute(
      "ALTER TABLE wilaya_commission_rates ADD COLUMN ecommerce_domicile_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    console.log("✓ wilaya_commission_rates expanded to 4 rate columns");
  } else {
    console.log("· wilaya_commission_rates already has 4 columns, skipping");
  }

  // ── 3. office_commission_rates: expand to 4 rate columns ─────────────────────
  const [cols2] = await conn.execute(
    "SHOW COLUMNS FROM office_commission_rates LIKE 'classic_stop_desk_dzd'"
  );
  if (cols2.length === 0) {
    await conn.execute(
      "ALTER TABLE office_commission_rates CHANGE COLUMN rate_dzd classic_stop_desk_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await conn.execute(
      "ALTER TABLE office_commission_rates ADD COLUMN classic_domicile_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await conn.execute(
      "ALTER TABLE office_commission_rates ADD COLUMN ecommerce_stop_desk_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    await conn.execute(
      "ALTER TABLE office_commission_rates ADD COLUMN ecommerce_domicile_dzd DECIMAL(10,2) NOT NULL DEFAULT 0"
    );
    console.log("✓ office_commission_rates expanded to 4 rate columns");
  } else {
    console.log("· office_commission_rates already has 4 columns, skipping");
  }

  console.log("\nMigration v2 complete.");
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  conn.release();
  await pool.end();
}
