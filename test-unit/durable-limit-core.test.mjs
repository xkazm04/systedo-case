/** Unit tests for the durable AI abuse guard's pure decision logic
 *  (src/lib/ai/durable-limit-core.ts). durableGuard itself does Firestore I/O and
 *  can't run in the unit sandbox, but it delegates EVERY decision to these pure
 *  helpers — so this is where the fixed-window reset, retry-after math, and the
 *  global ceiling are actually pinned. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  windowStartFor,
  currentCount,
  retryAfterFor,
  ceilingExceeded,
  secondsUntilUtcMidnight,
  rateDocId,
} from "@/lib/ai/durable-limit-core";

const MIN = 60_000;
const rule = (limit, windowMs = MIN) => ({ bucket: "ai:min", limit, windowMs });

test("windowStartFor aligns now down to the window boundary", () => {
  const now = 1_000_000_000_000; // arbitrary fixed instant
  const ws = windowStartFor(rule(8), now);
  assert.equal(ws, now - (now % MIN));
  assert.equal(now - ws < MIN, true, "within one window of now");
  assert.equal(ws % MIN, 0, "aligned to the minute grid");
});

test("currentCount keeps the stored count only within the same window, else resets", () => {
  const now = 5 * MIN; // window start = 5*MIN
  const ws = windowStartFor(rule(8), now);
  // stored in the current window → counts
  assert.equal(currentCount({ windowStart: ws, count: 3 }, ws), 3);
  // stored in an earlier window → resets to 0 (fixed-window forgetting)
  assert.equal(currentCount({ windowStart: ws - MIN, count: 7 }, ws), 0);
  // missing doc / missing fields → 0
  assert.equal(currentCount(undefined, ws), 0);
  assert.equal(currentCount({}, ws), 0);
  assert.equal(currentCount({ windowStart: ws }, ws), 0, "no count field → 0");
});

test("retryAfterFor returns whole seconds to the window close, at least 1", () => {
  const now = 10 * MIN + 30_000; // 30s into the window
  const ws = windowStartFor(rule(8), now);
  assert.equal(retryAfterFor(ws, rule(8), now), 30, "30s left in the minute window");
  // right at the boundary the remainder rounds up to the 1s floor, never 0
  const atClose = ws + MIN;
  assert.equal(retryAfterFor(ws, rule(8), atClose), 1, "floored to 1s, never 0");
});

test("ceilingExceeded gates on used+units vs ceiling and treats 0 as disabled", () => {
  assert.equal(ceilingExceeded(1999, 1, 2000), false, "exactly at the limit is allowed");
  assert.equal(ceilingExceeded(2000, 1, 2000), true, "one over the limit is refused");
  assert.equal(ceilingExceeded(1998, 3, 2000), true, "a multi-unit charge that overshoots is refused");
  assert.equal(ceilingExceeded(10_000, 5, 0), false, "ceiling 0 disables the check");
  assert.equal(ceilingExceeded(10_000, 5, -1), false, "negative ceiling disables the check");
});

test("secondsUntilUtcMidnight measures to the next UTC day boundary", () => {
  // 2026-07-02T23:59:00Z → 60s to midnight
  const nearMidnight = Date.UTC(2026, 6, 2, 23, 59, 0);
  assert.equal(secondsUntilUtcMidnight(nearMidnight), 60);
  // exactly midnight → a full day to the *next* midnight
  const midnight = Date.UTC(2026, 6, 2, 0, 0, 0);
  assert.equal(secondsUntilUtcMidnight(midnight), 86_400);
  // one second before midnight floors up to 1, never 0
  const oneBefore = Date.UTC(2026, 6, 2, 23, 59, 59, 500);
  assert.equal(secondsUntilUtcMidnight(oneBefore), 1);
});

test("rateDocId joins bucket + ip, strips slashes, and bounds the length", () => {
  assert.equal(rateDocId("ai:min", "1.2.3.4"), "ai:min__1.2.3.4");
  assert.equal(rateDocId("ai/day", "1.2.3.4").includes("/"), false, "slash replaced (never a nested path)");
  assert.equal(rateDocId("ai:min", "x".repeat(5000)).length <= 1400, true, "id bounded under the Firestore limit");
});
