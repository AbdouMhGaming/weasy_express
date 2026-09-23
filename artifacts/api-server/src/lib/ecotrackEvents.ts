import { pool } from "@workspace/db";

/** Local audit/notification storage. All statements are MySQL-safe and idempotent. */
export async function ensureEcotrackEventsStorage() {
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS expediteur_ecotrack_remarks (
        id BIGINT NOT NULL AUTO_INCREMENT,
        expediteur_id INT NOT NULL,
        tracking VARCHAR(255) NOT NULL,
        author_username VARCHAR(100) NOT NULL,
        author_role VARCHAR(40) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY ix_ecotrack_remarks_order (expediteur_id, tracking, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS expediteur_ecotrack_notifications (
        id BIGINT NOT NULL AUTO_INCREMENT,
        expediteur_id INT NOT NULL,
        tracking VARCHAR(255) NOT NULL,
        event_type VARCHAR(40) NOT NULL,
        event_key VARCHAR(255) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NULL,
        author_username VARCHAR(100) NULL,
        author_role VARCHAR(40) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_ecotrack_notification_event (expediteur_id, tracking, event_type, event_key),
        KEY ix_ecotrack_notification_scope (expediteur_id, created_at, read_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS expediteur_ecotrack_notification_reads (
        notification_id BIGINT NOT NULL,
        reader_username VARCHAR(100) NOT NULL,
        reader_audience VARCHAR(40) NOT NULL,
        read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notification_id, reader_username, reader_audience),
        KEY ix_ecotrack_notification_reader (reader_username, reader_audience, read_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } finally {
    conn.release();
  }
}

export async function recordRemark(input: {
  expediteurId: number; tracking: string; authorUsername: string; authorRole: string; content: string;
}) {
  const conn = await pool.getConnection();
  try {
    const [remark] = await conn.execute(
      `INSERT INTO expediteur_ecotrack_remarks
       (expediteur_id, tracking, author_username, author_role, content)
       VALUES (?, ?, ?, ?, ?)`,
      [input.expediteurId, input.tracking, input.authorUsername, input.authorRole, input.content],
    ) as any;
    await conn.execute(
      `INSERT INTO expediteur_ecotrack_notifications
       (expediteur_id, tracking, event_type, event_key, title, body, author_username, author_role)
       VALUES (?, ?, 'remark', ?, ?, ?, ?, ?)`,
      [input.expediteurId, input.tracking, `remark:${remark.insertId}`, "New order remark", input.content,
        input.authorUsername, input.authorRole],
    );
    return Number(remark.insertId);
  } finally {
    conn.release();
  }
}

export async function recordSuspension(input: { expediteurId: number; tracking: string; occurredAt: string }) {
  const conn = await pool.getConnection();
  try {
    await conn.execute(
      `INSERT IGNORE INTO expediteur_ecotrack_notifications
       (expediteur_id, tracking, event_type, event_key, title, body)
       VALUES (?, ?, 'suspended', ?, 'Order suspended', 'Order status changed to suspended')`,
      [input.expediteurId, input.tracking, `suspended:${input.occurredAt}`],
    );
  } finally {
    conn.release();
  }
}