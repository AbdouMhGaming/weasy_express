import mysql from "mysql2/promise";
import process from "node:process";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST, user: process.env.DB_USER, password: process.env.DB_PASS,
  database: process.env.DB_NAME, ssl: { rejectUnauthorized: false },
});
await conn.execute(`
  CREATE TABLE IF NOT EXISTS expediteur_products (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    expediteur_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    sku VARCHAR(120) NULL,
    purchase_price DECIMAL(12,2) NULL,
    sale_price DECIMAL(12,2) NULL,
    barcode VARCHAR(120) NULL,
    external_id VARCHAR(120) NULL,
    brand VARCHAR(120) NULL,
    alert_min_stock DECIMAL(12,2) NULL,
    weight_kg DECIMAL(12,3) NULL,
    marketer_percentage DECIMAL(6,2) NULL,
    page_url VARCHAR(1000) NULL,
    description TEXT NULL,
    photo_data LONGBLOB NULL,
    photo_mime VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_expediteur_products_owner (expediteur_id),
    CONSTRAINT fk_expediteur_products_owner FOREIGN KEY (expediteur_id) REFERENCES admins(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`);
const [columns] = await conn.execute("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='expediteur_products'");
const names = new Set(columns.map((c) => c.COLUMN_NAME));
if (!names.has("photo_data")) await conn.execute("ALTER TABLE expediteur_products ADD COLUMN photo_data LONGBLOB NULL AFTER description");
console.log("expediteur_products table ready");
await conn.end();