import { test, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import { CURRENT_NOTIFICATION_SOURCE_SQL, notificationSource } from "./ecotrackNotificationScope";

test("notification source is stable for the same API and different for another API", () => {
  assert.equal(notificationSource("fixture-api-one"), notificationSource("fixture-api-one"));
  assert.notEqual(notificationSource("fixture-api-one"), notificationSource("fixture-api-two"));
  assert.match(notificationSource("fixture-api-one"), /^[a-f0-9]{64}$/);
  assert.throws(() => notificationSource("   "));
});

// Read-only SQL fixtures shadow the real tables. No credentials, notification
// records, API settings or account data are modified by these tests.
const fixture = `
WITH expediteur_ecotrack_notification_connections AS (
  SELECT 101 expediteur_id, CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci source_hash
  UNION ALL SELECT 202, 'other-api'
), expediteur_ecotrack_credentials AS (
  SELECT 101 expediteur_id, CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci connection_status
  UNION ALL SELECT 202, 'connected'
), expediteur_ecotrack_notification_sources AS (
  SELECT 1 notification_id, 'old-api' source_hash
  UNION ALL SELECT 2, 'current-api'
  UNION ALL SELECT 4, 'other-api'
  UNION ALL SELECT 6, 'old-api'
), notifications AS (
  SELECT 1 id, 101 expediteur_id, 'remark' event_type, 0 is_read
  UNION ALL SELECT 2, 101, 'suspended', 0
  UNION ALL SELECT 3, 101, 'remark', 0
  UNION ALL SELECT 4, 202, 'remark', 0
  UNION ALL SELECT 5, 101, 'payout_otp', 0
  UNION ALL SELECT 6, 101, 'remark', 0
)
`;

const mysqlTests = process.env.RUN_MYSQL_NOTIFICATION_SCOPE_TESTS === "1";
async function visible(source: string, connected: boolean, owner: number | null, otp: boolean, id?: number) {
  const params: (string | number)[] = [source, connected ? "connected" : "disconnected"];
  let where = CURRENT_NOTIFICATION_SOURCE_SQL;
  if (owner !== null) { where += " AND n.expediteur_id=?"; params.push(owner); }
  if (!otp) where += " AND n.event_type<>'payout_otp'";
  if (id !== undefined) { where += " AND n.id=?"; params.push(id); }
  const [rows] = await pool.execute(
    `${fixture} SELECT n.id FROM notifications n WHERE ${where} ORDER BY n.id`, params,
  ) as any;
  return rows.map((row: any) => Number(row.id));
}

test("current API hides previous, unlinked and late-arriving previous-API alerts", { skip: !mysqlTests }, async () => {
  assert.deepEqual(await visible("current-api", true, 101, true), [2, 5]);
  assert.deepEqual(await visible("current-api", true, 101, false), [2]);
  assert.deepEqual(await visible("current-api", true, 202, false), [4]);
});

test("old notification IDs cannot be opened or marked read", { skip: !mysqlTests }, async () => {
  for (const id of [1, 3, 4, 6]) assert.deepEqual(await visible("current-api", true, 101, true, id), []);
  assert.deepEqual(await visible("current-api", true, 101, true, 2), [2]);
});

test("API switch, reconnect and disconnect respect ownership and account OTPs", { skip: !mysqlTests }, async () => {
  assert.deepEqual(await visible("old-api", true, 101, true), [1, 5, 6]);
  assert.deepEqual(await visible("current-api", true, 101, true), [2, 5]);
  assert.deepEqual(await visible("current-api", false, 101, true), [5]);
  assert.deepEqual(await visible("current-api", false, 101, false), []);
  assert.deepEqual(await visible("current-api", true, null, false), [2, 4]);
});

after(async () => { await pool.end(); });
