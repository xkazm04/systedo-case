/** What the pacing card may SAY about the implied extra daily spend. Two states used to
 *  read as something they are not: a curve answer that hit the 3× ceiling was quoted as
 *  "≈ +X/day" (the ceiling is a floor on the answer, not an estimate of it), and a
 *  shortfall with no ad return in the trailing window (no spend, or spend with no revenue)
 *  priced to 0 and fell into the "the current pace is enough" wording while the tile
 *  itself said behind. `impliedSpendNote` is the one place the card reads its wording from.
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { impliedSpendNote, monthlyPacing } from "@/lib/metrics/pacing";

function days(start, n, point) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    out.push({ date: new Date(base + i * 86_400_000).toISOString().slice(0, 10), ...point });
  }
  return out;
}

/** 56 flat days ending 2026-05-14: 100 Kč/day spend, 1000 Kč/day revenue, ROAS 10×. */
const flatSeries = (over = {}) =>
  days("2026-03-20", 56, { visits: 100, cost: 100, conversions: 2, revenue: 1000, ...over });

/** revenue = 100·√spend, through today's (100, 1000). */
const curve = () => ({
  a: 100, b: 0.5, fitted: true, n: 40, r2: 0.85, spendMin: 50, spendMax: 400, basis: "account-scaled",
});

test("a curve answer below the ceiling is an estimate", () => {
  const p = monthlyPacing(flatSeries(), 40_000, undefined, curve());
  assert.equal(p.impliedCapped, false);
  assert.equal(impliedSpendNote(p), "approx");
});

test("a curve answer AT the ceiling is a lower bound, never '≈'", () => {
  const p = monthlyPacing(flatSeries(), 1_000_000, undefined, curve());
  assert.equal(p.impliedExtraDailySpend, 300);
  assert.equal(p.impliedCapped, true);
  assert.equal(impliedSpendNote(p), "at-least");
});

test("the average basis is never capped", () => {
  const p = monthlyPacing(flatSeries(), 1_000_000);
  assert.equal(p.impliedBasis, "average");
  assert.equal(p.impliedCapped, false);
  assert.equal(impliedSpendNote(p), "approx");
});

test("a shortfall with no spend in the window is UNKNOWN, not 'pace is enough'", () => {
  const p = monthlyPacing(flatSeries({ cost: 0 }), 40_000, undefined, curve());
  assert.ok(p.requiredDailyRevenue > p.recentDailyRevenue, "fixture must be behind pace");
  assert.equal(p.impliedExtraDailySpend, 0);
  assert.equal(p.impliedBasis, "unknown");
  assert.equal(impliedSpendNote(p), "unknown");
});

test("a shortfall with spend but no attributed revenue in the window is UNKNOWN", () => {
  // Revenue only before the trailing 28 days, spend throughout: ROAS in the window is 0.
  const daily = flatSeries().map((p, i) => (i >= 28 ? { ...p, revenue: 0 } : p));
  const p = monthlyPacing(daily, 40_000);
  assert.ok(p.requiredDailyRevenue > p.recentDailyRevenue, "fixture must be behind pace");
  assert.equal(p.impliedBasis, "unknown");
  assert.equal(impliedSpendNote(p), "unknown");
});

test("on pace: nothing is implied and the note says so, whatever the spend", () => {
  for (const daily of [flatSeries(), flatSeries({ cost: 0 })]) {
    const p = monthlyPacing(daily, 20_000, undefined, curve());
    assert.equal(p.impliedExtraDailySpend, 0);
    assert.equal(impliedSpendNote(p), "none");
  }
});

test("a complete month implies nothing", () => {
  const p = monthlyPacing(days("2026-04-01", 30, { visits: 1, cost: 100, conversions: 1, revenue: 1000 }), 1_000_000);
  assert.equal(p.complete, true);
  assert.equal(impliedSpendNote(p), "none");
});
