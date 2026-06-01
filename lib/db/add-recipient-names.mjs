import mysql from "mysql2/promise";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let env = {};
try {
  const raw = readFileSync(resolve(__dirname, "../../.env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
} catch {}

const conn = await mysql.createConnection({
  host: process.env.DB_HOST || env.DB_HOST,
  user: process.env.DB_USER || env.DB_USER,
  password: process.env.DB_PASS || env.DB_PASS,
  database: process.env.DB_NAME || env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

try {
  await conn.execute(
    "ALTER TABLE office_reports ADD COLUMN recipient_names TEXT NULL AFTER tracking_numbers"
  );
  console.log("✅ Added recipient_names column to office_reports");
} catch (err) {
  if (err.code === "ER_DUP_FIELDNAME") {
    console.log("ℹ️  Column recipient_names already exists, skipping.");
  } else {
    console.error("❌ Migration failed:", err.message);
    process.exit(1);
  }
} finally {
  await conn.end();
}
