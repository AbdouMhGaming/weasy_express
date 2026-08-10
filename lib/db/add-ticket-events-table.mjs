/**
 * Adds ticket_events table (comments + status change audit log).
 * Run: cd lib/db && node add-ticket-events-table.mjs
 */

import mysql from "mysql2/promise";
import process from "node:process";

const pool = mysql.createPool({
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl:      { rejectUnauthorized: false },
});

const conn = await pool.getConnection();
try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS ticket_events (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      ticket_id     INT UNSIGNED NOT NULL,
      event_type    ENUM('comment','status_change','claim','unclaim') NOT NULL,
      actor         VARCHAR(100) NOT NULL,
      body          TEXT NULL,
      meta          VARCHAR(255) NULL,
      created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ticket_events_ticket (ticket_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ ticket_events table OK");
} finally {
  conn.release();
  await pool.end();
}
