import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS ?? "",
  port: parseInt(process.env.DB_PORT ?? "3306", 10),
});

const conn = await pool.getConnection();
try {
  try {
    await conn.execute(
      `ALTER TABLE office_reports ADD COLUMN frais_livraison_dzd BIGINT NOT NULL DEFAULT 0`
    );
    console.log("✅ frais_livraison_dzd column added");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log("ℹ️  frais_livraison_dzd column already exists");
    } else {
      throw err;
    }
  }
  console.log("\n✅ Migration complete");
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
} finally {
  conn.release();
  await pool.end();
}
