/** Route-scaffolding kit (src/lib/api/route-utils.ts): the safe JSON-body parse, the
 *  string-coercion helpers, the ProjectType guard, and the bare `{ error }` 4xx
 *  response builders. These pin the byte-shape the projects routes now depend on. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readJson,
  asString,
  trimmedString,
  isProjectType,
  badRequest,
  notFound,
  unprocessable,
} from "@/lib/api/route-utils";

test("readJson: parses a valid body, null on malformed / empty", async () => {
  const ok = await readJson(new Request("http://x", { method: "POST", body: '{"a":1}', headers: { "content-type": "application/json" } }));
  assert.deepEqual(ok, { a: 1 });
  const bad = await readJson(new Request("http://x", { method: "POST", body: "not json" }));
  assert.equal(bad, null);
  const empty = await readJson(new Request("http://x", { method: "POST" }));
  assert.equal(empty, null);
});

test("asString / trimmedString: string passthrough, else empty string", () => {
  assert.equal(asString("hi"), "hi");
  assert.equal(asString("  hi  "), "  hi  "); // no trim
  assert.equal(asString(42), "");
  assert.equal(asString(undefined), "");
  assert.equal(asString(null), "");
  assert.equal(trimmedString("  hi  "), "hi");
  assert.equal(trimmedString(42), "");
  assert.equal(trimmedString(undefined), "");
});

test("isProjectType: accepts known types, rejects everything else", () => {
  assert.equal(isProjectType("eshop"), true); // a real ProjectType
  assert.equal(isProjectType("not-a-type"), false);
  assert.equal(isProjectType(123), false);
  assert.equal(isProjectType(undefined), false);
});

test("4xx builders: bare { error } envelope + correct status", async () => {
  const b = badRequest("nope");
  assert.equal(b.status, 400);
  assert.deepEqual(await b.json(), { error: "nope" });

  const n = notFound("gone");
  assert.equal(n.status, 404);
  assert.deepEqual(await n.json(), { error: "gone" });

  const u = unprocessable("bad shape");
  assert.equal(u.status, 422);
  assert.deepEqual(await u.json(), { error: "bad shape" });
});
