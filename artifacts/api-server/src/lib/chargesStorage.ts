import { pool } from "@workspace/db";
import { logger } from "./logger";

/** Additive, idempotent schema migration for charge audit metadata. */
export async function ensureChargesStorage() {
  const conn = await pool.getConnection();
  try {
    const [tables] = await conn.execute(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charges'",
    ) as [Array<{ TABLE_NAME: string }>, unknown];
    if (tables.length === 0) return;

    const [columns] = await conn.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'charges' AND COLUMN_NAME = 'created_by'",
    ) as [Array<{ COLUMN_NAME: string }>, unknown];
    if (columns.length === 0) {
      await conn.execute("ALTER TABLE charges ADD COLUMN created_by VARCHAR(100) NULL");
    }
    logger.info("Charges audit metadata ready");
  } finally {
    conn.release();
  }
}