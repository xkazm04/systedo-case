/** Unit tests for the new pure Audience helpers: revenue-mix shares + HHI,
 *  sponsorship rate-card range, the growth/RPM trend projection and the
 *  goal-progress tracker. Runs the TS source directly via the shared resolve
 *  hook (node --import ./test-llm/setup.mjs --test). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audienceSummary,
  goalProgress,
  rateCard,
  revenueMix,
  trend,
  DEPENDENCY_THRESHOLD,
} from "@/lib/audience/compute";
import {
  SAMPLE_FUNNEL,
  SAMPLE_GOALS,
  SAMPLE_REVENUE,
  SAMPLE_RPM_HISTORY,
  SAMPLE_SEGMENTS,
  SAMPLE_SUBSCRIBER_HISTORY,
} from "@/lib/audience/sample";

// ── #3 revenueMix ────────────────────────────────────────────────────────────

test("revenueMix: shares sum to ~1, sorted desc, HHI + diversification consistent", () => {
  const mix = revenueMix([
    { source: "B", amount: 200 },
    { source: "A", amount: 600 },
    { source: "C", amount: 200 },
  ]);
  // sorted by share desc → A (0.6), then B/C (0.2 each, stable)
  assert.deepEqual(
    mix.rows.map((r) => r.source),
    ["A", "B", "C"]
  );
  const sum = mix.rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9, `shares sum to ${sum}`);
  assert.equal(mix.total, 1000);
  assert.ok(Math.abs(mix.concentration - 0.6) < 1e-9);
  assert.equal(mix.topStream.source, "A");
  // HHI = 0.6² + 0.2² + 0.2² = 0.36 + 0.04 + 0.04 = 0.44
  assert.ok(Math.abs(mix.hhi - 0.44) < 1e-9, `hhi ${mix.hhi}`);
  assert.ok(Math.abs(mix.diversification - 0.56) < 1e-9);
});

test("revenueMix: a single stream gives HHI=1, diversification=0 and trips dependency", () => {
  const mix = revenueMix([{ source: "Solo", amount: 5000 }]);
  assert.ok(Math.abs(mix.hhi - 1) < 1e-9);
  assert.equal(mix.diversification, 0);
  assert.equal(mix.concentration, 1);
  assert.equal(mix.concentrated, true);
});

test("revenueMix: clamps negative amounts and is empty-safe", () => {
  const mix = revenueMix([
    { source: "Good", amount: 100 },
    { source: "Refund", amount: -40 },
  ]);
  // negative clamped to 0 → Good carries everything
  assert.equal(mix.total, 100);
  assert.ok(Math.abs(mix.concentration - 1) < 1e-9);

  const empty = revenueMix([]);
  assert.deepEqual(empty.rows, []);
  assert.equal(empty.total, 0);
  assert.equal(empty.topStream, null);
  assert.equal(empty.hhi, 0);
  assert.equal(empty.diversification, 0);
  assert.equal(empty.concentrated, false);
});

test("revenueMix: sample tips into the dependency warning (sponsoring dominates)", () => {
  const mix = revenueMix(SAMPLE_REVENUE);
  const sum = mix.rows.reduce((a, r) => a + r.share, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  // top stream is the largest by amount
  const largest = [...SAMPLE_REVENUE].sort((a, b) => b.amount - a.amount)[0];
  assert.equal(mix.topStream.source, largest.source);
  assert.equal(mix.concentrated, mix.concentration > DEPENDENCY_THRESHOLD);
});

// ── #2 rateCard ──────────────────────────────────────────────────────────────

test("rateCard: price range is opens-per-send × CPM band, mid is the average", () => {
  const funnel = { visitors: 0, subscribers: 0, activeSubscribers: 10_000 };
  const segments = [
    { name: "S1", subscribers: 6000, openRate: 0.5, rpm: 0 },
    { name: "S2", subscribers: 4000, openRate: 0.25, rpm: 0 },
  ];
  // blended open rate = (0.5*6000 + 0.25*4000)/10000 = 4000/10000 = 0.4
  // opens/send = 10000 * 0.4 = 4000 → per-1000 = 4
  const c = rateCard(funnel, segments, { cpmFloor: 100, cpmCeil: 200 });
  assert.ok(Math.abs(c.blendedOpenRate - 0.4) < 1e-9);
  assert.ok(Math.abs(c.opensPerSend - 4000) < 1e-9);
  assert.ok(Math.abs(c.priceFloor - 400) < 1e-9); // 4 * 100
  assert.ok(Math.abs(c.priceCeil - 800) < 1e-9); // 4 * 200
  assert.ok(Math.abs(c.priceMid - 600) < 1e-9);
  // price per 1000 opens at mid = 600/4000*1000 = 150 (band midpoint)
  assert.ok(Math.abs(c.pricePer1000Opens - 150) < 1e-9);
  assert.ok(c.priceFloor <= c.priceCeil);
});

test("rateCard: per-segment premium is openRate vs. blended, sorted desc", () => {
  const funnel = { visitors: 0, subscribers: 0, activeSubscribers: 10_000 };
  const segments = [
    { name: "High", subscribers: 5000, openRate: 0.6, rpm: 0 },
    { name: "Low", subscribers: 5000, openRate: 0.2, rpm: 0 },
  ];
  const c = rateCard(funnel, segments, { cpmFloor: 100, cpmCeil: 200 });
  // blended = 0.4 → High premium = 0.6/0.4-1 = +0.5, Low = 0.2/0.4-1 = -0.5
  assert.deepEqual(
    c.segments.map((s) => s.name),
    ["High", "Low"]
  );
  assert.ok(Math.abs(c.segments[0].premium - 0.5) < 1e-9);
  assert.ok(Math.abs(c.segments[1].premium + 0.5) < 1e-9);
});

test("rateCard: zero reach / no segments yields a safe zeroed card (no NaN)", () => {
  const c = rateCard({ visitors: 0, subscribers: 0, activeSubscribers: 0 }, [], {
    cpmFloor: 100,
    cpmCeil: 200,
  });
  assert.equal(c.opensPerSend, 0);
  assert.equal(c.priceFloor, 0);
  assert.equal(c.priceCeil, 0);
  assert.equal(c.pricePer1000Opens, 0);
  assert.deepEqual(c.segments, []);
});

test("rateCard: sample produces a sane, ordered price band", () => {
  const c = rateCard(SAMPLE_FUNNEL, SAMPLE_SEGMENTS, { cpmFloor: 280, cpmCeil: 520 });
  assert.ok(c.priceFloor > 0);
  assert.ok(c.priceCeil > c.priceFloor);
  assert.ok(c.opensPerSend > 0 && c.opensPerSend <= SAMPLE_FUNNEL.activeSubscribers);
});

// ── #4 trend ─────────────────────────────────────────────────────────────────

test("trend: MoM growth, moving average and forecast on a clean linear ramp", () => {
  const t = trend([100, 110, 120, 130]);
  assert.equal(t.latest, 130);
  assert.equal(t.previous, 120);
  // MoM = 130/120-1
  assert.ok(Math.abs(t.momGrowth - (130 / 120 - 1)) < 1e-9);
  // 3-mo MA of tail [110,120,130] = 120
  assert.ok(Math.abs(t.movingAvg3 - 120) < 1e-9);
  // perfect +10 ramp → slope 10, forecast = next point = 140
  assert.ok(Math.abs(t.slope - 10) < 1e-9);
  assert.ok(Math.abs(t.forecast - 140) < 1e-9);
});

test("trend: short / empty series are NaN-safe", () => {
  const empty = trend([]);
  assert.equal(empty.latest, 0);
  assert.equal(empty.momGrowth, null);
  assert.equal(empty.forecast, 0);

  const one = trend([42]);
  assert.equal(one.latest, 42);
  assert.equal(one.previous, null);
  assert.equal(one.momGrowth, null);
  assert.equal(one.movingAvg3, 42);
  assert.equal(one.forecast, 42);
});

test("trend: a zero previous value avoids dividing by zero (null MoM)", () => {
  const t = trend([0, 50]);
  assert.equal(t.momGrowth, null);
  // slope still defined: rises 50 over one step → forecast 100
  assert.ok(Math.abs(t.forecast - 100) < 1e-9);
});

test("trend: sample histories project upward", () => {
  const subs = trend(SAMPLE_SUBSCRIBER_HISTORY.map((p) => p.value));
  assert.ok(subs.slope > 0);
  assert.ok(subs.forecast > subs.latest);
  const rpm = trend(SAMPLE_RPM_HISTORY.map((p) => p.value));
  assert.ok(rpm.slope > 0);
});

// ── #5 goalProgress ──────────────────────────────────────────────────────────

test("goalProgress: % to target, remaining gap and a compounding ETA", () => {
  const funnel = { visitors: 0, subscribers: 200, activeSubscribers: 100 };
  const summary = audienceSummary(funnel, [{ source: "x", amount: 1000 }]);
  const gp = goalProgress(
    funnel,
    summary,
    { subscriberTarget: 400, monthlyRevenueTarget: 2000 },
    0.1 // +10 %/mo
  );
  assert.ok(Math.abs(gp.subscribers.progress - 0.5) < 1e-9);
  assert.equal(gp.subscribers.remaining, 200);
  assert.equal(gp.subscribers.met, false);
  // ETA: 200·1.1^t ≥ 400 → t = ln2/ln1.1 ≈ 7.27 → ceil 8
  assert.equal(gp.subscribers.etaMonths, 8);
  assert.equal(gp.revenue.met, false);
});

test("goalProgress: a met target reports met, no ETA, capped remaining", () => {
  const funnel = { visitors: 0, subscribers: 500, activeSubscribers: 300 };
  const summary = audienceSummary(funnel, [{ source: "x", amount: 5000 }]);
  const gp = goalProgress(
    funnel,
    summary,
    { subscriberTarget: 400, monthlyRevenueTarget: 1000 },
    0.05
  );
  assert.equal(gp.subscribers.met, true);
  assert.equal(gp.subscribers.remaining, 0);
  assert.equal(gp.subscribers.etaMonths, null);
  assert.ok(gp.subscribers.progress >= 1);
});

test("goalProgress: zero / negative growth yields no ETA but still a progress %", () => {
  const funnel = { visitors: 0, subscribers: 100, activeSubscribers: 60 };
  const summary = audienceSummary(funnel, [{ source: "x", amount: 500 }]);
  const gp = goalProgress(
    funnel,
    summary,
    { subscriberTarget: 1000, monthlyRevenueTarget: 5000 },
    0 // flat → unreachable
  );
  assert.equal(gp.subscribers.etaMonths, null);
  assert.ok(Math.abs(gp.subscribers.progress - 0.1) < 1e-9);
});

test("goalProgress: sample fixtures are coherent (progress in range, ETA when growing)", () => {
  const summary = audienceSummary(SAMPLE_FUNNEL, SAMPLE_REVENUE);
  const subTrend = trend(SAMPLE_SUBSCRIBER_HISTORY.map((p) => p.value));
  const gp = goalProgress(SAMPLE_FUNNEL, summary, SAMPLE_GOALS, subTrend.momGrowth ?? 0);
  assert.ok(gp.subscribers.progress > 0 && gp.subscribers.progress < 1);
  // sample is growing, so the subscriber ETA should be a positive month count
  assert.ok(gp.subscribers.etaMonths != null && gp.subscribers.etaMonths > 0);
});
