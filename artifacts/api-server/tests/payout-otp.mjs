// Exercise the real payout routes without touching any merchant or live payout.
import { createRequire } from "node:module";
import Module from "node:module";
import path from "node:path";
import assert from "node:assert/strict";
const require = createRequire(new URL("../build.mjs", import.meta.url));
const { build } = require("esbuild");
const express = require("express");
let payout, otp, notifications, officeHub;
function reset(status = "pending") {
  payout = { id: 1, status, expediteur_username: "test-sender", office_hub: "test-hub", amount_dzd: 5000, confirmation_token: "qr-token" };
  otp = null; notifications = []; officeHub = "test-hub";
}
reset();
const conn = {
  beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
  async execute(sql, p = []) {
    if (/CREATE TABLE/.test(sql)) return [{}, []];
    if (/SELECT \* FROM expediteur_payouts/.test(sql)) { assert.ok(sql.includes("FOR UPDATE")); return [[{ ...payout }], []]; }
    if (/SELECT office_hub FROM admins/.test(sql)) return [[{ office_hub: officeHub }], []];
    if (/SELECT id FROM admins/.test(sql)) return [[{ id: 77 }], []];
    if (/SELECT \* FROM payout_confirmation_otps/.test(sql)) return [[...(otp ? [{ ...otp }] : [])], []];
    if (/INSERT INTO payout_confirmation_otps/.test(sql)) {
      otp = { payout_id: p[0], code_hash: p[1], salt: p[2], expires_at: p[3], sent_at: p[4], window_started_at: p[5], send_count: p[6], attempts: 0, used_at: null };
      return [{ affectedRows: 1 }, []];
    }
    if (/INSERT INTO expediteur_ecotrack_notifications/.test(sql)) {
      notifications.push({ ownerId: p[0], ...JSON.parse(p[3]) }); return [{ affectedRows: 1 }, []];
    }
    if (/UPDATE payout_confirmation_otps SET attempts/.test(sql)) { otp.attempts++; return [{ affectedRows: 1 }, []]; }
    if (/UPDATE payout_confirmation_otps SET used_at/.test(sql)) { otp.used_at = new Date(); return [{ affectedRows: 1 }, []]; }
    if (/UPDATE expediteur_payouts SET status='paid'/.test(sql)) { payout.status = "paid"; payout.confirmation_token = null; return [{ affectedRows: 1 }, []]; }
    throw new Error(`Unexpected test SQL: ${sql}`);
  },
};
globalThis.__payoutTestPool = { ...conn, getConnection: async () => conn };
const root = path.resolve(import.meta.dirname, "..");
const virtual = {
  db: "export const pool=globalThis.__payoutTestPool;",
  auth: `export const adminAuth=(req,res,next)=>{req.adminRole=req.headers["x-test-role"]||"admin";req.adminUsername="test-user";next();}; export const hashPassword=s=>s;`,
  sync: "export const queueEcotrackFullSync=()=>{};export const withEcotrackAccountLock=async(_,fn)=>fn();",
};
const plugins = [{
  name: "isolated-test-dependencies",
  setup(b) {
    b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "test" }));
    b.onResolve({ filter: /\/lib\/adminAuth$/ }, () => ({ path: "auth", namespace: "test" }));
    b.onResolve({ filter: /\/lib\/ecotrackSync$/ }, () => ({ path: "sync", namespace: "test" }));
    b.onLoad({ filter: /.*/, namespace: "test" }, a => ({ contents: virtual[a.path] }));
  },
}];
const compiled = await build({ entryPoints: [path.join(root, "src/routes/expediteurs.ts")], bundle: true, format: "cjs", platform: "node", write: false, external: ["express"], plugins });
const module = new Module(path.join(root, "tests/otp-routes.cjs"));
module.filename = path.join(root, "tests/otp-routes.cjs");
module.paths = Module._nodeModulePaths(root);
module._compile(compiled.outputFiles[0].text, module.filename);
const app = express(); app.use(express.json()); app.use("/api", module.exports.default);
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const url = `http://127.0.0.1:${server.address().port}/api/expediteur/payouts/1`;
async function post(suffix, body = {}, role = "admin") {
  const res = await fetch(url + suffix, { method: "POST", headers: { "Content-Type": "application/json", "x-test-role": role }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
try {
  assert.equal((await post("/otp", {}, "expediteur")).status, 403);
  officeHub = "wrong-hub";
  assert.equal((await post("/otp", {}, "office")).status, 403);
  officeHub = "test-hub";
  const sent = await post("/otp");
  assert.equal(sent.status, 200); assert.ok(!sent.body.code);
  assert.equal(notifications[0].ownerId, 77);
  assert.match(notifications[0].code, /^\d{6}$/);
  assert.equal(payout.status, "pending");
  assert.equal((await post("/otp")).status, 429);
  const wrong = notifications[0].code === "111111" ? "222222" : "111111";
  assert.equal((await post("/otp/confirm", { code: wrong })).status, 400);
  assert.equal(otp.attempts, 1); assert.equal(payout.status, "pending");
  assert.equal((await post("/otp/confirm", { code: notifications[0].code }, "office")).status, 200);
  assert.equal(payout.status, "paid"); assert.equal(payout.confirmation_token, null);
  assert.equal((await post("/otp/confirm", { code: notifications[0].code })).status, 409);
  reset("accepted"); await post("/otp"); otp.expires_at = new Date(0);
  assert.equal((await post("/otp/confirm", { code: notifications[0].code })).status, 409);
  reset(); await post("/otp");
  const bad = notifications[0].code === "111111" ? "222222" : "111111";
  for (let i = 0; i < 5; i++) assert.equal((await post("/otp/confirm", { code: bad })).status, 400);
  assert.equal((await post("/otp/confirm", { code: notifications[0].code })).status, 409);
  reset(); await post("/otp");
  const oldCode = notifications[0].code;
  otp.sent_at = new Date(Date.now() - 61_000);
  await post("/otp");
  assert.equal(notifications.length, 2);
  if (oldCode !== notifications[1].code) assert.equal((await post("/otp/confirm", { code: oldCode })).status, 400);
  console.log("PASS: payout OTP ownership, office scope, pending/accepted, notification delivery, expiry, retry limits, resend, QR invalidation and one-time confirmation.");
} finally { server.close(); delete globalThis.__payoutTestPool; }
