import { Router } from "express";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";

const router = Router();

async function getHub(conn: any, username: string): Promise<string | null> {
  const [rows] = await conn.execute("SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]) as any;
  return rows[0]?.office_hub ?? null;
}

// ── GET /api/analytics ─────────────────────────────────────────────────────────
// Returns ticket + payout analytics scoped to the current user's role.

router.get("/analytics", adminAuth, async (req: AuthedRequest, res) => {
  const role         = req.adminRole!;
  const username     = req.adminUsername!;
  const dataUsername = req.adminDataUsername ?? username;
  const conn         = await pool.getConnection();

  try {
    // ── Build WHERE clause for tickets ──────────────────────────────────────
    let ticketWhere = "1=1";
    const ticketParams: any[] = [];

    if (role === "office") {
      const hub = await getHub(conn, dataUsername);
      if (hub) {
        ticketWhere = "(created_by = ? OR (destination_type = 'pickup_desk' AND recipient_office = ?))";
        ticketParams.push(dataUsername, hub);
      } else {
        ticketWhere = "created_by = ?";
        ticketParams.push(dataUsername);
      }
    } else if (role === "expediteur") {
      ticketWhere = "(created_by = ? OR (destination_type = 'merchant' AND recipient_username = ?))";
      ticketParams.push(dataUsername, dataUsername);
    } else if (role !== "admin") {
      // other roles get nothing
      return res.json({ ok: true, tickets: null, payouts: null });
    }

    // ── Build WHERE clause for payouts ───────────────────────────────────────
    let payoutWhere = "1=1";
    const payoutParams: any[] = [];

    if (role === "office") {
      const hub = await getHub(conn, dataUsername);
      if (hub) {
        payoutWhere = "office_hub = ?";
        payoutParams.push(hub);
      } else {
        payoutWhere = "1=0";
      }
    } else if (role === "expediteur") {
      payoutWhere = "expediteur_username = ?";
      payoutParams.push(dataUsername);
    }
    // admin: all payouts (no filter)

    // ── Ticket aggregate stats ───────────────────────────────────────────────
    const [ticketStats] = await conn.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(status = 'open')           AS open_count,
         SUM(status = 'claimed')        AS claimed,
         SUM(status = 'in_progress')    AS in_progress,
         SUM(status = 'resolved')       AS resolved,
         SUM(status = 'pending_close')  AS pending_close,
         SUM(status = 'pending_accept') AS pending_accept,
         SUM(status = 'closed')         AS closed_count,
         SUM(destination_type = 'merchant')    AS dest_merchant,
         SUM(destination_type = 'central_team') AS dest_central,
         SUM(destination_type = 'pickup_desk')  AS dest_pickup,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))  AS this_week,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS this_month
       FROM tickets WHERE ${ticketWhere}`,
      ticketParams
    ) as any;

    // ── Ticket daily trend (last 14 days) ────────────────────────────────────
    const [ticketTrend] = await conn.execute(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM tickets
       WHERE ${ticketWhere} AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       GROUP BY day ORDER BY day ASC`,
      ticketParams
    ) as any;

    // ── Top ticket reasons (last 30 days) ────────────────────────────────────
    const [topReasons] = await conn.execute(
      `SELECT
         CASE WHEN reason = 'other' AND custom_reason IS NOT NULL AND custom_reason != ''
              THEN custom_reason ELSE reason END AS label,
         COUNT(*) AS count
       FROM tickets
       WHERE ${ticketWhere} AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         AND reason IS NOT NULL AND reason != ''
       GROUP BY label ORDER BY count DESC LIMIT 6`,
      ticketParams
    ) as any;

    // ── Ticket resolution time (avg hours, closed tickets) ───────────────────
    const [avgResolution] = await conn.execute(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, updated_at)) AS avg_hours
       FROM tickets
       WHERE ${ticketWhere} AND status = 'closed'`,
      ticketParams
    ) as any;

    // ── Payout aggregate stats ───────────────────────────────────────────────
    const [payoutStats] = await conn.execute(
      `SELECT
         COUNT(*)                                         AS total,
         SUM(status = 'pending')                          AS pending_count,
         SUM(status = 'accepted')                         AS accepted,
         SUM(status = 'refused')                          AS refused,
         SUM(status = 'delayed')                          AS delayed,
         SUM(status = 'paid')                             AS paid_count,
         COALESCE(SUM(amount_dzd), 0)                    AS total_amount,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_dzd ELSE 0 END), 0)    AS paid_amount,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_dzd ELSE 0 END), 0) AS pending_amount,
         COALESCE(AVG(amount_dzd), 0)                    AS avg_amount,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))  AS this_week,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS this_month
       FROM expediteur_payouts WHERE ${payoutWhere}`,
      payoutParams
    ) as any;

    // ── Payout daily trend (last 14 days) ────────────────────────────────────
    const [payoutTrend] = await conn.execute(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count,
              SUM(amount_dzd) AS amount
       FROM expediteur_payouts
       WHERE ${payoutWhere} AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       GROUP BY day ORDER BY day ASC`,
      payoutParams
    ) as any;

    const ts = ticketStats[0] ?? {};
    const ps = payoutStats[0] ?? {};
    const ar = avgResolution[0] ?? {};
    const total = Number(ts.total ?? 0);
    const closed = Number(ts.closed_count ?? 0);
    const resolved = Number(ts.resolved ?? 0);

    res.json({
      ok: true,
      tickets: {
        total,
        this_week:      Number(ts.this_week ?? 0),
        this_month:     Number(ts.this_month ?? 0),
        resolution_rate: total > 0 ? Math.round(((closed + resolved) / total) * 100) : 0,
        avg_resolution_hours: ar.avg_hours != null ? Math.round(Number(ar.avg_hours)) : null,
        by_status: {
          open:           Number(ts.open_count ?? 0),
          claimed:        Number(ts.claimed ?? 0),
          in_progress:    Number(ts.in_progress ?? 0),
          resolved:       Number(ts.resolved ?? 0),
          pending_close:  Number(ts.pending_close ?? 0),
          pending_accept: Number(ts.pending_accept ?? 0),
          closed:         Number(ts.closed_count ?? 0),
        },
        by_destination: {
          merchant:    Number(ts.dest_merchant ?? 0),
          central_team: Number(ts.dest_central ?? 0),
          pickup_desk: Number(ts.dest_pickup ?? 0),
        },
        trend:       ticketTrend,
        top_reasons: topReasons,
      },
      payouts: {
        total:           Number(ps.total ?? 0),
        this_week:       Number(ps.this_week ?? 0),
        this_month:      Number(ps.this_month ?? 0),
        total_amount:    Number(ps.total_amount ?? 0),
        paid_amount:     Number(ps.paid_amount ?? 0),
        pending_amount:  Number(ps.pending_amount ?? 0),
        avg_amount:      Math.round(Number(ps.avg_amount ?? 0)),
        success_rate:    Number(ps.total ?? 0) > 0
                           ? Math.round((Number(ps.paid_count ?? 0) / Number(ps.total ?? 0)) * 100)
                           : 0,
        by_status: {
          pending:  Number(ps.pending_count ?? 0),
          accepted: Number(ps.accepted ?? 0),
          refused:  Number(ps.refused ?? 0),
          delayed:  Number(ps.delayed ?? 0),
          paid:     Number(ps.paid_count ?? 0),
        },
        trend: payoutTrend,
      },
    });
  } finally {
    conn.release();
  }
});

export default router;
