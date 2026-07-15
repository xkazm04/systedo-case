/** The slow bleed, unified onto the engine's ONE variance-gated decline detector
 *  (Direction 1). detectSlowBleed now bridges the campaign's daily series into a
 *  weekly ROAS series and delegates the verdict to metrics.detectWeeklyRun — the
 *  same walk detectTrends uses. A clean sustained decline still triages `warning`
 *  and the badge is byte-identical; every non-firing shape stays silent; and where
 *  the old crude rule and the new gated one disagree, the gated verdict wins (the
 *  two divergence cases below pin both directions of the disagreement). */
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

/** The pre-gate crude rule, kept here verbatim so the divergence tests can prove
 *  what the OLD implementation would have decided: ≥3 full weeks, ≥25% net ROAS
 *  loss first→last, and no week rebounding >5% above its predecessor. No variance,
 *  no de-seasonalisation — exactly the implementation Direction 1 replaced. */
function crudeSlowBleed(points) {
  if (!points || points.length < 3 * 7) return null;
  const asc = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const weeks = Math.floor(asc.length / 7);
  if (weeks < 3) return null;
  const used = asc.slice(asc.length - weeks * 7);
  const roasByWeek = [];
  for (let w = 0; w < weeks; w++) {
    let c = 0;
    let v = 0;
    for (let i = 0; i < 7; i++) {
      const p = used[w * 7 + i];
      c += Number(p.cost) || 0;
      v += Number(p.conversionValue) || 0;
    }
    if (c <= 0) return null;
    roasByWeek.push(v / c);
  }
  const from = roasByWeek[0];
  const to = roasByWeek[roasByWeek.length - 1];
  if (from <= 0) return null;
  if (to > from * 0.75) return null;
  for (let i = 1; i < roasByWeek.length; i++) {
    if (roasByWeek[i] > roasByWeek[i - 1] * 1.05) return null;
  }
  return { weeks, roasFrom: from, roasTo: to };
}

/** Build a noisy daily series whose WEEKLY ROAS equals `weeklyBase[w]` exactly
 *  (each week's daily factors are a rotation of a fixed pattern summing to 7), but
 *  whose DAILY ROAS swings hard — non-weekday-periodic, so de-seasonalisation can't
 *  cancel it and the variance-gate sees real day-to-day noise. */
function noisySeries(weeklyBase) {
  const PATTERN = [1.6, 0.4, 1.6, 0.4, 1.6, 0.4, 1.0]; // Σ = 7
  const dailyCost = 1000;
  const points = [];
  let day = 0;
  weeklyBase.forEach((base, week) => {
    for (let i = 0; i < 7; i++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const f = PATTERN[(i + week) % 7]; // rotate the pattern one weekday per week
      points.push({ date, cost: dailyCost, conversionValue: dailyCost * base * f });
      day++;
    }
  });
  return points;
}

// --- firing case (byte-identical to the crude rule where they agree) --------

test("a sustained multi-week decline is detected with the week count", () => {
  // 5 weeks sliding 5× → 4.5 → 4.0 → 3.5 → 3.0 (−40% cumulative, monotonic).
  const bleed = detectSlowBleed(series([5, 4.5, 4, 3.5, 3]));
  assert.ok(bleed, "bleed detected");
  assert.equal(bleed.weeks, 5);
  assert.equal(bleed.roasFrom, 5);
  assert.equal(bleed.roasTo, 3);
  // A clean slide is exactly where crude and gated agree — same badge numbers.
  assert.deepEqual(crudeSlowBleed(series([5, 4.5, 4, 3.5, 3])), {
    weeks: 5,
    roasFrom: 5,
    roasTo: 3,
  });
});

// --- divergence: the gated verdict wins -------------------------------------

test("DIVERGENCE (false positive): a noisy series the crude rule reads as a bleed, the gate suppresses", () => {
  // Weekly ROAS drifts 5.0 → 4.7 → 4.4 → 4.1 → 3.7 (−26%, monotonic, no rebound),
  // so the crude rule fires. But the daily ROAS swings ±60% (weekday-driven noise
  // that de-seasonalisation can't remove), so no weekly move clears the noise floor
  // — the gated detector honestly can't call it a decline.
  const noisy = noisySeries([5.0, 4.7, 4.4, 4.1, 3.7]);
  assert.ok(crudeSlowBleed(noisy), "crude rule would have fired");
  assert.equal(detectSlowBleed(noisy), null, "gated detector stays silent");
});

test("DIVERGENCE (false negative): a real decline with a within-noise blip the crude rule threw away, the gate keeps", () => {
  // A tiny early rebound (8.0 → 8.5, +6.25% > the crude 5% tolerance) made the old
  // rule discard the whole series. The recent slide 8.5 → 6 → 4 → 2 is a clear,
  // beyond-noise decline reaching "now", so the gated detector correctly fires.
  const s = series([8, 8.5, 6, 4, 2]);
  assert.equal(crudeSlowBleed(s), null, "crude rule bows out on the early rebound");
  const bleed = detectSlowBleed(s);
  assert.ok(bleed, "gated detector catches the recent slide");
  assert.equal(bleed.weeks, 4); // run of 3 down-moves spans 4 buckets
  assert.equal(bleed.roasFrom, 8.5);
  assert.equal(bleed.roasTo, 2);
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

test("recovering: a late rebound means the run to 'now' points up, not down", () => {
  // Declines then recovers in the final week (+50%): the most recent move is up, so
  // the down-run reaching "now" is empty → silent.
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
