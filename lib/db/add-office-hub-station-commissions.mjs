import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: process.env.DB_HOST !== "localhost" ? { rejectUnauthorized: false } : undefined,
});

async function run() {
  const conn = await pool.getConnection();
  try {
    // Add office_hub column to admins table (ignore if already exists)
    try {
      await conn.execute(
        "ALTER TABLE admins ADD COLUMN office_hub VARCHAR(200) NOT NULL DEFAULT ''"
      );
      console.log("✅ office_hub column added to admins");
    } catch (e) {
      if (e.code === "ER_DUP_FIELDNAME") {
        console.log("ℹ️  office_hub already exists in admins");
      } else throw e;
    }

    // Create station_commissions table
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS station_commissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        hub_name VARCHAR(200) NOT NULL DEFAULT '',
        hub_phone VARCHAR(50) NOT NULL DEFAULT '',
        agent_name VARCHAR(200) NOT NULL DEFAULT '',
        recu_number VARCHAR(50) NOT NULL,
        nb_colis INT NOT NULL DEFAULT 0,
        bonus_retour DECIMAL(12,2) NOT NULL DEFAULT 0,
        montant_net DECIMAL(12,2) NOT NULL DEFAULT 0,
        period_label VARCHAR(50) NOT NULL DEFAULT '',
        created_by VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("✅ station_commissions table OK");

    // Seed counter key
    await conn.execute(
      "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)",
      ["station_comm_counter", "0"]
    );
    console.log("✅ station_comm_counter seed OK");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(e => { console.error("❌", e.message); process.exit(1); });
