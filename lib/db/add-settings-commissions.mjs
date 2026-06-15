import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS ?? "",
  port: parseInt(process.env.DB_PORT ?? "3306", 10),
});

try {
  console.log("Running settings & commissions migration...");

  await conn.execute(`CREATE TABLE IF NOT EXISTS charge_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cat_key VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(20) DEFAULT '📋',
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("charge_categories table ready");

  await conn.execute(`INSERT IGNORE INTO charge_categories (cat_key, name, icon, sort_order) VALUES
    ('marketing','Marketing','📣',1),
    ('hr','RH','👥',2),
    ('it','IT','💻',3),
    ('packaging','Emballage','📦',4),
    ('cod','COD','💰',5),
    ('warehouse','Entrepôt','🏭',6),
    ('various','Divers','📋',7)`);
  console.log("Default categories inserted");

  await conn.execute(`CREATE TABLE IF NOT EXISTS wilaya_commission_rates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wilaya_name VARCHAR(100) NOT NULL,
    wilaya_number VARCHAR(10) DEFAULT NULL,
    rate_dzd DECIMAL(10,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_wilaya (wilaya_name)
  )`);
  console.log("wilaya_commission_rates table ready");

  await conn.execute(`CREATE TABLE IF NOT EXISTS commission_uploads (
    id INT AUTO_INCREMENT PRIMARY KEY,
    uploaded_by VARCHAR(100),
    file_name VARCHAR(255),
    period_label VARCHAR(100),
    results_json MEDIUMTEXT,
    total_commissions DECIMAL(12,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
  console.log("commission_uploads table ready");

  try {
    await conn.execute(`ALTER TABLE offices MODIFY COLUMN wilaya_number VARCHAR(10) NOT NULL DEFAULT ''`);
    console.log("offices.wilaya_number changed to VARCHAR(10)");
  } catch (e) {
    console.log("offices.wilaya_number already changed:", e.message);
  }

  console.log("Migration complete.");
} finally {
  await conn.end();
}
