import mysql from "mysql2/promise";
import process from "node:process";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

try {
  // Create table with varchar(500) endpoint so MySQL can create a full unique index
  // without a prefix. varchar(500) in utf8mb4 = 2000 bytes, well within the
  // innodb_large_prefix limit of 3072 bytes available in MySQL 5.7+.
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`push_subscriptions\` (
      \`id\`         INT          NOT NULL AUTO_INCREMENT,
      \`username\`   VARCHAR(100) NOT NULL,
      \`endpoint\`   VARCHAR(500) NOT NULL,
      \`p256dh\`     VARCHAR(255) NOT NULL,
      \`auth\`       VARCHAR(255) NOT NULL,
      \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`endpoint_key\` (\`endpoint\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ push_subscriptions table OK");

  // Safe deduplication: if the table already existed with text + prefix unique key,
  // deduplicate any duplicate endpoints (keeping the most recently created row)
  // before attempting to add/alter the unique key.
  await conn.execute(`
    DELETE ps1 FROM push_subscriptions ps1
    INNER JOIN push_subscriptions ps2
    WHERE ps1.endpoint = ps2.endpoint AND ps1.id < ps2.id
  `);
  console.log("✅ push_subscriptions deduplication OK");
} finally {
  await conn.end();
}
