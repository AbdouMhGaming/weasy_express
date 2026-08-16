import { Router } from "express";
import { pool } from "@workspace/db";
import { adminAuth, type AuthedRequest } from "../lib/adminAuth";

const router = Router();

async function getHub(conn: any, username: string): Promise<string | null> {
  const [rows] = await conn.execute(
    "SELECT office_hub FROM admins WHERE username = ? LIMIT 1", [username]
  ) as any;
  return rows[0]?.office_hub ?? null;
}

// ── GET /api/analytics/options ────────────────────────────────────────────────
// Returns lists of hubs and expediteurs for filter dropdowns (role-scoped).

router.get("/analytics/options", adminAuth, async (req: AuthedRequest, res) => {
  const role         = req.adminRole!;
  const username     = req.adminUsername!;
  const dataUsername = req.adminDataUsername ?? username;
  const conn         = await pool.getConnection();
  try {
    let hubs: string[]    = [];
    let expediteurs: string[] = [];

    if (role === "admin") {
      // Build hub list from the offices table (same format used everywhere: "wilaya — commune")
      // then UNION with any office_hub values already in admins/payouts that may not be in offices
      const [hr] = await conn.execute(
        `SELECT DISTINCT hub FROM (
           SELECT CONCAT(wilaya, CASE WHEN commune IS NOT NULL AND commune != '' THEN CONCAT(' — ', commune) ELSE '' END) AS hub
           FROM offices
           UNION
           SELECT office_hub AS hub FROM admins WHERE office_hub IS NOT NULL AND office_hub != ''
           UNION
           SELECT office_hub AS hub FROM expediteur_payouts WHERE office_hub IS NOT NULL AND office_hub != ''
         ) t WHERE hub IS NOT NULL AND hub != '' ORDER BY hub ASC`
      ) as any;
      hubs = hr.map((r: any) => r.hub);

      const [er] = await conn.execute(
        "SELECT username FROM admins WHERE role = 'expediteur' AND parent_id IS NULL ORDER BY username ASC"
      ) as any;
      expediteurs = er.map((r: any) => r.username);
    } else if (role === "office") {
      const myHub = await getHub(conn, dataUsername);
      if (myHub) {
        const [er] = await conn.execute(
          "SELECT DISTINCT expediteur_username FROM expediteur_payouts WHERE office_hub = ? ORDER BY expediteur_username ASC",
          [myHub]
        ) as any;
        expediteurs = er.map((r: any) => r.expediteur_username);
      }
    }

    res.json({ ok: true, hubs, expediteurs });
  } finally { conn.release(); }
});

// ── GET /api/analytics ────────────────────────────────────────────────────────
// Query params: from, to, hub, expediteur, ticket_dest, ticket_status, payout_status

router.get("/analytics", adminAuth, async (req: AuthedRequest, res) => {
  const role         = req.adminRole!;
  const username     = req.adminUsername!;
  const dataUsername = req.adminDataUsername ?? username;

  // ── Parse filters ────────────────────────────────────────────────────────────
  const qFrom         = typeof req.query.from         === "string" ? req.query.from         : null;
  const qTo           = typeof req.query.to           === "string" ? req.query.to           : null;
  const qHub          = typeof req.query.hub          === "string" ? req.query.hub          : null;
  const qExpediteur   = typeof req.query.expediteur   === "string" ? req.query.expediteur   : null;
  const qTicketDest   = typeof req.query.ticket_dest  === "string" ? req.query.ticket_dest  : null;
  const qTicketStatus = typeof req.query.ticket_status=== "string" ? req.query.ticket_status: null;
  const qPayoutStatus = typeof req.query.payout_status=== "string" ? req.query.payout_status: null;

  // Date range clause (shared)
  const dateTicketClause: string[] = [];
  const datePayoutClause: string[] = [];
  const dateTicketParams: any[]    = [];
  const datePayoutParams: any[]    = [];

  if (qFrom) {
    dateTicketClause.push("t.created_at >= ?");
    datePayoutClause.push("created_at >= ?");
    dateTicketParams.push(qFrom);
    datePayoutParams.push(qFrom);
  }
  if (qTo) {
    // add 1 day so "to" is inclusive of the full day
    const toInclusive = new Date(qTo);
    toInclusive.setDate(toInclusive.getDate() + 1);
    dateTicketClause.push("t.created_at < ?");
    datePayoutClause.push("created_at < ?");
    dateTicketParams.push(toInclusive.toISOString().slice(0, 10));
    datePayoutParams.push(toInclusive.toISOString().slice(0, 10));
  }

  // Trend window: use date range when given, else last 14 days
  let trendFrom: string;
  let trendTo: string;
  if (qFrom && qTo) {
    trendFrom = qFrom;
    trendTo   = qTo;
  } else if (qFrom) {
    trendFrom = qFrom;
    trendTo   = new Date().toISOString().slice(0, 10);
  } else {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    trendFrom = d.toISOString().slice(0, 10);
    trendTo   = new Date().toISOString().slice(0, 10);
  }

  const conn = await pool.getConnection();
  try {
    if (!["admin", "office", "expediteur"].includes(role)) {
      return res.json({ ok: true, tickets: null, payouts: null });
    }

    // ── Role-based ticket scoping ─────────────────────────────────────────────
    // We alias tickets as "t" throughout
    const ticketRoleClauses: string[] = [];
    const ticketRoleParams: any[]     = [];

    if (role === "office") {
      if (qExpediteur) {
        // office filtered to one expediteur: just their created tickets
        ticketRoleClauses.push("t.created_by = ?");
        ticketRoleParams.push(qExpediteur);
      } else {
        const myHub = await getHub(conn, dataUsername);
        if (myHub) {
          ticketRoleClauses.push("(t.created_by = ? OR (t.destination_type = 'pickup_desk' AND t.recipient_office = ?))");
          ticketRoleParams.push(dataUsername, myHub);
        } else {
          ticketRoleClauses.push("t.created_by = ?");
          ticketRoleParams.push(dataUsername);
        }
      }
    } else if (role === "expediteur") {
      ticketRoleClauses.push("(t.created_by = ? OR (t.destination_type = 'merchant' AND t.recipient_username = ?))");
      ticketRoleParams.push(dataUsername, dataUsername);
    } else {
      // admin
      if (qHub) {
        // tickets created by someone in this hub, or addressed to this hub
        ticketRoleClauses.push("(EXISTS(SELECT 1 FROM admins a WHERE a.username = t.created_by AND a.office_hub = ?) OR (t.destination_type = 'pickup_desk' AND t.recipient_office = ?))");
        ticketRoleParams.push(qHub, qHub);
      }
      if (qExpediteur) {
        ticketRoleClauses.push("t.created_by = ?");
        ticketRoleParams.push(qExpediteur);
      }
    }

    // Optional ticket filters
    if (qTicketDest)   { ticketRoleClauses.push("t.destination_type = ?"); ticketRoleParams.push(qTicketDest); }
    if (qTicketStatus) { ticketRoleClauses.push("t.status = ?");            ticketRoleParams.push(qTicketStatus); }

    const allTicketClauses = [...ticketRoleClauses, ...dateTicketClause.map(c => c.replace("t.", "t."))];
    const allTicketParams  = [...ticketRoleParams, ...dateTicketParams];
    const ticketWhere      = allTicketClauses.length ? allTicketClauses.join(" AND ") : "1=1";

    // ── Role-based payout scoping ─────────────────────────────────────────────
    const payoutRoleClauses: string[] = [];
    const payoutRoleParams: any[]     = [];

    if (role === "office") {
      if (qExpediteur) {
        payoutRoleClauses.push("expediteur_username = ?");
        payoutRoleParams.push(qExpediteur);
      } else {
        const myHub = await getHub(conn, dataUsername);
        if (myHub) {
          payoutRoleClauses.push("office_hub = ?");
          payoutRoleParams.push(myHub);
        } else {
          payoutRoleClauses.push("1=0");
        }
      }
    } else if (role === "expediteur") {
      payoutRoleClauses.push("expediteur_username = ?");
      payoutRoleParams.push(dataUsername);
    } else {
      // admin
      if (qHub)         { payoutRoleClauses.push("office_hub = ?");          payoutRoleParams.push(qHub); }
      if (qExpediteur)  { payoutRoleClauses.push("expediteur_username = ?"); payoutRoleParams.push(qExpediteur); }
    }

    if (qPayoutStatus) { payoutRoleClauses.push("status = ?"); payoutRoleParams.push(qPayoutStatus); }

    const allPayoutClauses = [...payoutRoleClauses, ...datePayoutClause];
    const allPayoutParams  = [...payoutRoleParams, ...datePayoutParams];
    const payoutWhere      = allPayoutClauses.length ? allPayoutClauses.join(" AND ") : "1=1";

    // ── Ticket aggregate ──────────────────────────────────────────────────────
    const [ticketStats] = await conn.execute(
      `SELECT
         COUNT(*) AS total,
         SUM(t.status = 'open')           AS open_count,
         SUM(t.status = 'claimed')        AS claimed,
         SUM(t.status = 'in_progress')    AS in_progress,
         SUM(t.status = 'resolved')       AS resolved,
         SUM(t.status = 'pending_close')  AS pending_close,
         SUM(t.status = 'pending_accept') AS pending_accept,
         SUM(t.status = 'closed')         AS closed_count,
         SUM(t.destination_type = 'merchant')     AS dest_merchant,
         SUM(t.destination_type = 'central_team') AS dest_central,
         SUM(t.destination_type = 'pickup_desk')  AS dest_pickup,
         SUM(t.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))  AS this_week,
         SUM(t.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS this_month
       FROM tickets t WHERE ${ticketWhere}`,
      allTicketParams
    ) as any;

    // ── Ticket trend ──────────────────────────────────────────────────────────
    const [ticketTrend] = await conn.execute(
      `SELECT DATE(t.created_at) AS day, COUNT(*) AS count
       FROM tickets t
       WHERE ${ticketWhere} AND DATE(t.created_at) BETWEEN ? AND ?
       GROUP BY day ORDER BY day ASC`,
      [...allTicketParams, trendFrom, trendTo]
    ) as any;

    // ── Top ticket reasons ────────────────────────────────────────────────────
    const [topReasons] = await conn.execute(
      `SELECT
         CASE WHEN t.reason = 'other' AND t.custom_reason IS NOT NULL AND t.custom_reason != ''
              THEN t.custom_reason ELSE t.reason END AS label,
         COUNT(*) AS count
       FROM tickets t
       WHERE ${ticketWhere} AND t.reason IS NOT NULL AND t.reason != ''
       GROUP BY label ORDER BY count DESC LIMIT 6`,
      allTicketParams
    ) as any;

    // ── Avg resolution time ───────────────────────────────────────────────────
    const [avgResolution] = await conn.execute(
      `SELECT AVG(TIMESTAMPDIFF(HOUR, t.created_at, t.updated_at)) AS avg_hours
       FROM tickets t WHERE ${ticketWhere} AND t.status = 'closed'`,
      allTicketParams
    ) as any;

    // ── Payout aggregate ──────────────────────────────────────────────────────
    const [payoutStats] = await conn.execute(
      `SELECT
         COUNT(*)                                                                   AS total,
         SUM(status = 'pending')                                                    AS pending_count,
         SUM(status = 'accepted')                                                   AS accepted_count,
         SUM(status = 'refused')                                                    AS refused_count,
         SUM(status = 'delayed')                                                    AS delayed_count,
         SUM(status = 'paid')                                                       AS paid_count,
         COALESCE(SUM(amount_dzd), 0)                                              AS total_amount,
         COALESCE(SUM(CASE WHEN status = 'paid'    THEN amount_dzd ELSE 0 END), 0) AS paid_amount,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_dzd ELSE 0 END), 0) AS pending_amount,
         COALESCE(AVG(amount_dzd), 0)                                              AS avg_amount,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))                        AS this_week,
         SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY))                       AS this_month
       FROM expediteur_payouts WHERE ${payoutWhere}`,
      allPayoutParams
    ) as any;

    // ── Payout trend ──────────────────────────────────────────────────────────
    const [payoutTrend] = await conn.execute(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count, SUM(amount_dzd) AS amount
       FROM expediteur_payouts
       WHERE ${payoutWhere} AND DATE(created_at) BETWEEN ? AND ?
       GROUP BY day ORDER BY day ASC`,
      [...allPayoutParams, trendFrom, trendTo]
    ) as any;

    const ts    = ticketStats[0] ?? {};
    const ps    = payoutStats[0] ?? {};
    const ar    = avgResolution[0] ?? {};
    const total = Number(ts.total ?? 0);
    const closed   = Number(ts.closed_count ?? 0);
    const resolved = Number(ts.resolved ?? 0);

    res.json({
      ok: true,
      trendFrom,
      trendTo,
      tickets: {
        total,
        this_week:            Number(ts.this_week ?? 0),
        this_month:           Number(ts.this_month ?? 0),
        resolution_rate:      total > 0 ? Math.round(((closed + resolved) / total) * 100) : 0,
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
          merchant:     Number(ts.dest_merchant ?? 0),
          central_team: Number(ts.dest_central ?? 0),
          pickup_desk:  Number(ts.dest_pickup ?? 0),
        },
        trend:       ticketTrend,
        top_reasons: topReasons,
      },
      payouts: {
        total:          Number(ps.total ?? 0),
        this_week:      Number(ps.this_week ?? 0),
        this_month:     Number(ps.this_month ?? 0),
        total_amount:   Number(ps.total_amount ?? 0),
        paid_amount:    Number(ps.paid_amount ?? 0),
        pending_amount: Number(ps.pending_amount ?? 0),
        avg_amount:     Math.round(Number(ps.avg_amount ?? 0)),
        success_rate:   Number(ps.total ?? 0) > 0
                          ? Math.round((Number(ps.paid_count ?? 0) / Number(ps.total ?? 0)) * 100)
                          : 0,
        by_status: {
          pending:  Number(ps.pending_count  ?? 0),
          accepted: Number(ps.accepted_count ?? 0),
          refused:  Number(ps.refused_count  ?? 0),
          delayed:  Number(ps.delayed_count  ?? 0),
          paid:     Number(ps.paid_count     ?? 0),
        },
        trend: payoutTrend,
      },
    });
  } finally {
    conn.release();
  }
});

export default router;
