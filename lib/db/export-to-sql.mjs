import mysql from "mysql2/promise";
import fs from "node:fs";

const OLD_DB = {
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
};

const TABLES = [
  "admins",
  "partners",
  "offices",
  "orders",
  "charges",
  "payouts",
  "office_reports",
];

const DDL = `-- ============================================================
--  Weasy Express — full schema + data export
--  Run this in phpMyAdmin on the NEW database
-- ============================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

-- ── admins ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`admins\` (
  \`id\`            INT          NOT NULL AUTO_INCREMENT,
  \`username\`      VARCHAR(100) NOT NULL,
  \`password_hash\` VARCHAR(255) NOT NULL,
  \`role\`          VARCHAR(20)  NOT NULL DEFAULT 'admin',
  \`created_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── partners ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`partners\` (
  \`id\`                INT          NOT NULL AUTO_INCREMENT,
  \`first_name\`        VARCHAR(100) NOT NULL,
  \`last_name\`         VARCHAR(100) NOT NULL,
  \`email\`             VARCHAR(200) NOT NULL,
  \`password\`          VARCHAR(200),
  \`phone\`             VARCHAR(50)  NOT NULL,
  \`address\`           TEXT         NOT NULL,
  \`city\`              VARCHAR(100) NOT NULL,
  \`parcels_per_month\` VARCHAR(50)  NOT NULL,
  \`status\`            VARCHAR(20)  NOT NULL DEFAULT 'pending',
  \`notes\`             TEXT,
  \`created_at\`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── offices ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`offices\` (
  \`id\`            INT          NOT NULL AUTO_INCREMENT,
  \`wilaya_number\` INT          NOT NULL,
  \`wilaya\`        VARCHAR(100) NOT NULL,
  \`commune\`       VARCHAR(100),
  \`address\`       TEXT         NOT NULL,
  \`phone\`         VARCHAR(50),
  \`maps_url\`      TEXT         NOT NULL,
  \`is_principal\`  TINYINT(1)   NOT NULL DEFAULT 0,
  \`created_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── orders ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`orders\` (
  \`id\`                      INT         NOT NULL AUTO_INCREMENT,
  \`tracking_number\`         VARCHAR(100),
  \`status\`                  VARCHAR(20) NOT NULL DEFAULT 'pending',
  \`sender_name\`             VARCHAR(100),
  \`recipient_name\`          VARCHAR(100),
  \`destination_wilaya_code\` VARCHAR(10),
  \`destination_wilaya\`      VARCHAR(100),
  \`origin_wilaya_code\`      VARCHAR(10),
  \`origin_wilaya\`           VARCHAR(100),
  \`created_at\`              TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`              TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── charges ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`charges\` (
  \`id\`          INT         NOT NULL AUTO_INCREMENT,
  \`category\`    VARCHAR(50) NOT NULL,
  \`amount_dzd\`  INT         NOT NULL DEFAULT 0,
  \`description\` TEXT,
  \`charge_date\` VARCHAR(10) NOT NULL,
  \`created_at\`  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── payouts ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`payouts\` (
  \`id\`          INT         NOT NULL AUTO_INCREMENT,
  \`category\`    VARCHAR(50) NOT NULL DEFAULT 'general',
  \`amount_dzd\`  INT         NOT NULL DEFAULT 0,
  \`method\`      VARCHAR(50) DEFAULT 'virement',
  \`reference\`   VARCHAR(100),
  \`notes\`       TEXT,
  \`payout_date\` VARCHAR(10) NOT NULL,
  \`created_at\`  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── office_reports ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS \`office_reports\` (
  \`id\`                  INT          NOT NULL AUTO_INCREMENT,
  \`report_type\`         VARCHAR(30)  NOT NULL,
  \`file_name\`           VARCHAR(255) NOT NULL,
  \`report_date\`         VARCHAR(10)  NOT NULL,
  \`total_parcels\`       INT          NOT NULL DEFAULT 0,
  \`total_amount_dzd\`    INT          NOT NULL DEFAULT 0,
  \`net_amount_dzd\`      INT          NOT NULL DEFAULT 0,
  \`frais_livraison_dzd\` INT          NOT NULL DEFAULT 0,
  \`station\`             VARCHAR(255),
  \`sender_name\`         VARCHAR(255),
  \`tracking_numbers\`    TEXT,
  \`wilayas\`             TEXT,
  \`uploaded_by\`         VARCHAR(100),
  \`created_at\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

`;

function escapeValue(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace("T", " ")}'`;
  const str = String(val);
  return "'" + str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r") + "'";
}

async function main() {
  console.log("🔌  Connecting to old DB…");
  const conn = await mysql.createConnection(OLD_DB);
  console.log(`✅  Connected to ${OLD_DB.host} / ${OLD_DB.database}`);

  let sql = DDL;
  let totalRows = 0;

  for (const table of TABLES) {
    const [rows] = await conn.query(`SELECT * FROM \`${table}\``);
    console.log(`  📋  ${table}: ${rows.length} rows`);
    totalRows += rows.length;

    sql += `-- ── ${table} data ──\n`;

    if (rows.length === 0) {
      sql += `-- (empty)\n\n`;
      continue;
    }

    // Truncate first so re-running is safe
    sql += `TRUNCATE TABLE \`${table}\`;\n`;

    const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(", ");

    // Batch into groups of 50 rows per INSERT for phpMyAdmin compatibility
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const valuesList = chunk.map(row =>
        `(${Object.values(row).map(escapeValue).join(", ")})`
      ).join(",\n  ");
      sql += `INSERT INTO \`${table}\` (${cols}) VALUES\n  ${valuesList};\n`;
    }
    sql += "\n";
  }

  sql += "SET foreign_key_checks = 1;\n\n-- ✅ Migration complete\n";

  await conn.end();

  const outPath = "weasy-express-migration.sql";
  fs.writeFileSync(outPath, sql, "utf8");

  const sizeKb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`\n✅  SQL file written: ${outPath}  (${sizeKb} KB, ${totalRows} total rows)`);
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
