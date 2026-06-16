import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS ?? "",
  port: parseInt(process.env.DB_PORT ?? "3306", 10),
});

const conn = await pool.getConnection();
try {
  // App-wide settings table (key-value store)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(100) NOT NULL,
      setting_value TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("✓ app_settings table ready");

  // Commission returns table (daily entries per office)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS commission_returns (
      id INT NOT NULL AUTO_INCREMENT,
      office_name VARCHAR(255) NOT NULL,
      return_count INT NOT NULL DEFAULT 0,
      deduction_dzd INT NOT NULL DEFAULT 0,
      return_date VARCHAR(10) NOT NULL,
      uploaded_by VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_office_date (office_name, return_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log("✓ commission_returns table ready");

  console.log("Done.");
} finally {
  conn.release();
  await pool.end();
}
