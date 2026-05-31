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
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS charges (
      id INT PRIMARY KEY AUTO_INCREMENT,
      category VARCHAR(50) NOT NULL,
      amount_dzd BIGINT NOT NULL DEFAULT 0,
      description TEXT,
      charge_date VARCHAR(10) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ charges table ready");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS payouts (
      id INT PRIMARY KEY AUTO_INCREMENT,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      amount_dzd BIGINT NOT NULL DEFAULT 0,
      method VARCHAR(50) DEFAULT 'virement',
      reference VARCHAR(100),
      notes TEXT,
      payout_date VARCHAR(10) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ payouts table ready");

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS office_reports (
      id INT PRIMARY KEY AUTO_INCREMENT,
      report_type VARCHAR(30) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      report_date VARCHAR(10) NOT NULL,
      total_parcels INT NOT NULL DEFAULT 0,
      total_amount_dzd BIGINT NOT NULL DEFAULT 0,
      net_amount_dzd BIGINT NOT NULL DEFAULT 0,
      station VARCHAR(255),
      sender_name VARCHAR(255),
      tracking_numbers TEXT,
      wilayas TEXT,
      uploaded_by VARCHAR(100),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("✅ office_reports table ready");

  console.log("\n✅ All tables ready");
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
} finally {
  conn.release();
  await pool.end();
}
