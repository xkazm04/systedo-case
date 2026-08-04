/** Direction 1 — the per-user anti-abuse floor on the BYOM probe surfaces
 *  (`POST /api/byom/validate` and the post-store test inside `POST /api/byom/keys`).
 *  Both are REAL provider-call surfaces that were protected by the entitlement
 *  alone, i.e. unbounded: usable as a free provider probe.
 *
 *  `@/lib/firebase` is swapped for the in-memory fake, and transactions are switched
 *  OFF on it — so `durableGuard` takes its documented "Firestore unavailable" branch
 *  and falls back to the local sqlite limiter. That is exactly the path a
 *  dev/self-hosted deployment runs, and it makes the decision deterministic here
 *  without a network round-trip.
 *
 *  (This used to rely on the fake simply not HAVING `runTransaction`. It since grew
 *  one — real serialized semantics, for the project-state compare-and-swap — so the
 *  degraded branch is now selected explicitly rather than by absence.)
 *
 *  Pins: the floor engages after the configured cap, answers with the shared
 *  `rate_limited` 429 envelope the settings UI localizes, is per-USER (not per-IP),
 *  and RECOVERS once the fixed window rolls over. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./firestore-fake-hook.mjs", import.meta.url);

const { setFirestoreTransactionsAvailable } = await import("./firestore-fake.mjs");
setFirestoreTransactionsAvailable(false);

const { guardByomProbe, BYOM_PROBE_RATE } = await import("@/app/api/byom/probe-guard");
const { getDb } = await import("@/lib/db");

/** Roll every probe bucket for `userId` back by a full day, so the next call lands
 *  in a fresh fixed window — the deterministic stand-in for "wait a minute". */
function rewindWindows(userId) {
  const db = getDb();
  const stmt = db.prepare("UPDATE rate_limits SET window_start = ? WHERE bucket = ? AND ip = ?");
  for (const rule of [BYOM_PROBE_RATE.perMin(), BYOM_PROBE_RATE.perDay()]) {
    stmt.run(Date.now() - 2 * 86_400_000, rule.bucket, `user:${userId}`);
  }
}

test("guardByomProbe: allows up to the cap, then 429s — and recovers next window", async () => {
  process.env.BYOM_PROBE_PER_MIN = "3";
  delete process.env.BYOM_PROBE_PER_DAY;
  const uid = "byom-probe-a";

  assert.equal(await guardByomProbe(uid), null);
  assert.equal(await guardByomProbe(uid), null);
  assert.equal(await guardByomProbe(uid), null);

  const blocked = await guardByomProbe(uid);
  assert.ok(blocked, "the 4th probe must be refused");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
  const body = await blocked.json();
  // The shared coded envelope: the client localizes on `code`, not on the copy.
  assert.equal(body.code, "rate_limited");
  assert.ok(body.retryAfter >= 1);
  assert.ok(typeof body.error === "string" && body.error.length > 0);

  // ...and it is a floor, not a ban: the next window lets the user through again.
  rewindWindows(uid);
  assert.equal(await guardByomProbe(uid), null, "must recover once the window rolls over");
});

test("guardByomProbe: a throttled attempt does not deepen the hole", async () => {
  // durableGuard/rateLimit only commit when EVERY rule passes, so a refused probe
  // consumes no budget — one recovered window is enough to be fully served again.
  process.env.BYOM_PROBE_PER_MIN = "1";
  delete process.env.BYOM_PROBE_PER_DAY;
  const uid = "byom-probe-b";

  assert.equal(await guardByomProbe(uid), null);
  assert.ok(await guardByomProbe(uid));
  assert.ok(await guardByomProbe(uid));
  assert.ok(await guardByomProbe(uid));

  rewindWindows(uid);
  assert.equal(await guardByomProbe(uid), null);
});

test("guardByomProbe: the floor is per-USER, so one abuser can't lock out another", async () => {
  process.env.BYOM_PROBE_PER_MIN = "1";
  const a = "byom-probe-c";
  const b = "byom-probe-d";

  assert.equal(await guardByomProbe(a), null);
  assert.ok(await guardByomProbe(a), "a is spent");
  assert.equal(await guardByomProbe(b), null, "b has its own budget");
});

test("BYOM_PROBE_RATE: env-tunable, human-generous defaults, min+day windows", () => {
  delete process.env.BYOM_PROBE_PER_MIN;
  delete process.env.BYOM_PROBE_PER_DAY;
  assert.equal(BYOM_PROBE_RATE.perMin().limit, 6);
  assert.equal(BYOM_PROBE_RATE.perDay().limit, 60);
  assert.equal(BYOM_PROBE_RATE.perMin().windowMs, 60_000);
  assert.equal(BYOM_PROBE_RATE.perDay().windowMs, 86_400_000);
  // Distinct buckets — the two rules must not share one counter.
  assert.notEqual(BYOM_PROBE_RATE.perMin().bucket, BYOM_PROBE_RATE.perDay().bucket);

  process.env.BYOM_PROBE_PER_MIN = "2";
  process.env.BYOM_PROBE_PER_DAY = "9";
  assert.equal(BYOM_PROBE_RATE.perMin().limit, 2);
  assert.equal(BYOM_PROBE_RATE.perDay().limit, 9);
  delete process.env.BYOM_PROBE_PER_MIN;
  delete process.env.BYOM_PROBE_PER_DAY;
});
