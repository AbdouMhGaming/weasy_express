/**
 * Adds Expéditeur features:
 * - phone, email, parent_id, permissions columns to admins
 * - expediteur_payouts table
 * - recipient_office column to tickets
 *
 * Run: cd lib/db && node add-expediteur-features.mjs
 */
import mysql from "mysql2/promise";
import process from "node:process";
import { randomBytes } from "node:crypto";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
});

async function addColumnIfMissing(table, col, definition) {
  const [rows] = await conn.execute(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, col]
  );
  if (rows.length === 0) {
    await conn.execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${definition}`);
    console.log(`✅ ${table}.${col} added`);
  } else {
    console.log(`⏭ ${table}.${col} already exists`);
  }
}

// ── admins: new columns ──────────────────────────────────────────────────────
await addColumnIfMissing("admins", "phone",       "VARCHAR(20) NULL AFTER role");
await addColumnIfMissing("admins", "email",       "VARCHAR(100) NULL AFTER phone");
await addColumnIfMissing("admins", "parent_id",   "INT NULL AFTER email");
await addColumnIfMissing("admins", "permissions", "TEXT NULL AFTER parent_id");

// ── tickets: recipient_office for pickup_desk ────────────────────────────────
await addColumnIfMissing("tickets", "recipient_office", "VARCHAR(200) NULL AFTER recipient_username");

// ── expediteur_payouts ───────────────────────────────────────────────────────
await conn.execute(`
  CREATE TABLE IF NOT EXISTS expediteur_payouts (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    expediteur_username VARCHAR(100) NOT NULL,
    office_hub          VARCHAR(200) NOT NULL,
    amount_dzd          INT NOT NULL DEFAULT 0,
    requested_date      VARCHAR(10) NOT NULL,
    status              ENUM('pending','accepted','refused','delayed','paid') NOT NULL DEFAULT 'pending',
    expediteur_notes    TEXT NULL,
    client_address      VARCHAR(500) NULL,
    admin_notes         TEXT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    confirmation_token  VARCHAR(128) NULL,
    receipt_number      VARCHAR(32) NULL,
    approved_at         TIMESTAMP NULL,
    paid_at             TIMESTAMP NULL,
    INDEX idx_ep_exp    (expediteur_username),
    INDEX idx_ep_office (office_hub),
    INDEX idx_ep_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
await addColumnIfMissing("expediteur_payouts", "confirmation_token", "VARCHAR(128) NULL");
await addColumnIfMissing("expediteur_payouts", "receipt_number", "VARCHAR(32) NULL");
await addColumnIfMissing("expediteur_payouts", "approved_at", "TIMESTAMP NULL");
await addColumnIfMissing("expediteur_payouts", "paid_at", "TIMESTAMP NULL");
await addColumnIfMissing("expediteur_payouts", "client_address", "VARCHAR(500) NULL");
// Previously approved requests should also have a printable, scannable receipt.
const [unconfirmed] = await conn.execute(
  "SELECT id FROM expediteur_payouts WHERE status='accepted' AND confirmation_token IS NULL"
);
for (const row of unconfirmed) {
  await conn.execute(
    "UPDATE expediteur_payouts SET confirmation_token=?, receipt_number=COALESCE(receipt_number, ?), approved_at=COALESCE(approved_at, updated_at) WHERE id=? AND status='accepted' AND confirmation_token IS NULL",
    [randomBytes(32).toString("base64url"), `PV${String(row.id).padStart(8, "0")}`, row.id]
  );
}
console.log("✅ expediteur_payouts table OK");

await conn.end();
