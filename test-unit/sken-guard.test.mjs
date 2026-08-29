/** WP W2-B — the per-IP daily cap on the PUBLIC website scan.
 *
 *  `/sken` is the one paid generation an anonymous visitor reaches with no sign-in
 *  wall in front of it, so the number in RATE_RULES.skenPerDay is a product
 *  decision, not an implementation detail: five scans a day from one address. This
 *  suite pins it end to end — the 6th scan refuses — by driving `guardSkenDaily`
 *  over the REAL fixed-window limiter (the sqlite one; the Firestore twin runs the
 *  identical window math and is unreachable offline), so the assertion is about the
 *  enforced budget, not about a mock counting to five.
 *
 *  It also pins the refusal CONTRACT. `durableGuard` does not populate `refusal` on
 *  its Firestore path, so the guard reconstructs it from the rule that actually
 *  refused; if that reconstruction ever describes a different allowance than the one
 *  enforced, the client counts down against a number nobody is applying. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-sken-guard-${process.pid}.db`);
for (const ext of ["", "-wal", "-shm"]) {
  try {
    rmSync(dbFile + ext);
  } catch {
    /* not present */
  }
}
process.env.SYSTEDO_DB_FILE = dbFile;
process.env.LOCAL_DB = "true";
register("./json-loader.mjs", import.meta.url);

const { guardSkenDaily } = await import("@/lib/onboarding/sken-guard");
const { RATE_RULES, rateLimit } = await import("@/lib/ai/rate-limit");

/** The real per-instance limiter, injected in place of the Firestore-backed
 *  durableGuard (which is unreachable in a unit test and whose only difference is
 *  WHERE the counter lives). */
const localGuard = async (ip, rules) => rateLimit(ip, rules);

test("the public scan rule is 5 per day, per IP, on its own bucket", () => {
  const rule = RATE_RULES.skenPerDay();
  assert.equal(rule.limit, 5, "the pinned public-scan allowance");
  assert.equal(rule.windowMs, 86_400_000, "a daily window");
  assert.equal(rule.bucket, "sken:day", "its own bucket — never a share of ai:day");
});

test("the 6th scan from one IP in a day is refused with a usable 429", async () => {
  const ip = "203.0.113.7";
  for (let i = 1; i <= 5; i++) {
    assert.equal(await guardSkenDaily({ ip }, { guard: localGuard }), null, `scan ${i} of 5 must pass`);
  }

  const refused = await guardSkenDaily({ ip }, { guard: localGuard });
  assert.ok(refused instanceof Response, "the 6th scan must be refused");
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get("Retry-After")) > 0, "Retry-After must be a real countdown");

  const body = await refused.json();
  assert.equal(body.code, "rate_limited");
  assert.ok(body.retryAfter > 0, "the body carries the same countdown");
  assert.equal(body.limit, 5, "the refusal publishes the allowance it enforced");
  assert.equal(body.layer, "per-ip-day");
  assert.equal(body.bucket, "sken:day");
  assert.equal(body.remaining, 0);
});

test("the cap is per IP — a different address has its own budget", async () => {
  const other = "198.51.100.42";
  assert.equal(await guardSkenDaily({ ip: other }, { guard: localGuard }), null);
});

test("a context with no IP falls into one shared bucket rather than opening the gate", async () => {
  const seen = [];
  const spy = async (ip, rules) => {
    seen.push(ip);
    return rateLimit(ip, rules);
  };
  await guardSkenDaily({}, { guard: spy });
  assert.deepEqual(seen, ["unknown"], "an absent IP must still count toward some limit");
});
