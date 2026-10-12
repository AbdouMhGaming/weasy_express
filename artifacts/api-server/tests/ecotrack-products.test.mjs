import assert from "node:assert/strict";
import { after, test } from "node:test";
import Module, { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import express from "express";

// Exercise the real Express/Multer product routes without writing customer data.
const here = path.dirname(fileURLToPath(import.meta.url));
const rows = new Map();
let nextId = 1;
const accounts = {
  owner: { id: 101, parent_id: null },
  other: { id: 202, parent_id: null },
  productTeam: { id: 303, parent_id: 101, permissions: '["ecotrack-products"]' },
  orderTeam: { id: 404, parent_id: 101, permissions: '["ecotrack"]' },
};
const clean = row => {
  const { photo_data, ...rest } = row;
  return { ...rest, has_photo: photo_data ? 1 : 0 };
};
async function execute(sql, params = []) {
  if (sql.includes("FROM admins WHERE username")) return [[accounts[params[0]]].filter(Boolean)];
  if (sql.includes("FROM admins WHERE id")) return [[Object.values(accounts).find(a => a.id === params[0] && !a.parent_id)].filter(Boolean)];
  if (sql.startsWith("INSERT INTO expediteur_products")) {
    const keys = sql.match(/\(([^)]+)\) VALUES/)[1].split(",");
    const row = Object.fromEntries(keys.map((key, index) => [key.trim(), params[index]]));
    row.id = nextId++; rows.set(row.id, row);
    return [{ insertId: row.id }];
  }
  if (sql.startsWith("UPDATE expediteur_products")) {
    assert.ok(sql.includes("photo_data=COALESCE(?,photo_data)"));
    const id = params.at(-2), owner = params.at(-1), row = rows.get(id);
    assert.equal(row.expediteur_id, owner);
    const keys = ["name", "sku", "purchase_price", "sale_price", "barcode", "external_id", "brand",
      "alert_min_stock", "weight_kg", "marketer_percentage", "page_url", "description"];
    keys.forEach((key, index) => { row[key] = params[index]; });
    if (params[12]) { row.photo_data = params[12]; row.photo_mime = params[13]; }
    return [{ affectedRows: 1 }];
  }
  if (sql.includes("FROM expediteur_products WHERE expediteur_id=?")) {
    return [[...rows.values()].filter(row => row.expediteur_id === params[0]).map(clean)];
  }
  if (sql.includes("FROM expediteur_products WHERE id=?")) {
    const row = rows.get(params[0]);
    if (!row || params.length > 1 && row.expediteur_id !== params[1]) return [[]];
    if (sql.startsWith("SELECT photo_data")) return [[{ photo_data: row.photo_data, photo_mime: row.photo_mime }]];
    return [[sql.startsWith("SELECT *") ? row : clean(row)]];
  }
  throw new Error(`Unexpected fixture SQL: ${sql}`);
}
globalThis.__productTestPool = {
  execute,
  getConnection: async () => ({ execute, release() {} }),
};
const stubs = {
  adminAuth: `export function adminAuth(req,res,next) {
    const user=(req.headers.authorization||"").replace("Bearer ","");
    if(!user) return res.status(401).json({ok:false,error:"unauthorized"});
    req.adminUsername=user; req.adminRole="expediteur"; next();
  }
  export const suiviAuth=adminAuth; export const hasTeamPermission=()=>false;`,
  ecotrackEvents: "export const recordRemark=()=>{throw Error('Unexpected shipping operation')};",
  ecotrackNotificationScope: 'export const CURRENT_NOTIFICATION_SOURCE_SQL="1=0";',
  ecotrackSync: "export const cacheOrders=()=>{}; export const syncEcotrackAccount=()=>{};",
  ecotrackArchiveHistory: "export const ensureArchiveHistoryStorage=()=>{}; export const refreshArchiveHistory=()=>{};",
};
const bundle = await build({
  stdin: { contents: 'export { default } from "../src/routes/ecotrack";', resolveDir: here, loader: "ts" },
  bundle: true, platform: "node", format: "cjs", write: false, packages: "external",
  define: { "import.meta.url": JSON.stringify(pathToFileURL(path.resolve(here, "../src/routes/ecotrack.ts")).href) },
  plugins: [{
    name: "product-fixtures",
    setup(b) {
      b.onResolve({ filter: /^@workspace\/db$/ }, () => ({ path: "db", namespace: "fixtures" }));
      b.onResolve({ filter: /^\.\.\/lib\/(adminAuth|ecotrackEvents|ecotrackNotificationScope|ecotrackSync|ecotrackArchiveHistory)$/ },
        args => ({ path: path.basename(args.path), namespace: "fixtures" }));
      b.onLoad({ filter: /.*/, namespace: "fixtures" }, args => ({
        contents: args.path === "db" ? "export const pool=globalThis.__productTestPool;" : stubs[args.path], loader: "js",
      }));
    },
  }],
});
const filename = path.join(here, "product-router-fixture.cjs");
const mod = new Module(filename);
mod.filename = filename; mod.paths = Module._nodeModulePaths(here);
mod._compile(bundle.outputFiles[0].text, filename);
const app = express();
app.use(express.json());
app.use("/api", mod.exports.default);
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}/api/expediteur/ecotrack/products`;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9pUAAAAASUVORK5CYII=", "base64");
const photo = (body, data = png, mime = "image/png", field = "photo") =>
  body.append(field, new Blob([data], { type: mime }), "product.png");
const form = values => {
  const body = new FormData();
  for (const [key, value] of Object.entries(values)) body.append(key, String(value));
  return body;
};
const request = (suffix = "", init = {}, user = "owner") =>
  fetch(base + suffix, { ...init, headers: { Authorization: `Bearer ${user}`, ...init.headers } });
let id;

test("create product: all fields, authenticated multipart photo and owner-derived identity", async () => {
  const body = form({ name: "Fixture product", sku: "SKU-1", purchase_price: 100, sale_price: 150,
    barcode: "123", external_id: "external", brand: "Brand", alert_min_stock: 2, weight_kg: 0.5,
    marketer_percentage: 10, page_url: "https://example.test/product", description: "Description", expediteur_id: 202 });
  photo(body);
  const response = await request("", { method: "POST", body });
  assert.equal(response.status, 201);
  const result = await response.json(); id = result.product.id;
  assert.equal(result.product.has_photo, 1);
  assert.equal(result.product.sale_price, 150);
  assert.equal(result.product.description, "Description");
  assert.equal(rows.get(id).expediteur_id, 101);
  assert.equal(result.product.photo_url, `/api/expediteur/ecotrack/products/${id}/photo`);
  const image = await request(`/${id}/photo`);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/png");
  assert.match(image.headers.get("cache-control"), /private, no-store/);
  assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
});
test("edit preserves photo, clears optional fields and replaces photo at the same URL", async () => {
  let body = form({ name: "Edited", sku: "", purchase_price: "", sale_price: 180, description: "" });
  let response = await request(`/${id}`, { method: "PUT", body });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).product.sku, null);
  assert.deepEqual(rows.get(id).photo_data, png);
  const replacement = Buffer.concat([png, Buffer.from("replacement")]);
  body = form({ name: "New image", sale_price: 190 }); photo(body, replacement);
  response = await request(`/${id}`, { method: "PUT", body });
  assert.equal(response.status, 200);
  const image = await request(`/${id}/photo`);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), replacement);
});
test("products without images and duplicate/absent reference fields remain separate records", async () => {
  const response = await request("", { method: "POST", body: form({ name: "No photo", sale_price: 0 }) });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.product.photo_url, null);
  const list = await (await request()).json();
  assert.equal(list.products.length, 2);
  assert.equal(new Set(list.products.map(p => p.id)).size, 2);
});
test("product-only team permission works; other permissions and cross-owner photos/edits are denied", async () => {
  assert.equal((await request("", {}, "productTeam")).status, 200);
  assert.equal((await request(`/${id}/photo`, {}, "productTeam")).status, 200);
  assert.equal((await request("", {}, "orderTeam")).status, 403);
  assert.equal((await request(`/${id}/photo`, {}, "orderTeam")).status, 403);
  assert.deepEqual((await (await request("", {}, "other")).json()).products, []);
  assert.equal((await request(`/${id}/photo`, {}, "other")).status, 404);
  assert.equal((await request(`/${id}`, { method: "PUT", body: form({ name: "Forbidden" }) }, "other")).status, 404);
  assert.equal((await fetch(base)).status, 401);
});
test("oversized, invalid and unexpected photo uploads return explicit JSON errors", async () => {
  for (const method of ["POST", "PUT"]) {
    const suffix = method === "PUT" ? `/${id}` : "";
    for (const [data, mime, field, expected, status] of [
      [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png", "photo", "photo_too_large", 413],
      [Buffer.from("not an image"), "image/png", "photo", "invalid_photo", 400],
      [png, "image/gif", "photo", "invalid_photo", 400],
      [png, "image/png", "unexpected", "invalid_photo_upload", 400],
    ]) {
      const body = form({ name: "Rejected" }); photo(body, data, mime, field);
      const response = await request(suffix, { method, body });
      assert.equal(response.status, status);
      assert.match(response.headers.get("content-type"), /application\/json/);
      assert.equal((await response.json()).error, expected);
    }
  }
});
test("required name, negative numbers and unsafe page URLs are rejected", async () => {
  for (const [values, expected] of [
    [{ name: " " }, "name_required"], [{ name: "Invalid", sale_price: -1 }, "invalid_sale_price"],
    [{ name: "Invalid", weight_kg: "not-a-number" }, "invalid_weight_kg"],
    [{ name: "Invalid", page_url: "javascript:alert(1)" }, "invalid_page_url"],
  ]) {
    const response = await request("", { method: "POST", body: form(values) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error, expected);
  }
  assert.equal((await request(`/${id}`, { method: "PUT", body: form({ name: " " }) })).status, 400);
});
after(async () => { await new Promise(resolve => server.close(resolve)); delete globalThis.__productTestPool; });
