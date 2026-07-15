/** Direction 2 — significance stops overselling ratios (src/lib/metrics/series.ts).
 *  Additive-metric significance is byte-identical to the old two-sample daily z;
 *  the rate ratios (CTR, CR) now use a proper two-proportion z on their underlying
 *  counts; and the value ratios (PNO/ROAS/AOV/CPC) report an honest "orientational"
 *  read instead of a manufactured confidence badge. Includes cases where the old
 *  daily-ratio verdict and the new one differ. Runs the TS source via the shared
 *  resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluatePeriod } from "@/lib/metrics/series";

/** Build a daily series (dates ascending from `start`) from explicit per-day rows,
 *  defaulting every additive field to 0 so a row need only set what it exercises. */
function days(start, rows) {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  return rows.map((r, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    visits: 0,
    cost: 0,
    conversions: 0,
    revenue: 0,
    ...r,
  }));
}

/** The OLD significance: a two-sample z over daily values (sample variance). Kept
 *  here so the divergence tests can prove what the pre-fix code would have said. */
function oldTwoSampleZ(a, b) {
  const mv = (xs) => {
    const n = xs.length;
    const m = n ? xs.reduce((s, x) => s + x, 0) / n : 0;
    const v = n < 2 ? 0 : xs.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1);
    return { m, v, n };
  };
  const A = mv(a);
  const B = mv(b);
  if (A.n < 2 || B.n < 2) return "noise";
  const se = Math.sqrt(A.v / A.n + B.v / B.n);
  if (!(se > 0)) return A.m === B.m ? "noise" : "strong";
  const z = Math.abs(A.m - B.m) / se;
  return z >= 2 ? "strong" : z >= 1 ? "weak" : "noise";
}

// --- additive metrics stay byte-identical (pinned) --------------------------

test("additive-metric significance is unchanged (still the two-sample daily z)", () => {
  const rows = [];
  for (let i = 0; i < 10; i++) rows.push({ visits: 100 + (i % 2), cost: 500, conversions: 5, revenue: 1000 });
  for (let i = 0; i < 10; i++) rows.push({ visits: 100 + (i % 2), cost: 500 + (i % 2) * 3, conversions: 5, revenue: 1600 });
  const daily = days("2026-01-01", rows);
  const r = evaluatePeriod(daily, 10, "previous");
  const cur = daily.slice(10);
  const prev = daily.slice(0, 10);
  for (const key of ["visits", "cost", "conversions", "revenue", "profit"]) {
    const get = key === "profit" ? (p) => p.revenue - p.cost : (p) => p[key];
    assert.equal(r.significance[key], oldTwoSampleZ(cur.map(get), prev.map(get)), `${key} unchanged`);
  }
  // A clear, zero-variance revenue lift is (and stays) strong.
  assert.equal(r.significance.revenue, "strong");
});

// --- CTR / CR: sound two-proportion tests -----------------------------------

test("CTR uses a two-proportion z on counts — not the unsound daily-ratio z (divergence)", () => {
  // 3 vs 3 days at a flat CTR: previous 11%, current 10%. The daily-ratio method
  // sees zero within-window variance and (means differ) overclaims "strong"; the
  // proportion test on just 300 impressions/window correctly reads "noise".
  const mk = (clicks) => ({ visits: 100, cost: 100, conversions: 5, revenue: 500, impressions: 100, clicks });
  const daily = days("2026-02-01", [mk(11), mk(11), mk(11), mk(10), mk(10), mk(10)]);
  const r = evaluatePeriod(daily, 3, "previous");
  assert.equal(oldTwoSampleZ([0.1, 0.1, 0.1], [0.11, 0.11, 0.11]), "strong", "old method oversells");
  assert.equal(r.significance.ctr, "noise", "proportion test is honest at tiny n");
});

test("CTR proportion test flags a real rate shift when the sample is large", () => {
  const mk = (clicks) => ({ visits: 1000, cost: 100, conversions: 5, revenue: 500, impressions: 10_000, clicks });
  const daily = days("2026-03-01", [mk(1100), mk(1100), mk(1100), mk(1000), mk(1000), mk(1000)]);
  const r = evaluatePeriod(daily, 3, "previous");
  assert.equal(r.significance.ctr, "strong");
});

test("CR uses a two-proportion z on conversions/visits (divergence at tiny n)", () => {
  const mk = (conversions) => ({ visits: 100, cost: 100, conversions, revenue: 500, impressions: 1000, clicks: 50 });
  const daily = days("2026-05-01", [mk(6), mk(6), mk(6), mk(5), mk(5), mk(5)]);
  const r = evaluatePeriod(daily, 3, "previous");
  assert.equal(oldTwoSampleZ([0.05, 0.05, 0.05], [0.06, 0.06, 0.06]), "strong", "old method oversells");
  assert.equal(r.significance.cr, "noise");
});

// --- value ratios: orientational, never a confidence badge ------------------

test("value ratios (PNO/ROAS/AOV/CPC) report an orientational read, not confidence", () => {
  const mk = (cost) => ({ visits: 100, cost, conversions: 10, revenue: 1000, impressions: 1000, clicks: 50 });
  // Cost doubles across the window — a large, obvious ROAS/PNO/CPC move — yet the
  // engine refuses to attach a significance badge to a value ratio.
  const daily = days("2026-04-01", [mk(100), mk(100), mk(100), mk(200), mk(200), mk(200)]);
  const r = evaluatePeriod(daily, 3, "previous");
  for (const key of ["roas", "pno", "aov", "cpc"]) {
    assert.equal(r.significance[key], "orientational", `${key} orientational`);
  }
});
