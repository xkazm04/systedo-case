/** Self-hosted installs are unmetered (docs/open-source/impact.md Gap 5): every
 *  meter resolves unlimited and nothing reads or writes a usage/ratelimit row.
 *  These suites run with SELF_HOSTED=true and NO Firestore credentials — so any
 *  code path that still touched the store would throw or fall back visibly.
 *  Env is set BEFORE the dynamic imports (LOCAL_DB stays off, proving the
 *  self-host predicate carries the behaviour on its own). */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.SELF_HOSTED = "true";
delete process.env.LOCAL_DB;

const { consume, getUsage, getUserPlan, refund, byomUnlocked } = await import("@/lib/usage");
const { durableGuard, peekDurableRemaining, peekGlobalSpend, refundGlobalSpend, chargeGlobalSpend } =
  await import("@/lib/ai/durable-limit");

test("consume grants every charge without a Firestore transaction", async () => {
  const one = await consume("self-host-operator", "aiEval");
  assert.equal(one.ok, true);
  // even a charge far beyond the free plan's daily cap is granted
  const bulk = await consume("self-host-operator", "image", 10_000);
  assert.equal(bulk.ok, true);
});

test("getUsage / getUserPlan serve a local status, store untouched", async () => {
  const usage = await getUsage("self-host-operator");
  assert.equal(usage.plan, "free"); // informational only — consume() never refuses
  assert.deepEqual(usage.used, { aiEval: 0, sync: 0, image: 0 });
  assert.equal(await getUserPlan("self-host-operator"), "free");
});

test("refund is a no-op (nothing was ever charged)", async () => {
  await refund("self-host-operator", "aiEval", 5); // must not throw on missing ADC
});

test("BYOM is unconditionally unlocked — it is the only model path in self-host", () => {
  assert.equal(byomUnlocked("free"), true);
  assert.equal(byomUnlocked("pro"), true);
  assert.equal(byomUnlocked("byom"), true);
});

test("durableGuard early-returns ok even against a rule that would always refuse", async () => {
  const rules = [{ bucket: "test-zero", limit: 0, windowMs: 60_000 }];
  // limit 0 refuses on both the Firestore path and the local sqlite fallback —
  // ok:true here proves the self-host early return, not a fallback.
  const res = await durableGuard("198.51.100.7", rules, { spendUnits: 3 });
  assert.deepEqual(res, { ok: true, retryAfter: 0 });
});

test("peeks report full windows and a disabled ceiling; spend compensators are no-ops", async () => {
  const rules = [
    { bucket: "test-a", limit: 8, windowMs: 60_000 },
    { bucket: "test-b", limit: 80, windowMs: 86_400_000 },
  ];
  assert.deepEqual(await peekDurableRemaining("198.51.100.7", rules), [8, 80]);
  assert.deepEqual(await peekGlobalSpend(), { used: 0, ceiling: 0 });
  await refundGlobalSpend(5); // must not throw, must not touch Firestore
  await chargeGlobalSpend(5);
});
