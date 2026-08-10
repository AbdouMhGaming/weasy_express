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
    CREATE TABLE IF NOT EXISTS \`tickets\` (
      \`id\`                  INT          NOT NULL AUTO_INCREMENT,
      \`ticket_ref\`          VARCHAR(20)  NOT NULL,
      \`destination_type\`    VARCHAR(30)  NOT NULL,
      \`recipient_username\`  VARCHAR(100) NULL,
      \`support_service\`     VARCHAR(255) NULL,
      \`reason\`              VARCHAR(500) NOT NULL,
      \`custom_reason\`       VARCHAR(500) NULL,
      \`comment\`             TEXT         NULL,
      \`parcel_numbers\`      TEXT         NULL,
      \`status\`              VARCHAR(30)  NOT NULL DEFAULT 'open',
      \`handled_by\`          VARCHAR(100) NULL,
      \`created_by\`          VARCHAR(100) NOT NULL,
      \`created_at\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\`          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`ticket_ref\` (\`ticket_ref\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ tickets table OK");

  await conn.execute(
    "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('ticket_counter', '0')"
  );
  console.log("✅ ticket_counter initialized");

  // Also ensure ticket_reasons and support_services settings keys exist
  await conn.execute(
    "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('ticket_reasons', '[]')"
  );
  await conn.execute(
    "INSERT IGNORE INTO app_settings (setting_key, setting_value) VALUES ('support_services', '[]')"
  );
  console.log("✅ ticket settings keys initialized");
} finally {
  await conn.end();
}
