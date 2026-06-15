import mysql from "mysql2/promise";

async function migrate(config, label) {
  const conn = await mysql.createConnection({ ...config, ssl: { rejectUnauthorized: false } });
  console.log(`\n🔌  Connected to ${label}`);
  try {
    const [cols] = await conn.query("SHOW COLUMNS FROM `charges`");
    const existing = cols.map(c => c.Field);
    const toAdd = [
      { name: "type",            sql: "VARCHAR(10) NOT NULL DEFAULT 'outcome' AFTER `charge_date`" },
      { name: "attachment_name", sql: "VARCHAR(255) NULL AFTER `type`" },
      { name: "attachment_data", sql: "MEDIUMBLOB NULL AFTER `attachment_name`" },
    ];
    for (const col of toAdd) {
      if (existing.includes(col.name)) {
        console.log(`  ℹ️   \`${col.name}\` already exists — skipping`);
      } else {
        await conn.query(`ALTER TABLE \`charges\` ADD COLUMN \`${col.name}\` ${col.sql}`);
        console.log(`  ✅  Added \`${col.name}\``);
      }
    }
  } finally {
    await conn.end();
  }
}

await migrate({
  host: process.env.DB_HOST, user: process.env.DB_USER,
  password: process.env.DB_PASS, database: process.env.DB_NAME,
}, "OLD DB");

await migrate({
  host: process.env.DB_HOST_2, user: process.env.DB_USER_2,
  password: process.env.DB_PASS_2, database: process.env.DB_NAME_2,
}, "NEW DB");

console.log("\n✅  Done.\n");
