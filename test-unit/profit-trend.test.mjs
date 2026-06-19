/** Unit tests for the profit trend bucketing (#3). Runs the TS source directly
 *  via the shared resolve hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { profitTrend, retargetTrend, trendDelta } from "@/lib/profit/trend";

// One channel taking 100 % of every dimension keeps the bucket math trivial to
// reason about: bucket revenue = sum of the days, grossProfit = revenue × margin.
const channels = [
  {
    channel: "All",
    color: "#000",
    shares: { visits: 1, cost: 1, conversions: 1, revenue: 1 },
  },
];
const margins = [{ channel: "All", marginPct: 0.5 }];

/** Build `n` consecutive days starting at `start` with fixed metrics. */
function days(start, n, point) {
  const out = [];
  const base = new Date(`${start}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) {
    const d = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    out.push({ date: d, ...point });
  }
  return out;
}

test("profitTrend buckets daily series into weeks with net profit and POAS", () => {
  // 14 days → exactly two 7-day weekly buckets, anchored on the last day.
  const daily = days("2026-05-01", 14, { visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  const trend = profitTrend(daily, channels, margins, "week");

  assert.equal(trend.length, 2, "two weekly buckets");
  // Each week: revenue 7×1000=7000, cost 700, gross 7000×0.5=3500, net 2800.
  for (const b of trend) {
    assert.equal(b.revenue, 7000);
    assert.equal(b.cost, 700);
    assert.equal(b.grossProfit, 3500);
    assert.equal(b.netProfit, 2800);
    assert.equal(b.poas, 5); // 3500 / 700
  }
  // Oldest → newest ordering.
  assert.ok(trend[0].date < trend[1].date);
});

test("profitTrend buckets by calendar month", () => {
  const daily = [
    ...days("2026-04-01", 30, { visits: 10, cost: 100, conversions: 1, revenue: 1000 }),
    ...days("2026-05-01", 31, { visits: 10, cost: 100, conversions: 1, revenue: 1000 }),
  ];
  const trend = profitTrend(daily, channels, margins, "month");
  assert.equal(trend.length, 2);
  assert.equal(trend[0].label, "2026-04");
  assert.equal(trend[1].label, "2026-05");
  assert.equal(trend[0].revenue, 30_000);
  assert.equal(trend[1].revenue, 31_000);
});

test("retargetTrend re-applies a new margin without re-touching the daily series", () => {
  const daily = days("2026-05-01", 7, { visits: 100, cost: 100, conversions: 2, revenue: 1000 });
  const base = profitTrend(daily, channels, margins, "week");
  // Halve the margin → gross profit halves, POAS halves.
  const retargeted = retargetTrend(base, channels, [{ channel: "All", marginPct: 0.25 }]);
  assert.equal(retargeted.length, base.length);
  assert.equal(retargeted[0].grossProfit, base[0].grossProfit / 2);
  assert.equal(retargeted[0].poas, base[0].poas / 2);
  // retargeting with the SAME margins reproduces the server compute exactly.
  const same = retargetTrend(base, channels, margins);
  assert.equal(same[0].netProfit, base[0].netProfit);
  assert.equal(same[0].poas, base[0].poas);
});

test("trendDelta is the relative change between the last two buckets", () => {
  const points = [
    { date: "2026-05-01", label: "a", revenue: 0, cost: 0, grossProfit: 0, netProfit: 100, poas: 2 },
    { date: "2026-05-08", label: "b", revenue: 0, cost: 0, grossProfit: 0, netProfit: 150, poas: 3 },
  ];
  assert.equal(trendDelta(points, "netProfit"), 0.5); // 100 → 150 = +50 %
  assert.equal(trendDelta(points, "poas"), 0.5);
  assert.equal(trendDelta([], "netProfit"), 0);
  assert.equal(trendDelta([points[0]], "netProfit"), 0);
});

test("profitTrend returns empty for an empty series", () => {
  assert.deepEqual(profitTrend([], channels, margins, "week"), []);
});
