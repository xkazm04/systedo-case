/** Direction 3 — durable status telemetry + percentiles. The pure stats helpers
 *  (telemetry-stats) that aggregateTelemetry + summarizeAiOps wire in: status
 *  derivation with the legacy default, status counts, success rate over real calls,
 *  and nearest-rank latency percentiles. Firestore-free. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countStatuses,
  emptyStatusCounts,
  entryStatus,
  isHealthyStatus,
  latencyPercentiles,
  percentile,
  successRate,
} from "@/lib/llm/telemetry-stats";

test("entryStatus: explicit status wins; legacy rows default by demo flag", () => {
  assert.equal(entryStatus({ status: "corrupt", demo: false }), "corrupt");
  assert.equal(entryStatus({ status: "error", demo: false }), "error");
  // legacy (no status): demo → "demo", otherwise "success"
  assert.equal(entryStatus({ demo: true }), "demo");
  assert.equal(entryStatus({ demo: false }), "success");
});

test("isHealthyStatus: success + repaired are healthy; corrupt/error/demo are not", () => {
  assert.equal(isHealthyStatus("success"), true);
  assert.equal(isHealthyStatus("repaired"), true);
  for (const s of ["corrupt", "error", "demo"]) assert.equal(isHealthyStatus(s), false, s);
});

test("countStatuses tallies by derived status (incl. legacy rows)", () => {
  const counts = countStatuses([
    { status: "success", demo: false },
    { status: "repaired", demo: false },
    { status: "corrupt", demo: false },
    { status: "error", demo: false },
    { status: "demo", demo: true },
    { demo: false }, // legacy → success
    { demo: true }, // legacy → demo
  ]);
  assert.deepEqual(counts, { success: 2, repaired: 1, corrupt: 1, error: 1, demo: 2 });
  // emptyStatusCounts is the zeroed shape
  assert.deepEqual(emptyStatusCounts(), { success: 0, repaired: 0, corrupt: 0, error: 0, demo: 0 });
});

test("successRate: healthy / real(non-demo); demo excluded; empty→1", () => {
  const rate = successRate([
    { status: "success", demo: false },
    { status: "repaired", demo: false },
    { status: "corrupt", demo: false }, // real but not healthy
    { status: "error", demo: false }, // real but not healthy
    { status: "demo", demo: true }, // excluded from denominator
  ]);
  assert.equal(rate, 0.5); // 2 healthy of 4 real
  assert.equal(successRate([{ status: "demo", demo: true }]), 1); // no real calls → vacuously 1
  assert.equal(successRate([]), 1);
});

test("percentile: nearest-rank; empty→0", () => {
  const xs = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  assert.equal(percentile(xs, 50), 50);
  assert.equal(percentile(xs, 95), 100);
  assert.equal(percentile([42], 50), 42);
  assert.equal(percentile([], 95), 0);
});

test("latencyPercentiles: over REAL calls only (demo latencies excluded)", () => {
  const entries = [
    { demo: false, tookMs: 100 },
    { demo: false, tookMs: 200 },
    { demo: false, tookMs: 900 },
    { status: "demo", demo: true, tookMs: 1 }, // excluded — would deflate p50
  ];
  const { p50TookMs, p95TookMs } = latencyPercentiles(entries);
  assert.equal(p50TookMs, 200);
  assert.equal(p95TookMs, 900);
  // No real calls → both 0.
  assert.deepEqual(latencyPercentiles([{ status: "demo", demo: true, tookMs: 5 }]), {
    p50TookMs: 0,
    p95TookMs: 0,
  });
});
