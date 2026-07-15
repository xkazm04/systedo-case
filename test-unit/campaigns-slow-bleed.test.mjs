/** Direction 2 — the slow bleed gets a name (src/lib/campaigns/triage.ts).
 *  A deterministic multi-week ROAS-slope rule fed entirely by the campaign's
 *  existing daily series: a sustained decline triages as `warning`, while every
 *  non-firing shape (insufficient history, volatile-but-flat, recovering, a
 *  no-spend week) stays silent — and existing rules are byte-identical when the
 *  new rule doesn't fire. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, TARGET_ROAS } from "@/lib/campaigns/types";
import {
  detectSlowBleed,
  triage,
  SLOW_BLEED_MIN_WEEKS,
  SLOW_BLEED_WEEK_DAYS,
} from "@/lib/campaigns/triage";

/** Build a daily series (ascending dates from 2026-01-01) whose per-week ROAS
 *  follows `weeklyRoas`, at a constant weekly spend. Each week is 7 equal days. */
function series(weeklyRoas, { weeklyCost = 7000 } = {}) {
  const dailyCost = weeklyCost / SLOW_BLEED_WEEK_DAYS;
  const points = [];
  let day = 0;
  for (const roas of weeklyRoas) {
    for (let i = 0; i < SLOW_BLEED_WEEK_DAYS; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      points.push({ date, cost: dailyCost, conversionValue: dailyCost * roas });
      day++;
    }
  }
  return points;
}

// --- firing case ------------------------------------------------------------

test("a sustained multi-week decline is detected with the week count", () => {
  // 5 weeks sliding 5× → 4.5 → 4.0 → 3.5 → 3.0 (−40% cumulative, monotonic).
  const bleed = detectSlowBleed(series([5, 4.5, 4, 3.5, 3]));
  assert.ok(bleed, "bleed detected");
  assert.equal(bleed.weeks, 5);
  assert.equal(bleed.roasFrom, 5);
  assert.equal(bleed.roasTo, 3);
});

test("a mostly-down series with a small wobble still fires (monotonic-ish)", () => {
  // Tiny 2% up-tick in week 3 (below the 5% rebound tolerance), net −30%.
  const bleed = detectSlowBleed(series([5, 4.2, 4.28, 3.6, 3.5]));
  assert.ok(bleed, "small sub-tolerance wobble tolerated");
});

// --- non-firing cases -------------------------------------------------------

test("insufficient history: fewer than the minimum weeks stays silent", () => {
  const shortSeries = series([5, 3]); // 2 weeks < MIN_WEEKS
  assert.ok(shortSeries.length < SLOW_BLEED_MIN_WEEKS * SLOW_BLEED_WEEK_DAYS);
  assert.equal(detectSlowBleed(shortSeries), null);
  assert.equal(detectSlowBleed([]), null);
  assert.equal(detectSlowBleed(undefined), null);
});

test("volatile-but-flat: oscillation with no net loss does not fire", () => {
  assert.equal(detectSlowBleed(series([5, 3.5, 5, 3.5, 5])), null);
});

test("recovering: a late rebound above tolerance is not a bleed", () => {
  // Declines then recovers in the final week (+50% > tolerance) → silent.
  assert.equal(detectSlowBleed(series([5, 4, 3, 4.5])), null);
});

test("a net drop that is too shallow (< 25%) does not fire", () => {
  // 5 → 4 is −20%, below the 25% floor.
  assert.equal(detectSlowBleed(series([5, 4.6, 4.3, 4])), null);
});

test("a week with no spend is ambiguous → silent, never a divide-by-zero", () => {
  const pts = series([5, 4, 3]);
  // Zero out the middle week's spend/value.
  for (let i = SLOW_BLEED_WEEK_DAYS; i < SLOW_BLEED_WEEK_DAYS * 2; i++) {
    pts[i].cost = 0;
    pts[i].conversionValue = 0;
  }
  assert.equal(detectSlowBleed(pts), null);
});

// --- triage integration + byte-identity -------------------------------------

function healthyRow() {
  // Comfortably above target so NO snapshot rule fires — isolating the slow-bleed.
  const cost = 10_000;
  return withMetrics({
    id: "c1",
    name: "Search · Test",
    type: "search",
    status: "enabled",
    impressions: 100_000,
    clicks: 2_000,
    cost,
    conversions: 40,
    conversionValue: Math.round(cost * TARGET_ROAS * 1.2),
  });
}

test("triage stays warning-level and byte-identical without a series", () => {
  const row = healthyRow();
  const bleeding = series([5, 4.5, 4, 3.5, 3]);

  // No history → healthy, byte-identical to the pre-history call.
  assert.deepEqual(triage(row, undefined, undefined, undefined), triage(row));
  assert.equal(triage(row).severity, "ok");

  // With the bleeding series → a warning carrying the slow_bleed reason.
  const t = triage(row, undefined, undefined, bleeding);
  assert.equal(t.severity, "warning");
  assert.equal(t.primary?.id, "slow_bleed");
  assert.match(t.primary.detail, /posledních 5 týdnů/);

  // A flat series leaves the row byte-identical to no-history (rule silent).
  assert.deepEqual(triage(row, undefined, undefined, series([5, 5, 5, 5])), triage(row));
});
