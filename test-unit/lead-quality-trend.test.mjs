/** Unit tests for the period-over-period drift watch: per-source CPQL /
 *  qualification / win-rate deltas + the threshold alert rule (CPQL rise >25 %
 *  or over target). Runs the TS source via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sourceTrend,
  trendBySource,
  sourceAlerts,
  periodAlerts,
  CPQL_ALERT_RISE,
  CPQL_TARGET_CZK,
} from "@/lib/lead-quality/compute";

const EPS = 1e-9;

// A source whose CPQL jumps sharply: spend up, qualification down period-over-period.
// prev CPQL = 70000 / 158 ≈ 443; now CPQL = 96000 / 130 ≈ 738 → +66 %.
const drifting = {
  source: "Meta lead formuláře",
  leads: 540,
  qualified: 130,
  won: 14,
  spend: 96_000,
  revenue: 470_000,
  prior: { leads: 470, qualified: 158, won: 18, spend: 70_000 },
};

// A stable source: counts and spend essentially flat → no alert.
const stable = {
  source: "Google Ads – Search",
  leads: 320,
  qualified: 198,
  won: 41,
  spend: 142_000,
  revenue: 1_640_000,
  prior: { leads: 300, qualified: 192, won: 40, spend: 132_000 },
};

// Unpaid source with prior data — CPQL undefined, so CPQL delta/alerts are skipped.
const unpaid = {
  source: "Organic",
  leads: 140,
  qualified: 110,
  won: 38,
  spend: 0,
  revenue: 1_520_000,
  prior: { leads: 120, qualified: 95, won: 30, spend: 0 },
};

// No prior period at all.
const noPrior = { source: "Sklik", leads: 180, qualified: 92, won: 16, spend: 58_000, revenue: 560_000 };

test("sourceTrend computes relative deltas for CPQL, qualification and win rate", () => {
  const t = sourceTrend(drifting);
  assert.ok(t);
  assert.equal(t.paid, true);

  const cpqlNow = 96_000 / 130;
  const cpqlPrev = 70_000 / 158;
  assert.ok(Math.abs(t.cpqlNow - cpqlNow) < EPS);
  assert.ok(Math.abs(t.cpqlPrev - cpqlPrev) < EPS);
  assert.ok(Math.abs(t.cpqlDelta - (cpqlNow - cpqlPrev) / cpqlPrev) < EPS);
  assert.ok(t.cpqlDelta > CPQL_ALERT_RISE); // > 25 % rise

  const qrNow = 130 / 540;
  const qrPrev = 158 / 470;
  assert.ok(Math.abs(t.qualRateDelta - (qrNow - qrPrev) / qrPrev) < EPS);
  assert.ok(t.qualRateDelta < 0); // qualification got worse

  const wrNow = 14 / 130;
  const wrPrev = 18 / 158;
  assert.ok(Math.abs(t.winRateDelta - (wrNow - wrPrev) / wrPrev) < EPS);
});

test("sourceTrend returns null when there is no prior period", () => {
  assert.equal(sourceTrend(noPrior), null);
});

test("sourceTrend marks an unpaid source as not-paid with a null CPQL delta", () => {
  const t = sourceTrend(unpaid);
  assert.ok(t);
  assert.equal(t.paid, false);
  assert.equal(t.cpqlDelta, null); // CPQL meaningless without spend
  assert.ok(t.qualRateDelta !== null); // rate deltas still computed
});

test("trendBySource keeps only sources that carry prior data, in order", () => {
  const ts = trendBySource([drifting, noPrior, stable]);
  assert.equal(ts.length, 2);
  assert.deepEqual(ts.map((t) => t.source), ["Meta lead formuláře", "Google Ads – Search"]);
});

test("sourceAlerts flags a >25 % CPQL rise (drift warning)", () => {
  const alerts = sourceAlerts(sourceTrend(drifting));
  const rise = alerts.find((a) => a.kind === "cpql-rise");
  assert.ok(rise, "expected a cpql-rise alert");
  assert.equal(rise.severity, "warning");
  assert.equal(rise.source, "Meta lead formuláře");
  assert.match(rise.message, /vzrostlo/);
});

test("sourceAlerts does NOT flag a stable source", () => {
  // prev CPQL = 132000/192 ≈ 688, now = 142000/198 ≈ 717 → +4 %, under threshold and target.
  const t = sourceTrend(stable);
  assert.ok(t.cpqlDelta < CPQL_ALERT_RISE);
  const alerts = sourceAlerts(t);
  assert.equal(alerts.length, 0);
});

test("sourceAlerts raises a critical alert when CPQL exceeds the target", () => {
  // Force CPQL over target while keeping the rise modest.
  const overTarget = {
    source: "Expensive",
    leads: 200,
    qualified: 40,
    won: 6,
    spend: 80_000, // CPQL = 2000 > target
    revenue: 300_000,
    prior: { leads: 190, qualified: 41, won: 6, spend: 78_000 }, // prev CPQL ≈ 1902 → +5 %
  };
  const t = sourceTrend(overTarget);
  assert.ok(t.cpqlNow > CPQL_TARGET_CZK);
  assert.ok(t.cpqlDelta < CPQL_ALERT_RISE); // not a drift, only a target breach
  const alerts = sourceAlerts(t);
  assert.equal(alerts.filter((a) => a.kind === "cpql-rise").length, 0);
  const target = alerts.find((a) => a.kind === "cpql-target");
  assert.ok(target);
  assert.equal(target.severity, "critical");
  assert.match(target.message, /překračuje cíl/);
});

test("sourceAlerts honours an overridden rise threshold + target", () => {
  const t = sourceTrend(drifting);
  // Raise the threshold above the actual rise → no drift alert; lower target → breach.
  const alerts = sourceAlerts(t, { riseThreshold: 1, targetCzk: 100 });
  assert.equal(alerts.filter((a) => a.kind === "cpql-rise").length, 0);
  assert.equal(alerts.filter((a) => a.kind === "cpql-target").length, 1);
});

test("sourceAlerts ignores unpaid sources entirely", () => {
  assert.deepEqual(sourceAlerts(sourceTrend(unpaid)), []);
});

test("periodAlerts aggregates alerts across sources in order", () => {
  const alerts = periodAlerts([stable, drifting, unpaid, noPrior]);
  // Only the drifting source produces an alert here.
  assert.ok(alerts.length >= 1);
  assert.ok(alerts.every((a) => a.source === "Meta lead formuláře"));
});
