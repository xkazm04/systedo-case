/** Unit tests for the diminishing-returns response curve (WP W1-F): the log-log fit,
 *  its evidence gates, the clamped evaluation band, and the per-channel derivation.
 *  Runs the TS source directly via the shared resolve hook
 *  (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CURVE_B_RANGE,
  CURVE_EXTRAPOLATION,
  CURVE_MIN_POINTS,
  CURVE_MIN_R2,
  channelCurves,
  fitResponseCurve,
  marginalPoas,
  marginalRoas,
  revenueAt,
} from "@/lib/metrics/response-curve";

const approx = (a, b, eps = 1e-6) =>
  assert.ok(Math.abs(a - b) <= eps, `expected ${a} ≈ ${b}`);

/** `n` synthetic days on an exact power law revenue = a · spend^b. */
const powerPoints = (a, b, n, spend0 = 100, stepSpend = 10) =>
  Array.from({ length: n }, (_, i) => {
    const spend = spend0 + i * stepSpend;
    return { spend, revenue: a * Math.pow(spend, b) };
  });

test("fitResponseCurve recovers a and b exactly on synthetic a·spend^b data", () => {
  const c = fitResponseCurve(powerPoints(120, 0.6, 30), "channel");
  assert.equal(c.fitted, true);
  approx(c.b, 0.6, 1e-9);
  approx(c.a, 120, 1e-6);
  approx(c.r2, 1, 1e-9);
  assert.equal(c.n, 30);
  assert.equal(c.spendMin, 100);
  assert.equal(c.spendMax, 100 + 29 * 10);
  assert.equal(c.basis, "channel");
});

test("no diminishing returns (b ≥ 1) is rejected, not clamped down to 1", () => {
  // Constant returns: exactly the model the app already has. A "curve" here would only
  // swap the arithmetic ROAS for the fit's geometric one and call the swap a curve.
  const linear = fitResponseCurve(powerPoints(4, 1, 30), "channel");
  assert.equal(linear.fitted, false);
  assert.equal(linear.b, 1);
  assert.ok(linear.r2 > 0.99, "the fit itself is excellent — it is simply not curved");
  // Increasing returns would recommend infinite budget; also rejected.
  const hot = fitResponseCurve(powerPoints(3, 1.4, 30), "channel");
  assert.equal(hot.fitted, false);
  assert.equal(hot.b, 1);
  // Anything genuinely below 1 survives.
  const curved = fitResponseCurve(powerPoints(120, 0.95, 30), "channel");
  assert.equal(curved.fitted, true);
  assert.ok(curved.b < CURVE_B_RANGE[1]);
});

test("fitResponseCurve clamps a too-flat elasticity up to CURVE_B_RANGE[0]", () => {
  // "Spend barely matters" (b = 0.05) is a broken series, not an account — clamped up.
  const flat = fitResponseCurve(powerPoints(5000, 0.05, 30), "channel");
  assert.equal(flat.fitted, true);
  assert.equal(flat.b, CURVE_B_RANGE[0]);
  assert.equal(flat.b, 0.2);
  // A clamped slope still passes through the middle of the data.
  assert.ok(flat.a > 0);
});

test("fitResponseCurve refuses a fit below CURVE_MIN_POINTS and falls back to linear", () => {
  const pts = powerPoints(120, 0.6, CURVE_MIN_POINTS - 1);
  const c = fitResponseCurve(pts, "channel");
  assert.equal(c.fitted, false);
  assert.equal(c.b, 1);
  assert.equal(c.n, CURVE_MIN_POINTS - 1);
  // a = trailing ROAS of the observed days.
  const spend = pts.reduce((s, p) => s + p.spend, 0);
  const revenue = pts.reduce((s, p) => s + p.revenue, 0);
  approx(c.a, revenue / spend, 1e-9);
});

test("fitResponseCurve refuses a fit whose r² is below the gate", () => {
  // Revenue that wobbles deterministically but owes nothing to spend: no shape to trust.
  const pts = Array.from({ length: 40 }, (_, i) => ({
    spend: 100 + i * 10,
    revenue: 5000 + 2000 * Math.sin(i * 2.399),
  }));
  const c = fitResponseCurve(pts, "channel");
  assert.equal(c.fitted, false);
  assert.ok(c.r2 < CURVE_MIN_R2, `r² ${c.r2} should be below the ${CURVE_MIN_R2} gate`);
  assert.equal(c.b, 1);
  assert.equal(c.n, 40);

  // A revenue column that never moves explains nothing either.
  const flatRevenue = fitResponseCurve(
    Array.from({ length: 40 }, (_, i) => ({ spend: 100 + i * 10, revenue: 5000 })),
    "channel"
  );
  assert.equal(flatRevenue.fitted, false);
  assert.equal(flatRevenue.r2, 0);
});

test("fitResponseCurve refuses degenerate spend and survives NaN/∞ input", () => {
  // Every day the same spend → no slope information.
  const flat = fitResponseCurve(
    Array.from({ length: 40 }, () => ({ spend: 500, revenue: 4000 })),
    "channel"
  );
  assert.equal(flat.fitted, false);

  // Non-finite / non-positive rows are dropped before the log.
  const dirty = [
    ...powerPoints(120, 0.6, 30),
    { spend: Number.NaN, revenue: 1000 },
    { spend: 100, revenue: Number.POSITIVE_INFINITY },
    { spend: -50, revenue: 900 },
    { spend: 0, revenue: 0 },
  ];
  const c = fitResponseCurve(dirty, "channel");
  assert.equal(c.n, 30);
  assert.equal(c.fitted, true);
  assert.ok(Number.isFinite(c.a) && Number.isFinite(c.b) && Number.isFinite(c.r2));

  // Nothing at all is a linear zero curve, not a crash.
  const empty = fitResponseCurve([], "channel");
  assert.equal(empty.fitted, false);
  assert.equal(empty.n, 0);
  assert.equal(empty.a, 0);
  assert.equal(revenueAt(empty, 1000), 0);
});

test("revenueAt is monotone, zero at zero spend, and flat past the extrapolation bound", () => {
  const c = fitResponseCurve(powerPoints(120, 0.6, 30), "channel");
  assert.equal(revenueAt(c, 0), 0);
  assert.equal(revenueAt(c, -100), 0);
  let prev = -1;
  for (let s = 0; s <= c.spendMax * 3; s += 25) {
    const v = revenueAt(c, s);
    assert.ok(v >= prev, `revenueAt must not decrease at spend ${s}`);
    prev = v;
  }
  const edge = c.spendMax * CURVE_EXTRAPOLATION;
  approx(revenueAt(c, edge * 10), revenueAt(c, edge), 1e-9);
  approx(revenueAt(c, 400), 120 * Math.pow(400, 0.6), 1e-6);
});

test("marginalRoas falls with spend for b < 1 and is constant for b = 1", () => {
  const dim = fitResponseCurve(powerPoints(120, 0.6, 30), "channel");
  const at200 = marginalRoas(dim, 200);
  const at400 = marginalRoas(dim, 400);
  assert.ok(at400 < at200, "diminishing returns must lower the marginal ROAS");
  approx(at200, 120 * 0.6 * Math.pow(200, -0.4), 1e-9);

  // b = 1 never survives the fit, so build the constant-returns curve directly: its
  // marginal ROAS is the constant `a`, i.e. exactly the pre-existing linear model.
  const linear = { ...dim, a: 4, b: 1 };
  approx(marginalRoas(linear, 150), marginalRoas(linear, 900), 1e-9);
  approx(marginalRoas(linear, 150), 4, 1e-6);
});

test("the slope is read inside the observed band only", () => {
  const c = fitResponseCurve(powerPoints(120, 0.6, 30), "channel");
  // Below spendMin the derivative is held at the edge, so a starved channel gets a
  // large but FINITE marginal return instead of the power law's infinity at 0.
  const atZero = marginalRoas(c, 0);
  assert.ok(Number.isFinite(atZero) && atZero > 0);
  approx(atZero, marginalRoas(c, c.spendMin), 1e-12);
  // Above the extrapolation bound it is held at the edge too.
  const edge = c.spendMax * CURVE_EXTRAPOLATION;
  approx(marginalRoas(c, edge * 5), marginalRoas(c, edge), 1e-12);
});

test("marginalPoas is the margin-aware marginal, and NaN-safe", () => {
  const c = fitResponseCurve(powerPoints(120, 0.6, 30), "channel");
  approx(marginalPoas(c, 300, 0.5), marginalRoas(c, 300) * 0.5 - 1, 1e-12);
  assert.ok(Number.isFinite(marginalPoas(c, 300, Number.NaN)));
  assert.equal(marginalPoas(c, 300, Number.NaN), -1);
});

test("channelCurves fits each channel on its own days when channelDaily is present", () => {
  const daily = powerPoints(200, 0.7, 40).map((p, i) => ({
    date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`,
    visits: 0,
    cost: p.spend,
    conversions: 0,
    revenue: p.revenue,
  }));
  const channels = [
    { channel: "Ads", color: "#111", shares: { visits: 0.5, cost: 0.5, conversions: 0.5, revenue: 0.6 } },
    { channel: "Organic", color: "#222", shares: { visits: 0.5, cost: 0, conversions: 0.5, revenue: 0.4 } },
  ];
  const channelDaily = daily.map((d) => ({
    date: d.date,
    shares: [
      { visits: 0.5, cost: 0.5, conversions: 0.5, revenue: 0.6 },
      { visits: 0.5, cost: 0, conversions: 0.5, revenue: 0.4 },
    ],
  }));

  const curves = channelCurves(daily, channels, channelDaily);
  assert.equal(curves.Ads.basis, "channel");
  assert.equal(curves.Ads.fitted, true);
  approx(curves.Ads.b, 0.7, 1e-9);
  // The channel's own spend band, not the account's.
  approx(curves.Ads.spendMax, daily[daily.length - 1].cost * 0.5, 1e-9);
  // A channel with no spend has no marginal koruna to price.
  assert.equal(curves.Organic.fitted, false);
  assert.equal(curves.Organic.n, 0);
});

test("channelCurves falls back to the account curve re-based on static shares", () => {
  const daily = powerPoints(200, 0.7, 40).map((p, i) => ({
    date: `2026-03-${String(i + 1).padStart(2, "0")}`,
    visits: 0,
    cost: p.spend,
    conversions: 0,
    revenue: p.revenue,
  }));
  const channels = [
    { channel: "Ads", color: "#111", shares: { visits: 0.5, cost: 0.4, conversions: 0.5, revenue: 0.6 } },
    { channel: "Organic", color: "#222", shares: { visits: 0.5, cost: 0, conversions: 0.5, revenue: 0.4 } },
  ];

  const curves = channelCurves(daily, channels);
  const ads = curves.Ads;
  assert.equal(ads.basis, "account-scaled");
  assert.equal(ads.fitted, true);
  approx(ads.b, 0.7, 1e-9);
  // a_channel = a_account · revenueShare / costShare^b — so the channel's own curve
  // reproduces its share of the account's revenue at its share of the account's spend.
  approx(ads.a, (200 * 0.6) / Math.pow(0.4, 0.7), 1e-6);
  approx(revenueAt(ads, 400 * 0.4), 0.6 * 200 * Math.pow(400, 0.7), 1e-6);
  approx(ads.spendMax, daily[daily.length - 1].cost * 0.4, 1e-9);
  // Zero spend share → unfitted, and the UI must not claim a curve for it.
  assert.equal(curves.Organic.fitted, false);
  assert.equal(curves.Organic.basis, "account-scaled");
});
