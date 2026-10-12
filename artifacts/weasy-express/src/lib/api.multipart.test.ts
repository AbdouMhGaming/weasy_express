import { test } from "node:test";
import assert from "node:assert/strict";
import { authenticatedFetch } from "./api";

test("product creation uses a browser-generated multipart boundary and preserves auth", async (t) => {
  let request: Request | undefined;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    request = new Request(input, init);
    return Response.json({ ok: true });
  });
  const body = new FormData();
  body.append("name", "Fixture product");
  body.append("sale_price", "250");
  const headers = { Authorization: "Bearer fixture-only", "Content-Type": "application/json" };
  await authenticatedFetch("https://example.test/products", { method: "POST", headers, body });
  assert.ok(request);
  assert.match(request.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/);
  assert.equal(request.headers.get("authorization"), headers.Authorization);
  assert.equal(headers["Content-Type"], "application/json", "original headers must not be mutated");
  const parsed = await request.formData();
  assert.equal(parsed.get("name"), "Fixture product");
  assert.equal(parsed.get("sale_price"), "250");
});

test("product editing preserves photo bytes, filename and fields", async (t) => {
  let request: Request | undefined;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    request = new Request(input, init);
    return Response.json({ ok: true });
  });
  const body = new FormData();
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  body.append("name", "Edited fixture");
  body.append("photo", new Blob([bytes], { type: "image/png" }), "fixture.png");
  await authenticatedFetch("https://example.test/products/1", {
    method: "PUT", headers: new Headers({ Authorization: "Bearer fixture-only", "content-type": "application/json" }), body,
  });
  assert.ok(request);
  assert.equal(request.method, "PUT");
  assert.match(request.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/);
  const parsed = await request.formData();
  assert.equal(parsed.get("name"), "Edited fixture");
  const photo = parsed.get("photo") as File;
  assert.equal(photo.name, "fixture.png");
  assert.equal(photo.type, "image/png");
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()), bytes);
});

test("multipart overrides inherit Request authorization without preserving an incorrect content type", async (t) => {
  let request: Request | undefined;
  t.mock.method(globalThis, "fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    request = new Request(input, init);
    return Response.json({ ok: true });
  });
  const original = new Request("https://example.test/products", {
    method: "POST", headers: { Authorization: "Bearer fixture-only", "Content-Type": "application/json" },
  });
  const body = new FormData();
  body.append("name", "Fixture");
  await authenticatedFetch(original, { body });
  assert.ok(request);
  assert.equal(request.headers.get("authorization"), "Bearer fixture-only");
  assert.match(request.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/);
});

test("regular JSON requests keep their original request contract", async (t) => {
  const init = { method: "POST", headers: { Authorization: "Bearer fixture-only", "Content-Type": "application/json" }, body: JSON.stringify({ name: "Fixture" }) };
  let captured: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (_input: RequestInfo | URL, options?: RequestInit) => {
    captured = options;
    return Response.json({ ok: true });
  });
  await authenticatedFetch("https://example.test/json", init);
  assert.equal(captured, init);
});
