/** Integration readiness compute (src/lib/integrations/compute.ts): status
 *  derivation from provisioning flags + the summary rollup. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeIntegrationRows, statusSummary } from "@/lib/integrations/compute";

const NONE = {
  googleAdsToken: false, googleAdsCustomer: false, googleOAuth: false,
  gemini: false, resend: false, cron: false,
  firestore: false, localDb: false, devAuth: false,
  lighttrack: false, social: false, leonardo: false, adsLinked: false,
  byomValidated: false, warehouse: false,
};

const rowById = (rows, id) => rows.find((r) => r.id === id);

test("Google Ads: missing platform → missing; platform but unlinked → action; linked → connected", () => {
  assert.equal(rowById(computeIntegrationRows(NONE), "google-ads").status, "missing");
  const platform = { ...NONE, googleAdsToken: true, googleAdsCustomer: true, googleOAuth: true };
  assert.equal(rowById(computeIntegrationRows(platform), "google-ads").status, "action");
  assert.equal(rowById(computeIntegrationRows({ ...platform, adsLinked: true }), "google-ads").status, "connected");
});

test("AI/LLM: server key present → connected, else action (BYOM fallback)", () => {
  assert.equal(rowById(computeIntegrationRows(NONE), "ai-llm").status, "action");
  assert.equal(rowById(computeIntegrationRows({ ...NONE, gemini: true }), "ai-llm").status, "connected");
});

test("AI/LLM: a validated BYOM key connects even without a server key", () => {
  assert.equal(rowById(computeIntegrationRows({ ...NONE, byomValidated: true }), "ai-llm").status, "connected");
});

test("warehouse probe: connected when present, optional when absent", () => {
  assert.equal(rowById(computeIntegrationRows(NONE), "warehouse").status, "optional");
  assert.equal(rowById(computeIntegrationRows({ ...NONE, warehouse: true }), "warehouse").status, "connected");
});

test("persistence: connected on firestore OR local db, else missing", () => {
  assert.equal(rowById(computeIntegrationRows(NONE), "persistence").status, "missing");
  assert.equal(rowById(computeIntegrationRows({ ...NONE, localDb: true }), "persistence").status, "connected");
  assert.equal(rowById(computeIntegrationRows({ ...NONE, firestore: true }), "persistence").status, "connected");
});

test("auth: oauth → connected; dev-auth only → action; neither → missing", () => {
  assert.equal(rowById(computeIntegrationRows({ ...NONE, googleOAuth: true }), "auth").status, "connected");
  assert.equal(rowById(computeIntegrationRows({ ...NONE, devAuth: true }), "auth").status, "action");
  assert.equal(rowById(computeIntegrationRows(NONE), "auth").status, "missing");
});

test("static statuses: sklik manual, gbp planned, lighttrack optional when off", () => {
  const rows = computeIntegrationRows(NONE);
  assert.equal(rowById(rows, "sklik").status, "manual");
  assert.equal(rowById(rows, "gbp").status, "planned");
  assert.equal(rowById(rows, "lighttrack").status, "optional");
});

test("rows are grouped by category order and summary tallies them", () => {
  const rows = computeIntegrationRows(NONE);
  const order = ["ads", "ai", "content", "reviews", "reports", "infra"];
  let last = -1;
  for (const r of rows) {
    const idx = order.indexOf(r.category);
    assert.ok(idx >= last, "categories out of order");
    last = idx;
  }
  const s = statusSummary(rows);
  assert.equal(Object.values(s).reduce((a, b) => a + b, 0), rows.length);
});
