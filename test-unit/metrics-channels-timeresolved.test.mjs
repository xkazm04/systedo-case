/** Unit tests for the time-resolved channel mix (Direction 2): with a per-day
 *  channel breakdown, channelRowsCompared computes REAL per-channel deltas and a
 *  revenue-share shift; without it, it falls back to the static projection where
 *  every channel's revenue delta equals the aggregate (byte-identical legacy path).
 *  Runs the TS source via the shared resolve hook (node --import ./test-llm/setup.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMetricsSnapshot,
  channelRowsCompared,
  evaluatePeriod,
  resolveChannelTime,
  SNAPSHOT_SCHEMA_VERSION,
} from "@/lib/metrics";

const CHANNELS = [
  { channel: "A", color: "#111", shares: { visits: 0.5, cost: 0.5, conversions: 0.5, revenue: 0.5 } },
  { channel: "B", color: "#222", shares: { visits: 0.5, cost: 0.5, conversions: 0.5, revenue: 0.5 } },
];

/** 8 days of constant totals; A's share of every dimension steps 0.5 → 0.7 at the
 *  window boundary (B is the complement), so the AGGREGATE is flat but the MIX moves. */
function fixture() {
  const daily = [];
  const channelDaily = [];
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  for (let i = 0; i < 8; i++) {
    const date = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date, visits: 100, cost: 100, conversions: 10, revenue: 1000 });
    const aShare = i < 4 ? 0.5 : 0.7; // early windows vs recent windows
    const dims = (s) => ({ visits: s, cost: s, conversions: s, revenue: s });
    channelDaily.push({ date, shares: [dims(aShare), dims(1 - aShare)] });
  }
  return { daily, channelDaily };
}

test("static path (no per-day mix): every channel's revenue delta equals the aggregate", () => {
  const { daily } = fixture();
  const res = evaluatePeriod(daily, 4, "previous");
  // Aggregate is flat (constant totals), so the aggregate revenue delta is 0.
  assert.equal(res.delta.revenue, 0);
  const rows = channelRowsCompared(CHANNELS, res.current, res.previous); // no timeResolved
  for (const row of rows) {
    assert.equal(row.delta.revenue, 0, `${row.channel} should mirror the aggregate`);
    assert.equal(row.revenueShareDelta, undefined, "static path carries no share move");
  }
});

test("time-resolved path: per-channel deltas are real and diverge; share shift surfaces", () => {
  const { daily, channelDaily } = fixture();
  const res = evaluatePeriod(daily, 4, "previous");
  const tr = resolveChannelTime(CHANNELS.length, channelDaily, res.points, res.comparePoints);
  assert.ok(tr, "windows are fully covered → time-resolved");
  const rows = channelRowsCompared(CHANNELS, res.current, res.previous, tr);
  const a = rows.find((r) => r.channel === "A");
  const b = rows.find((r) => r.channel === "B");

  // A grew 0.5→0.7 of a flat 4000 window: 2000 → 2800 (+40 %); B shrank symmetrically.
  assert.ok(Math.abs(a.delta.revenue - 0.4) < 1e-9, "A revenue +40 %");
  assert.ok(Math.abs(b.delta.revenue + 0.4) < 1e-9, "B revenue −40 %");
  // The deltas DIVERGE — the whole point vs the static path.
  assert.notEqual(a.delta.revenue, b.delta.revenue);
  // Revenue SHARE moved +0.20 for A, −0.20 for B (percentage points).
  assert.ok(Math.abs(a.revenueShareDelta - 0.2) < 1e-9, "A share +0.20");
  assert.ok(Math.abs(b.revenueShareDelta + 0.2) < 1e-9, "B share −0.20");
});

test("resolveChannelTime declines when the mix is absent or doesn't cover the windows", () => {
  const { daily, channelDaily } = fixture();
  const res = evaluatePeriod(daily, 4, "previous");
  assert.equal(resolveChannelTime(2, undefined, res.points, res.comparePoints), undefined);
  assert.equal(resolveChannelTime(2, [], res.points, res.comparePoints), undefined);
  // Wrong channel arity → not usable.
  assert.equal(resolveChannelTime(3, channelDaily, res.points, res.comparePoints), undefined);
  // A gap in coverage → decline (drop one date).
  const gapped = channelDaily.slice(1);
  assert.equal(resolveChannelTime(2, gapped, res.points, res.comparePoints), undefined);
});

test("schema bump: legacy dataset (no channelDaily) reads at v5 with static channels", () => {
  assert.equal(SNAPSHOT_SCHEMA_VERSION, 5);
  const daily = [];
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  for (let i = 0; i < 16; i++) {
    const date = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    daily.push({ date, visits: 100 + i, cost: 100, conversions: 10, revenue: 1000 + i * 10 });
  }
  const goals = { pno: 0.15, monthlyRevenue: 100000 };
  const legacy = { channels: CHANNELS, daily, goals }; // NO channelDaily
  const snap = buildMetricsSnapshot(legacy, { key: "8", label: "8", days: 8 });
  assert.equal(snap.schemaVersion, 5);
  assert.ok(snap.channels.length > 0);
  for (const row of snap.channels) {
    assert.ok(row.delta, "static rows still carry a delta");
    assert.equal(row.revenueShareDelta, undefined, "legacy path never fabricates a share move");
  }

  // The SAME dataset with a per-day mix now carries a real share move.
  const channelDaily = daily.map((p, i) => {
    const s = i < 8 ? 0.5 : 0.72;
    const dims = (x) => ({ visits: x, cost: x, conversions: x, revenue: x });
    return { date: p.date, shares: [dims(s), dims(1 - s)] };
  });
  const resolved = buildMetricsSnapshot({ ...legacy, channelDaily }, { key: "8", label: "8", days: 8 });
  assert.ok(
    resolved.channels.some((r) => typeof r.revenueShareDelta === "number" && r.revenueShareDelta !== 0),
    "time-resolved snapshot surfaces a share move"
  );
});
