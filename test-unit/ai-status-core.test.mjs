/** Pure decision logic behind the preflight GET /api/ai/status
 *  (src/lib/ai/status-core.ts): which provider path would serve a generation,
 *  and what the panel banner should warn about before a request is burned. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PREFLIGHT_LOW_REMAINING,
  preflightNotice,
  resolveWouldServe,
} from "@/lib/ai/status-core";

/** A healthy anonymous payload; override per case. */
function status(overrides = {}) {
  return {
    dev: true,
    demo: false,
    wouldServe: "claude",
    providers: [
      { model: "claude-sonnet", available: true },
      { model: "gemini-3-flash-preview", available: false },
    ],
    remaining: { perMin: 8, perDay: 80 },
    limits: { perMin: 8, perDay: 80 },
    ...overrides,
  };
}

test("resolveWouldServe follows the wrapper's environment-preferred order", () => {
  // dev prefers Claude, prod prefers Gemini
  assert.equal(resolveWouldServe(true, true, true), "claude");
  assert.equal(resolveWouldServe(false, true, true), "gemini");
  // falls through to the other configured provider
  assert.equal(resolveWouldServe(true, false, true), "gemini");
  assert.equal(resolveWouldServe(false, false, true), "gemini");
  assert.equal(resolveWouldServe(false, true, false), "claude");
  // neither → demo
  assert.equal(resolveWouldServe(true, false, false), "demo");
  assert.equal(resolveWouldServe(false, false, false), "demo");
});

test("healthy live status renders no notice", () => {
  const n = preflightNotice(status());
  assert.equal(n.kind, null);
  assert.equal(n.remaining, 80);
  assert.equal(n.metered, false);
});

test("demo mode outranks every budget state", () => {
  const n = preflightNotice(
    status({ demo: true, wouldServe: "demo", remaining: { perMin: 0, perDay: 0 } })
  );
  assert.equal(n.kind, "demo");
});

test("anonymous daily budget: low then exhausted; per-minute alone is ignored", () => {
  const low = preflightNotice(
    status({ remaining: { perMin: 8, perDay: PREFLIGHT_LOW_REMAINING } })
  );
  assert.equal(low.kind, "low");
  assert.equal(low.remaining, PREFLIGHT_LOW_REMAINING);
  assert.equal(low.metered, false);

  const spent = preflightNotice(status({ remaining: { perMin: 8, perDay: 0 } }));
  assert.equal(spent.kind, "exhausted");
  assert.equal(spent.remaining, 0);

  // a sub-minute wait is the 429 countdown's job, not the preflight banner's
  const minuteOnly = preflightNotice(status({ remaining: { perMin: 0, perDay: 42 } }));
  assert.equal(minuteOnly.kind, null);
});

test("a mostly-demo recent window flags a degraded provider", () => {
  // provider looks available (cached probe) but recent calls fell to the demo
  const degraded = preflightNotice(status({ recent: { calls: 10, demoRate: 0.8 } }));
  assert.equal(degraded.kind, "degraded");
  assert.equal(degraded.remaining, 80);

  // a healthy demo share (below the digest's warn threshold) stays quiet
  const healthy = preflightNotice(status({ recent: { calls: 10, demoRate: 0.2 } }));
  assert.equal(healthy.kind, null);

  // an empty window proves nothing
  const empty = preflightNotice(status({ recent: { calls: 0, demoRate: 0 } }));
  assert.equal(empty.kind, null);

  // hard states outrank the degradation warning
  const demo = preflightNotice(
    status({ demo: true, wouldServe: "demo", recent: { calls: 10, demoRate: 1 } })
  );
  assert.equal(demo.kind, "demo");
  const spent = preflightNotice(
    status({ remaining: { perMin: 8, perDay: 0 }, recent: { calls: 10, demoRate: 1 } })
  );
  assert.equal(spent.kind, "exhausted");
});

test("a signed-in plan quota is the binding budget over the IP cap", () => {
  // plenty of IP budget, but the plan quota is spent → exhausted + metered
  const spent = preflightNotice(status({ usage: { used: 10, limit: 10 } }));
  assert.equal(spent.kind, "exhausted");
  assert.equal(spent.metered, true);

  const low = preflightNotice(status({ usage: { used: 8, limit: 10 } }));
  assert.equal(low.kind, "low");
  assert.equal(low.remaining, 2);

  // over-consumption never reports negative remaining
  const over = preflightNotice(status({ usage: { used: 12, limit: 10 } }));
  assert.equal(over.remaining, 0);
});
