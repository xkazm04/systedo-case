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
  isSafeAccentColor,
  isSafeHttpUrl,
  badRequest,
  notFound,
  unprocessable,
  conflict,
  apiError,
  providerError,
  API_ERROR_CODES,
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

test("4xx builders: bare { error } envelope + correct status (no code → historical shape)", async () => {
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

test("4xx builders: an optional machine code is ADDITIVE (error field kept)", async () => {
  const b = badRequest("nope", "missing-field");
  assert.equal(b.status, 400);
  assert.deepEqual(await b.json(), { error: "nope", code: "missing-field" });

  const u = unprocessable("bad", "unprocessable");
  assert.deepEqual(await u.json(), { error: "bad", code: "unprocessable" });

  const c = conflict("state", "not-approved", { envelope: "ok" });
  assert.equal(c.status, 409);
  assert.deepEqual(await c.json(), { ok: false, code: "not-approved", error: "state" });
});

test("apiError: both envelopes, code optional", async () => {
  assert.deepEqual(await apiError(400, "x").json(), { error: "x" });
  assert.deepEqual(await apiError(400, "x", "bad-request").json(), { error: "x", code: "bad-request" });
  assert.deepEqual(await apiError(422, "x", undefined, { envelope: "ok" }).json(), { ok: false, error: "x" });
  assert.deepEqual(
    await apiError(422, "x", "unprocessable", { envelope: "ok" }).json(),
    { ok: false, code: "unprocessable", error: "x" }
  );
});

test("providerError: coded category + generic message; raw is server-logged, NOT in body", async () => {
  const logged = [];
  const orig = console.error;
  console.error = (...a) => logged.push(a);
  try {
    const r = providerError({
      category: "provider-error",
      message: "Obecná chyba.",
      raw: new Error("SECRET upstream 500 detail"),
      context: "unit",
    });
    assert.equal(r.status, 502);
    const body = await r.json();
    assert.deepEqual(body, { error: "Obecná chyba.", code: "provider-error" });
    // The raw provider text must NOT leak to the client…
    assert.ok(!JSON.stringify(body).includes("SECRET"));
    // …but it IS logged for operators.
    assert.ok(logged.some((a) => JSON.stringify(a).includes("SECRET")));
    // timeout maps to 504
    assert.equal(providerError({ category: "provider-timeout", message: "t", context: "u" }).status, 504);
  } finally {
    console.error = orig;
  }
});

test("code catalog: every code is unique + kebab-case (the client's stable contract)", () => {
  assert.ok(API_ERROR_CODES.length > 0);
  assert.equal(new Set(API_ERROR_CODES).size, API_ERROR_CODES.length, "no duplicate codes");
  for (const code of API_ERROR_CODES) {
    assert.match(code, /^[a-z]+(-[a-z]+)*$/, `"${code}" must be kebab-case`);
  }
  // The auth codes the guard emits must exist in the catalog.
  assert.ok(API_ERROR_CODES.includes("unauthorized"));
  assert.ok(API_ERROR_CODES.includes("not-found"));
});

// ---- branding-input validators (public share surface safety) ----

test("isSafeAccentColor accepts only #hex colors (3-8 digits)", () => {
  assert.ok(isSafeAccentColor("#0f766e"));
  assert.ok(isSafeAccentColor("#fff"));
  assert.ok(isSafeAccentColor("#FFFFFFCC")); // #rrggbbaa
  assert.ok(!isSafeAccentColor("teal"));
  assert.ok(!isSafeAccentColor("0f766e"));
  assert.ok(!isSafeAccentColor("#12345g"));
  assert.ok(!isSafeAccentColor("#ff"));
  assert.ok(!isSafeAccentColor("#123456789"));
  // The CSS-injection shape the finding names must never pass.
  assert.ok(!isSafeAccentColor("red;} body{display:none"));
  assert.ok(!isSafeAccentColor(""));
});

test("isSafeHttpUrl allows only absolute http(s) URLs", () => {
  assert.ok(isSafeHttpUrl("https://example.com/logo.png"));
  assert.ok(isSafeHttpUrl("http://cdn.example.com/a.svg?x=1"));
  assert.ok(!isSafeHttpUrl("javascript:alert(1)"));
  assert.ok(!isSafeHttpUrl("data:text/html,<script>1</script>"));
  assert.ok(!isSafeHttpUrl("//example.com/logo.png")); // protocol-relative
  assert.ok(!isSafeHttpUrl("/local/logo.png"));
  assert.ok(!isSafeHttpUrl("ftp://example.com/logo.png"));
  assert.ok(!isSafeHttpUrl("not a url"));
  assert.ok(!isSafeHttpUrl(""));
});
