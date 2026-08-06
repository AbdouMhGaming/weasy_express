import mysql from "mysql2/promise";

// ─── Connection configs ────────────────────────────────────────────────────
const OLD_DB = {
  host:     process.env.DB_HOST,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
};

const NEW_DB = {
  host:     process.env.DB_HOST_2,
  user:     process.env.DB_USER_2,
  password: process.env.DB_PASS_2,
  database: process.env.DB_NAME_2,
  ssl: { rejectUnauthorized: false },
};

// ─── DDL: create all tables on the new DB ────────────────────────────────
const DDL = `
CREATE TABLE IF NOT EXISTS \`admins\` (
  \`id\`            INT          NOT NULL AUTO_INCREMENT,
  \`username\`      VARCHAR(100) NOT NULL,
  \`password_hash\` VARCHAR(255) NOT NULL,
  \`role\`          VARCHAR(20)  NOT NULL DEFAULT 'admin',
  \`created_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS \`charges\` (
  \`id\`          INT         NOT NULL AUTO_INCREMENT,
  \`category\`    VARCHAR(50) NOT NULL,
  \`amount_dzd\`  INT         NOT NULL DEFAULT 0,
  \`description\` TEXT,
  \`charge_date\` VARCHAR(10) NOT NULL,
  \`created_at\`  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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

CREATE TABLE IF NOT EXISTS \`office_reports\` (
  \`id\`                  INT          NOT NULL AUTO_INCREMENT,
  \`report_type\`         VARCHAR(30)  NOT NULL,
  \`file_name\`           VARCHAR(255) NOT NULL,
  \`report_date\`         VARCHAR(10)  NOT NULL,
  \`total_parcels\`       INT          NOT NULL DEFAULT 0,
  \`total_amount_dzd\`    BIGINT       NOT NULL DEFAULT 0,
  \`net_amount_dzd\`      BIGINT       NOT NULL DEFAULT 0,
  \`frais_livraison_dzd\` BIGINT       NOT NULL DEFAULT 0,
  \`station\`             VARCHAR(255),
  \`sender_name\`         VARCHAR(255),
  \`tracking_numbers\`    TEXT,
  \`recipient_names\`     TEXT,
  \`per_order_senders\`   TEXT,
  \`recipient_phones\`    TEXT,
  \`wilayas\`             TEXT,
  \`order_wilayas\`       TEXT,
  \`uploaded_by\`         VARCHAR(100),
  \`file_data\`           MEDIUMBLOB,
  \`created_at\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`wilaya_commission_rates\` (
  \`id\`            INT          NOT NULL AUTO_INCREMENT,
  \`wilaya_name\`   VARCHAR(100) NOT NULL,
  \`wilaya_number\` VARCHAR(10),
  \`rate_dzd\`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  \`created_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_wilaya_name\` (\`wilaya_name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`office_commission_rates\` (
  \`id\`            INT          NOT NULL AUTO_INCREMENT,
  \`office_name\`   VARCHAR(200) NOT NULL,
  \`wilaya_name\`   VARCHAR(100) NOT NULL,
  \`wilaya_number\` VARCHAR(10),
  \`rate_dzd\`      DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  \`created_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_office_wilaya\` (\`office_name\`, \`wilaya_name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`commission_uploads\` (
  \`id\`                INT          NOT NULL AUTO_INCREMENT,
  \`uploaded_by\`       VARCHAR(100) NOT NULL,
  \`file_name\`         VARCHAR(255) NOT NULL,
  \`period_label\`      VARCHAR(200) NOT NULL,
  \`results_json\`      MEDIUMTEXT,
  \`total_commissions\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  \`xlsx_file\`         VARCHAR(255),
  \`created_at\`        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS \`charge_categories\` (
  \`id\`         INT          NOT NULL AUTO_INCREMENT,
  \`name\`       VARCHAR(100) NOT NULL,
  \`icon\`       VARCHAR(50)  NOT NULL DEFAULT 'box',
  \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_name\` (\`name\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

// ─── Tables to copy — in dependency order (no FKs here, so any order works) 
const TABLES = [
  "admins",
  "partners",
  "offices",
  "orders",
  "charges",
  "payouts",
  "office_reports",
  "wilaya_commission_rates",
  "office_commission_rates",
  "commission_uploads",
  "charge_categories",
];

// ─── Helpers ──────────────────────────────────────────────────────────────
function ok(msg)   { console.log(`  ✅  ${msg}`); }
function info(msg) { console.log(`  ℹ️   ${msg}`); }
function err(msg)  { console.error(`  ❌  ${msg}`); }

async function copyTable(srcConn, dstConn, table) {
  const [rows] = await srcConn.query(`SELECT * FROM \`${table}\``);
  if (rows.length === 0) {
    info(`${table}: 0 rows — skipping`);
    return;
  }

  // Build INSERT with all columns from the first row
  const cols = Object.keys(rows[0]).map(c => `\`${c}\``).join(", ");
  const placeholders = Object.keys(rows[0]).map(() => "?").join(", ");
  const sql = `INSERT INTO \`${table}\` (${cols}) VALUES (${placeholders})`;

  // Disable FK checks and insert in chunks
  await dstConn.query("SET foreign_key_checks = 0");
  await dstConn.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`);

  let inserted = 0;
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    for (const row of chunk) {
      await dstConn.query(sql, Object.values(row));
      inserted++;
    }
  }
  await dstConn.query("SET foreign_key_checks = 1");
  ok(`${table}: ${inserted} row${inserted !== 1 ? "s" : ""} copied`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔌  Connecting to databases…");

  const src = await mysql.createConnection(OLD_DB);
  ok(`Old DB connected  (${OLD_DB.host} / ${OLD_DB.database})`);

  const dst = await mysql.createConnection(NEW_DB);
  ok(`New DB connected  (${NEW_DB.host} / ${NEW_DB.database})`);

  // ── Step 1: create tables ──
  console.log("\n📐  Creating tables on new DB…");
  for (const stmt of DDL.split(";").map(s => s.trim()).filter(Boolean)) {
    await dst.query(stmt);
  }
  ok("All 11 tables created (IF NOT EXISTS)");

  // ── Step 2: check existing data on new DB ──
  console.log("\n📋  Checking existing row counts on new DB…");
  let hasExistingData = false;
  for (const table of TABLES) {
    const [[{ cnt }]] = await dst.query(`SELECT COUNT(*) AS cnt FROM \`${table}\``);
    if (cnt > 0) {
      info(`${table}: already has ${cnt} rows on new DB`);
      hasExistingData = true;
    }
  }

  if (hasExistingData) {
    console.log("\n⚠️   New DB already has data. Truncating all tables before copy…");
    await dst.query("SET foreign_key_checks = 0");
    for (const table of TABLES) {
      await dst.query(`TRUNCATE TABLE \`${table}\``);
      info(`${table} truncated`);
    }
    await dst.query("SET foreign_key_checks = 1");
  }

  // ── Step 3: copy data ──
  console.log("\n📦  Copying data from old → new DB…");
  for (const table of TABLES) {
    try {
      await copyTable(src, dst, table);
    } catch (e) {
      err(`${table}: ${e.message}`);
    }
  }

  // ── Step 4: verify counts match ──
  console.log("\n🔍  Verifying row counts…");
  let allMatch = true;
  for (const table of TABLES) {
    const [[{ old_cnt }]] = await src.query(`SELECT COUNT(*) AS old_cnt FROM \`${table}\``);
    const [[{ new_cnt }]] = await dst.query(`SELECT COUNT(*) AS new_cnt FROM \`${table}\``);
    const match = old_cnt === new_cnt;
    if (match) {
      ok(`${table}: ${old_cnt} rows ✓`);
    } else {
      err(`${table}: old=${old_cnt}  new=${new_cnt}  MISMATCH`);
      allMatch = false;
    }
  }

  await src.end();
  await dst.end();

  console.log(allMatch
    ? "\n✅  Migration complete — all tables match.\n"
    : "\n⚠️   Migration finished with mismatches — check errors above.\n"
  );

  if (!allMatch) process.exit(1);
}

main().catch(e => { err(e.message); process.exit(1); });
