/** The week planner's bounded-concurrency pool (src/lib/social/plan-pool.ts).
 *
 *  planWeek used to serialize up to 28 round-trips (7 sequential AI drafts, each
 *  followed by its post saves). The pool runs topics PLAN_CONCURRENCY(=2)-wide —
 *  small on purpose: the server's generation semaphore is 4-wide across ALL users,
 *  so one browser must not hog it. These tests pin the pool's contracts (bound
 *  respected, fail-fast stops launching, results indexed by item not completion
 *  order) and produce the simulated before/after wall-time evidence for a 7-topic
 *  plan. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./json-loader.mjs", import.meta.url);

let runPool;
let PLAN_CONCURRENCY;

before(async () => {
  const pool = await import("@/lib/social/plan-pool");
  runPool = pool.runPool;
  // PLAN_CONCURRENCY lives in the client hook; pin the chosen bound here so a
  // future bump is a conscious decision against the shared 4-wide semaphore.
  PLAN_CONCURRENCY = 2;
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("respects the concurrency bound (never more in flight than the limit)", async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await runPool([1, 2, 3, 4, 5, 6, 7], PLAN_CONCURRENCY, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await sleep(10);
    inFlight--;
    return n * 2;
  });
  assert.equal(peak, PLAN_CONCURRENCY);
  assert.equal(out.failed, false);
  assert.deepEqual(out.results, [2, 4, 6, 8, 10, 12, 14]); // indexed by item
  assert.deepEqual(out.succeeded, [0, 1, 2, 3, 4, 5, 6]);
});

test("fail-fast: a rejection stops LAUNCHING but in-flight work settles", async () => {
  const started = [];
  const out = await runPool([0, 1, 2, 3, 4, 5, 6], 2, async (n, i) => {
    started.push(i);
    await sleep(5);
    if (i === 1) throw new Error("429");
    return i;
  });
  assert.equal(out.failed, true);
  assert.ok(out.errors[1] instanceof Error);
  // the tail was never launched (fail-fast mirrors the serial loop's early break)
  assert.ok(out.launched < 7, `launched ${out.launched} of 7 after the failure`);
  assert.ok(!started.includes(6), "task 6 must not start after task 1 failed");
  // whatever completed is reported — the caller keeps exactly the failed/unrun lines
  for (const i of out.succeeded) assert.equal(out.results[i], i);
  assert.ok(!out.succeeded.includes(1));
});

test("empty input resolves immediately", async () => {
  const out = await runPool([], 2, async () => 1);
  assert.deepEqual(out, { results: [], errors: [], succeeded: [], failed: false, launched: 0 });
});

test("wall-time evidence: a 7-topic plan at width 2 vs the old serial loop", async () => {
  // Simulated latencies: ~40ms per topic (draft + its saves folded into one task).
  const TOPICS = 7;
  const LATENCY = 40;
  const task = async () => {
    await sleep(LATENCY);
    return true;
  };

  const t0 = performance.now();
  await runPool(Array(TOPICS).fill(0), 1, task); // the old serial behavior
  const serialMs = performance.now() - t0;

  const t1 = performance.now();
  await runPool(Array(TOPICS).fill(0), PLAN_CONCURRENCY, task);
  const pooledMs = performance.now() - t1;

  // Theoretical: serial = 7 waves (~280ms), width 2 = ceil(7/2) = 4 waves (~160ms).
  // Assert a real improvement with slack for timer jitter, and report the numbers.
  assert.ok(
    pooledMs < serialMs * 0.75,
    `expected ≥25% wall-time cut; serial=${serialMs.toFixed(0)}ms pooled=${pooledMs.toFixed(0)}ms`
  );
  console.log(
    `[plan-pool timing] 7 topics × ${LATENCY}ms: serial=${serialMs.toFixed(0)}ms, ` +
      `width ${PLAN_CONCURRENCY}=${pooledMs.toFixed(0)}ms (${((1 - pooledMs / serialMs) * 100).toFixed(0)}% faster)`
  );
});
