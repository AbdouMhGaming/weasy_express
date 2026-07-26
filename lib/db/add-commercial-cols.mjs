import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

try {
  const [cols] = await conn.execute("SHOW COLUMNS FROM admins LIKE 'allowed_partner_statuses'");
  if (cols.length === 0) {
    await conn.execute("ALTER TABLE admins ADD COLUMN allowed_partner_statuses VARCHAR(200) NULL DEFAULT NULL");
    console.log("✓ added allowed_partner_statuses");
  } else { console.log("  allowed_partner_statuses already exists"); }

  const [cols2] = await conn.execute("SHOW COLUMNS FROM admins LIKE 'can_change_partner_status'");
  if (cols2.length === 0) {
    await conn.execute("ALTER TABLE admins ADD COLUMN can_change_partner_status TINYINT(1) NOT NULL DEFAULT 0");
    console.log("✓ added can_change_partner_status");
  } else { console.log("  can_change_partner_status already exists"); }

  console.log("Done.");
} finally {
  await conn.end();
}
