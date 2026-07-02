/** Unit tests for the anonymous abuse guards (src/lib/ai/rate-limit.ts) — the
 *  only budget protection on the public, paid LLM endpoints. Covers the pure
 *  helpers (no DB) plus the fixed-window rateLimit() against the real node:sqlite
 *  store, using isolated bucket/ip values and cleaning up after itself. */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  clientIp,
  tooLarge,
  acquireSlot,
  releaseSlot,
  tooManyRequests,
  payloadTooLarge,
  rateLimit,
} from "@/lib/ai/rate-limit";
import { getDb } from "@/lib/db";

const req = (headers) => new Request("https://x.test/api", { headers });

// ---- clientIp: x-forwarded-for spoof resistance (the load-bearing guard) ----

test("clientIp prefers the platform's verified connecting-IP header over XFF", () => {
  assert.equal(clientIp(req({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" })), "9.9.9.9");
  assert.equal(
    clientIp(req({ "x-vercel-forwarded-for": "8.8.8.8", "x-forwarded-for": "1.1.1.1" })),
    "8.8.8.8"
  );
});

test("clientIp reads XFF from the RIGHT, ignoring client-prepended entries", () => {
  // With the default 1 trusted hop, the trusted proxy appends the real client as
  // the LAST entry; anything to its left is attacker-controlled and must be ignored.
  assert.equal(clientIp(req({ "x-forwarded-for": "5.5.5.5" })), "5.5.5.5");
  assert.equal(clientIp(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "2.2.2.2");
  assert.equal(clientIp(req({ "x-forwarded-for": "evil1, evil2, 3.3.3.3" })), "3.3.3.3");
});

test("clientIp trims whitespace and falls back to a shared bucket when unknown", () => {
  assert.equal(clientIp(req({ "x-forwarded-for": "  1.1.1.1 , 2.2.2.2  " })), "2.2.2.2");
  assert.equal(clientIp(req({ "x-real-ip": "  7.7.7.7  " })), "7.7.7.7");
  assert.equal(clientIp(req({})), "unknown");
  assert.equal(clientIp(req({ "x-forwarded-for": "" })), "unknown");
});

// ---- tooLarge: content-length pre-parse rejection ----

test("tooLarge rejects only over-limit, finite content lengths", () => {
  assert.equal(tooLarge(req({ "content-length": "5000" }), 4096), true);
  assert.equal(tooLarge(req({ "content-length": "4096" }), 4096), false); // boundary: equal is allowed
  assert.equal(tooLarge(req({ "content-length": "10" }), 4096), false);
  assert.equal(tooLarge(req({}), 4096), false); // missing → not too large
  assert.equal(tooLarge(req({ "content-length": "garbage" }), 4096), false); // NaN → not too large
});

// ---- concurrency cap ----

beforeEach(() => {
  // The in-flight counter lives on globalThis and persists across tests; reset it.
  globalThis.__aiInflight = 0;
});

test("acquireSlot enforces the concurrency cap and releaseSlot frees slots", () => {
  assert.equal(acquireSlot(2), true);
  assert.equal(acquireSlot(2), true);
  assert.equal(acquireSlot(2), false); // at cap
  releaseSlot();
  assert.equal(acquireSlot(2), true); // a slot freed
});

test("releaseSlot never drops the in-flight count below zero", () => {
  releaseSlot();
  releaseSlot();
  assert.equal(globalThis.__aiInflight, 0);
  assert.equal(acquireSlot(1), true);
  assert.equal(acquireSlot(1), false);
});

// ---- response helpers ----

test("tooManyRequests is a 429 with a Retry-After header and typed code", async () => {
  const res = tooManyRequests(42, "slow down");
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "42");
  const body = await res.json();
  assert.equal(body.code, "rate_limited");
  assert.equal(body.retryAfter, 42);
  assert.equal(body.error, "slow down");
});

test("payloadTooLarge is a 413 with a typed code", async () => {
  const res = payloadTooLarge("too big");
  assert.equal(res.status, 413);
  const body = await res.json();
  assert.equal(body.code, "too_large");
  assert.equal(body.error, "too big");
});

// ---- rateLimit: fixed-window enforcement (real node:sqlite store) ----

// Isolated bucket names so this test can't touch (or be touched by) real traffic.
const BKT = "test:rl:primary";
const BKT_A = "test:rl:multiA";
const BKT_B = "test:rl:multiB";
const ALL = [BKT, BKT_A, BKT_B];

function clearBuckets() {
  const db = getDb();
  const stmt = db.prepare("DELETE FROM rate_limits WHERE bucket = ?");
  for (const b of ALL) stmt.run(b);
}

before(clearBuckets);
after(clearBuckets);

test("rateLimit allows exactly `limit` requests, then 429s with a retry-after", () => {
  const rule = { bucket: BKT, limit: 3, windowMs: 60_000 };
  const ip = "10.0.0.1";
  for (let i = 0; i < 3; i++) {
    assert.equal(rateLimit(ip, [rule]).ok, true, `request ${i + 1} should pass`);
  }
  const blocked = rateLimit(ip, [rule]);
  assert.equal(blocked.ok, false);
  assert.ok(blocked.retryAfter >= 1, "retryAfter should be a positive seconds value");
});

test("rateLimit isolates buckets by ip", () => {
  const rule = { bucket: BKT, limit: 3, windowMs: 60_000 };
  // A different ip has its own fresh window even though BKT is saturated for 10.0.0.1.
  assert.equal(rateLimit("10.0.0.99", [rule]).ok, true);
});

test("a rejected multi-rule request does not consume the passing rules' budget", () => {
  const ip = "10.0.0.2";
  const ruleA = { bucket: BKT_A, limit: 1, windowMs: 60_000 };
  const ruleB = { bucket: BKT_B, limit: 5, windowMs: 60_000 };

  // First call: both rules pass and increment (A now at its limit).
  assert.equal(rateLimit(ip, [ruleA, ruleB]).ok, true);
  // Second call: rule A is exceeded → rejected. Rule B must NOT have incremented.
  assert.equal(rateLimit(ip, [ruleA, ruleB]).ok, false);

  // Prove B still has 4 of 5 left (only the first, fully-passing call counted it):
  // four more B-only successes, then the fifth is blocked.
  for (let i = 0; i < 4; i++) {
    assert.equal(rateLimit(ip, [ruleB]).ok, true, `B request ${i + 2} should pass`);
  }
  assert.equal(rateLimit(ip, [ruleB]).ok, false, "B should be exhausted after 5 total");
});
