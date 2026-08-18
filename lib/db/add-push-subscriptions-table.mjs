import mysql from "mysql2/promise";
import process from "node:process";

const conn = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

try {
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`push_subscriptions\` (
      \`id\`         INT          NOT NULL AUTO_INCREMENT,
      \`username\`   VARCHAR(100) NOT NULL,
      \`endpoint\`   TEXT         NOT NULL,
      \`p256dh\`     VARCHAR(255) NOT NULL,
      \`auth\`       VARCHAR(255) NOT NULL,
      \`created_at\` TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`endpoint_key\` (\`endpoint\`(255))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ push_subscriptions table OK");
} finally {
  await conn.end();
}
