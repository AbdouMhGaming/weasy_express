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
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS workers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        worker_id VARCHAR(50) NOT NULL DEFAULT '',
        phone VARCHAR(50) NOT NULL DEFAULT '',
        nin VARCHAR(50) NOT NULL DEFAULT '',
        position VARCHAR(100) NOT NULL DEFAULT '',
        hub VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("✅ workers table OK");

    await conn.execute(`
      CREATE TABLE IF NOT EXISTS decharges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        worker_db_id INT NOT NULL,
        worker_first_name VARCHAR(100) NOT NULL DEFAULT '',
        worker_last_name VARCHAR(100) NOT NULL DEFAULT '',
        worker_position VARCHAR(100) NOT NULL DEFAULT '',
        worker_id_card VARCHAR(50) NOT NULL DEFAULT '',
        worker_phone VARCHAR(50) NOT NULL DEFAULT '',
        worker_nin VARCHAR(50) NOT NULL DEFAULT '',
        worker_hub VARCHAR(100) NOT NULL DEFAULT '',
        recu_number VARCHAR(50) NOT NULL,
        salaire_fixe DECIMAL(12,2) NOT NULL DEFAULT 0,
        primes DECIMAL(12,2) NOT NULL DEFAULT 0,
        montant_net DECIMAL(12,2) NOT NULL DEFAULT 0,
        period_label VARCHAR(50) NOT NULL DEFAULT '',
        created_by VARCHAR(100) NOT NULL DEFAULT '',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("✅ decharges table OK");

    // Seed app_settings keys if not exists
    await conn.execute(
      "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)",
      ["worker_positions", JSON.stringify(["Livreur", "Agent Bureau", "Superviseur", "Caissier", "Chauffeur", "Manutentionnaire"])]
    );
    await conn.execute(
      "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES (?, ?)",
      ["decharge_counter", "0"]
    );
    console.log("✅ app_settings seeds OK");
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(e => { console.error("❌", e.message); process.exit(1); });
