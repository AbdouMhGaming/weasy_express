// Creates the commission_sp table for Stop Desk commissions.
// Run with: cd lib/db && node add-commission-sp.mjs

import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from repo root if present
try {
  const envPath = resolve(__dirname, "../../.env");
  const env = readFileSync(envPath, "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {}

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: process.env.DB_HOST?.includes("hostinger") ? { rejectUnauthorized: false } : undefined,
});

const conn = await pool.getConnection();
try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS commission_sp (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      office_name VARCHAR(255) NOT NULL,
      sp_count    INT          NOT NULL DEFAULT 0,
      commission_dzd DECIMAL(10,2) NOT NULL DEFAULT 0,
      sp_date     DATE         NOT NULL,
      uploaded_by VARCHAR(100) DEFAULT '',
      created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ commission_sp table ready.");
} finally {
  conn.release();
  await pool.end();
}
