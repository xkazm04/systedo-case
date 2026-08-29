/** WP W1-D — the pure ads-performance-diagnosis request builder
 *  (src/lib/diagnoses/ads-request.ts): what counts as WASTED spend, which campaigns
 *  make the worst/best lists, the per-network split, the ADR-0010 mixed-currency
 *  rule (no cross-currency totals) and the prior window derived from a daily series.
 *  Pure — no store, no model. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

const {
  ADS_BEST_MAX,
  ADS_WORST_MAX,
  adsDiagnosisSubject,
  buildAdsDiagnosisRequest,
  hasAdsSignal,
  hasLivePlatform,
  platformOf,
  priorWindowTotals,
  wastedSpend,
} = await import("@/lib/diagnoses/ads-request");
const { withMetrics } = await import("@/lib/campaigns/types");

/** A raw campaign, metrics derived exactly as the console derives them. */
function row(over = {}) {
  return withMetrics({
    id: "c1",
    name: "Kampaň",
    type: "search",
    status: "enabled",
    impressions: 10_000,
    clicks: 500,
    cost: 10_000,
    conversions: 10,
    conversionValue: 100_000,
    source: "google-ads",
    ...over,
  });
}

const TARGET = 0.18;

// --- platform + signal predicates -------------------------------------------

test("platformOf never guesses a network for an unstamped or sample row", () => {
  assert.equal(platformOf("google-ads"), "google-ads");
  assert.equal(platformOf("sklik"), "sklik");
  assert.equal(platformOf("sample"), "sample");
  assert.equal(platformOf(undefined), "sample", "a pre-ADR-0010 row reads as sample, not Google");
});

test("hasAdsSignal / hasLivePlatform gate the digest arm honestly", () => {
  assert.equal(hasAdsSignal([{ cost: 0 }, { cost: 0 }]), false, "a synced-but-idle account has no signal");
  assert.equal(hasAdsSignal([{ cost: 0 }, { cost: 12 }]), true);
  assert.equal(hasLivePlatform([{ source: "sample" }, { source: undefined }]), false);
  assert.equal(hasLivePlatform([{ source: "sample" }, { source: "sklik" }]), true);
});

// --- wasted spend -------------------------------------------------------------

test("wastedSpend: all of a zero-conversion campaign's cost, only the excess above target otherwise", () => {
  assert.equal(wastedSpend({ cost: 5000, conversions: 0, conversionValue: 0 }, TARGET), 5000);
  // 10 000 spent against 100 000 of value: the target allows 18 000 → nothing wasted.
  assert.equal(wastedSpend({ cost: 10_000, conversions: 10, conversionValue: 100_000 }, TARGET), 0);
  // 30 000 spent against 100 000: the target allows 18 000 → 12 000 is unjustified.
  assert.equal(wastedSpend({ cost: 30_000, conversions: 10, conversionValue: 100_000 }, TARGET), 12_000);
  assert.equal(wastedSpend({ cost: 0, conversions: 0, conversionValue: 0 }, TARGET), 0, "no spend, no waste");
});

// --- selection ----------------------------------------------------------------

test("worst is ranked by wasted spend and capped; best is the healthiest by ROAS", () => {
  const rows = [
    row({ id: "burn", name: "PMax výprodej", cost: 40_000, conversions: 0, conversionValue: 0 }),
    row({ id: "over", name: "Konkurence", cost: 30_000, conversions: 10, conversionValue: 100_000 }),
    row({ id: "good", name: "Vlastní značka", cost: 8_000, conversions: 60, conversionValue: 240_000 }),
    row({ id: "ok2", name: "Bestsellery", cost: 9_000, conversions: 30, conversionValue: 90_000 }),
  ];
  const req = buildAdsDiagnosisRequest({ rows, currency: "CZK", targetPno: TARGET });
  assert.deepEqual(
    req.worst.map((c) => c.id),
    ["burn", "over"],
    "zero-conversion burn outranks the merely over-target campaign"
  );
  assert.ok(req.worst.length <= ADS_WORST_MAX);
  assert.deepEqual(req.best.map((c) => c.id), ["good", "ok2"], "best is ROAS-ordered");
  assert.ok(req.best.length <= ADS_BEST_MAX);
  assert.equal(
    req.best.some((c) => req.worst.some((w) => w.id === c.id)),
    false,
    "a campaign is never both the problem and the destination"
  );
});

test("a clean portfolio still yields one diagnosable subject (the least efficient spender)", () => {
  const rows = [
    row({ id: "a", cost: 5_000, conversions: 20, conversionValue: 100_000 }),
    row({ id: "b", cost: 9_000, conversions: 20, conversionValue: 100_000 }),
  ];
  const req = buildAdsDiagnosisRequest({ rows, currency: "CZK", targetPno: TARGET });
  assert.equal(req.worst.length, 1, "no waste → exactly one fallback subject");
  assert.equal(req.worst[0].id, "b", "the highest PNO of the two");
  assert.equal(adsDiagnosisSubject(req), req.worst[0].name);
});

test("no campaigns at all → nothing to diagnose", () => {
  assert.equal(buildAdsDiagnosisRequest({ rows: [], currency: "CZK" }), null);
});

// --- per-network split + the ADR-0010 currency rule ---------------------------

test("platforms[] reports each network separately, in precedence order", () => {
  const rows = [
    row({ id: "g1", cost: 10_000, source: "google-ads" }),
    row({ id: "s1", cost: 4_000, conversions: 2, conversionValue: 6_000, source: "sklik" }),
    row({ id: "g2", cost: 6_000, source: "google-ads" }),
  ];
  const req = buildAdsDiagnosisRequest({ rows, currency: "CZK", targetPno: TARGET });
  assert.deepEqual(
    req.platforms.map((p) => [p.platform, p.cost, p.campaigns]),
    [
      ["google-ads", 16_000, 2],
      ["sklik", 4_000, 1],
    ]
  );
});

test("mixed currency: totals cover the PRIMARY network alone, never a cross-currency sum", () => {
  const rows = [
    row({ id: "g1", cost: 10_000, conversions: 10, conversionValue: 50_000, source: "google-ads" }),
    row({ id: "s1", cost: 4_000, conversions: 2, conversionValue: 6_000, source: "sklik" }),
  ];
  const req = buildAdsDiagnosisRequest({
    rows,
    currency: "EUR",
    mixedCurrency: true,
    primaryPlatform: "google-ads",
    targetPno: TARGET,
  });
  assert.equal(req.mixedCurrency, true);
  assert.equal(req.totals.cost, 10_000, "the Sklik cost is NOT added to the Google cost");
  assert.equal(req.totals.conversionValue, 50_000);
  assert.equal(
    req.worst.concat(req.best).every((c) => c.platform === "google-ads"),
    true,
    "money-ranked picks stay inside the primary network"
  );
  assert.equal(req.platforms.length, 2, "both networks are still named, each with its own cost");
});

test("a single-currency project totals the whole portfolio (the union, ADR-0010)", () => {
  const rows = [
    row({ id: "g1", cost: 10_000, conversions: 10, conversionValue: 50_000, source: "google-ads" }),
    row({ id: "s1", cost: 4_000, conversions: 2, conversionValue: 6_000, source: "sklik" }),
  ];
  const req = buildAdsDiagnosisRequest({ rows, currency: "CZK", targetPno: TARGET });
  assert.equal(req.totals.cost, 14_000);
  assert.equal(req.totals.conversionValue, 56_000);
  assert.equal(req.period, "30d");
});

// --- change deltas + prior window ---------------------------------------------

test("the sync-over-sync diff threads per-campaign deltas; absent, no delta keys appear", () => {
  const rows = [row({ id: "burn", cost: 40_000, conversions: 0, conversionValue: 0 })];
  const withDiff = buildAdsDiagnosisRequest({
    rows,
    currency: "CZK",
    targetPno: TARGET,
    changesById: { burn: { campaignId: "burn", costDelta: 0.42, valueDelta: -0.3 } },
  });
  assert.equal(withDiff.worst[0].deltaCostPct, 0.42);
  assert.equal(withDiff.worst[0].deltaValuePct, -0.3);
  const without = buildAdsDiagnosisRequest({ rows, currency: "CZK", targetPno: TARGET });
  assert.equal("deltaCostPct" in without.worst[0], false, "no diff → no fabricated zero delta");
});

test("priorWindowTotals sums the PREVIOUS window, and refuses a series too short to have one", () => {
  const daily = Array.from({ length: 8 }, (_, i) => ({
    date: `2026-01-0${i + 1}`,
    cost: i < 4 ? 100 : 250,
    conversions: 1,
    revenue: i < 4 ? 1_000 : 2_000,
    visits: 0,
  }));
  assert.deepEqual(priorWindowTotals(daily, 4), { cost: 400, conversions: 4, conversionValue: 4_000 });
  assert.equal(priorWindowTotals(daily, 5), null, "less than two full windows → no baseline");
  assert.equal(priorWindowTotals(undefined, 30), null);
});

test("severity per campaign comes from the SAME triage the table badges use", () => {
  const rows = [row({ id: "burn", cost: 40_000, conversions: 0, conversionValue: 0 })];
  const req = buildAdsDiagnosisRequest({ rows, currency: "CZK", targetPno: TARGET });
  assert.equal(req.worst[0].severity, "critical", "spend with zero conversions is a critical row");
  assert.equal(req.targetPno, TARGET, "the tenant's agreed target rides the request");
});
