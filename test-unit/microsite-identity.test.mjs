/** White-label identity fallback (src/lib/microsite-identity.ts): the microsite
 *  no longer collects its own client name / accent — they resolve, first non-empty
 *  per field, from (1) the microsite's own persisted values → (2) the report
 *  config → (3) the demo default, with brandName falling back to clientName. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MICROSITE_IDENTITY,
  isValidMicrositeSlug,
  resolveMicrositeIdentity,
} from "@/lib/microsite-identity";

test("no sources → demo default", () => {
  assert.deepEqual(resolveMicrositeIdentity(), DEFAULT_MICROSITE_IDENTITY);
  assert.deepEqual(
    resolveMicrositeIdentity(null, undefined, {}),
    DEFAULT_MICROSITE_IDENTITY
  );
});

test("report config supplies identity when no persisted site", () => {
  const id = resolveMicrositeIdentity(undefined, {
    clientName: "Dentalis",
    accentColor: "#123456",
    brandName: "Praha Dental",
  });
  assert.equal(id.clientName, "Dentalis");
  assert.equal(id.accentColor, "#123456");
  assert.equal(id.brandName, "Praha Dental");
});

test("existing microsite values win over report config (existing sites keep working)", () => {
  const persisted = { clientName: "OldCo", accentColor: "#abcdef", brandName: "OldBrand" };
  const reportConfig = { clientName: "NewCo", accentColor: "#000000", brandName: "NewBrand" };
  const id = resolveMicrositeIdentity(persisted, reportConfig);
  assert.deepEqual(id, persisted);
});

test("explicit override wins over everything (back-compat body)", () => {
  const id = resolveMicrositeIdentity(
    { clientName: "Override", accentColor: "#ff0000" },
    { clientName: "Persisted" },
    { clientName: "Report" }
  );
  assert.equal(id.clientName, "Override");
  assert.equal(id.accentColor, "#ff0000");
  // brandName not supplied by any source → falls back to resolved clientName
  assert.equal(id.brandName, "Override");
});

test("per-field fallback: missing field falls through to the next source", () => {
  const id = resolveMicrositeIdentity(
    { clientName: "SiteName" }, // persisted has only a name
    { accentColor: "#0e9c97", brandName: "ReportBrand" } // report supplies the rest
  );
  assert.equal(id.clientName, "SiteName");
  assert.equal(id.accentColor, "#0e9c97");
  assert.equal(id.brandName, "ReportBrand");
});

test("blank / whitespace values are skipped", () => {
  const id = resolveMicrositeIdentity(
    { clientName: "   ", accentColor: "", brandName: "  " },
    { clientName: "Real", accentColor: "#222222", brandName: "" }
  );
  assert.equal(id.clientName, "Real");
  assert.equal(id.accentColor, "#222222");
  assert.equal(id.brandName, "Real"); // both brandNames empty → clientName
});

test("invalid accent hex is rejected and falls through", () => {
  const id = resolveMicrositeIdentity(
    { accentColor: "teal" }, // not #rrggbb
    { accentColor: "#12g456" }, // not valid hex
    { accentColor: "#33aa88" } // valid
  );
  assert.equal(id.accentColor, "#33aa88");
});

test("all accents invalid → default accent", () => {
  const id = resolveMicrositeIdentity({ accentColor: "#fff" }, { accentColor: "rgb(0,0,0)" });
  assert.equal(id.accentColor, DEFAULT_MICROSITE_IDENTITY.accentColor);
});

// ---- public slug validation (the /m/{slug} doc id + route segment) ----

test("isValidMicrositeSlug accepts lowercase alnum-dash, 3-40 chars", () => {
  assert.ok(isValidMicrositeSlug("mionelo"));
  assert.ok(isValidMicrositeSlug("abc"));
  assert.ok(isValidMicrositeSlug("client-42"));
  assert.ok(isValidMicrositeSlug("a".repeat(40)));
});

test("isValidMicrositeSlug rejects empty, short, uppercase and path-ish slugs", () => {
  assert.ok(!isValidMicrositeSlug(""));
  assert.ok(!isValidMicrositeSlug("ab")); // below minimum length
  assert.ok(!isValidMicrositeSlug("Mionelo")); // uppercase
  assert.ok(!isValidMicrositeSlug("a/b")); // path-ish → would escape the route segment
  assert.ok(!isValidMicrositeSlug("a..b"));
  assert.ok(!isValidMicrositeSlug("s l u g"));
  assert.ok(!isValidMicrositeSlug("a".repeat(41))); // over maximum length
});
