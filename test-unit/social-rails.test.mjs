/** Direction: the public surface gets rails — (b) the write routes' rate limits
 *  and (c) the session-scoped anonymous demo tenant. Pins the pure half
 *  (lib/social/rails.ts): the per-user fixed-window behaviour of the social
 *  rules through the SAME enforceUserRate the routes call, the anonymous demo
 *  rules' fixed-window behaviour through the shared limiter (the durable guard's
 *  documented fallback), and the demo-tenant keying (session-scoped, collision-
 *  free, tamper-shaped). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";

const dbFile = join(tmpdir(), `systedo-social-rails-${process.pid}.db`);
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

const { SOCIAL_RATE, demoSocialTenantFor, isDemoSocialSid, newDemoSocialSid } = await import(
  "@/lib/social/rails"
);
const { enforceUserRate } = await import("@/lib/api/route-utils");
const { rateLimit } = await import("@/lib/ai/rate-limit");

// --- (b) per-user write rails ------------------------------------------------

test("authed post writes: allowed up to the cap, then 429 with Retry-After", () => {
  process.env.SOCIAL_POST_PER_MIN = "3";
  const rule = SOCIAL_RATE.postPerMin();
  const uid = "rails-user-a";
  for (let i = 0; i < 3; i++) {
    assert.equal(enforceUserRate(uid, rule, "limit"), null, `request ${i + 1} passes`);
  }
  const blocked = enforceUserRate(uid, rule, "limit");
  assert.ok(blocked, "the 4th request is blocked");
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("Retry-After")) >= 1);
  delete process.env.SOCIAL_POST_PER_MIN;
});

test("each social write surface has its own budget (post vs reply vs accounts)", () => {
  process.env.SOCIAL_REPLY_PER_MIN = "1";
  const uid = "rails-user-b";
  assert.equal(enforceUserRate(uid, SOCIAL_RATE.replyPerMin(), "x"), null);
  assert.ok(enforceUserRate(uid, SOCIAL_RATE.replyPerMin(), "x"), "reply budget spent");
  // The other buckets are untouched by the reply budget.
  assert.equal(enforceUserRate(uid, SOCIAL_RATE.postPerMin(), "x"), null);
  assert.equal(enforceUserRate(uid, SOCIAL_RATE.accountsPerMin(), "x"), null);
  delete process.env.SOCIAL_REPLY_PER_MIN;
});

test("anonymous demo rules: per-IP fixed window binds through the shared limiter", () => {
  process.env.SOCIAL_DEMO_PER_MIN = "2";
  const rules = [SOCIAL_RATE.demoPerMin(), SOCIAL_RATE.demoPerDay()];
  const ip = "203.0.113.7";
  assert.equal(rateLimit(ip, rules).ok, true);
  assert.equal(rateLimit(ip, rules).ok, true);
  const blocked = rateLimit(ip, rules);
  assert.equal(blocked.ok, false, "the 3rd anonymous write is throttled");
  assert.ok(blocked.retryAfter >= 1);
  assert.equal(rateLimit("203.0.113.8", rules).ok, true, "another IP is unaffected");
  delete process.env.SOCIAL_DEMO_PER_MIN;
});

// --- (c) session-scoped demo tenant -----------------------------------------

test("demo tenants are session-scoped: distinct sids → distinct tenants, never the shared 'sample'", () => {
  const a = newDemoSocialSid();
  const b = newDemoSocialSid();
  assert.notEqual(a, b, "sids are unique");
  assert.ok(isDemoSocialSid(a) && isDemoSocialSid(b));
  const ta = demoSocialTenantFor(a);
  const tb = demoSocialTenantFor(b);
  assert.notEqual(ta, tb, "two visitors never share a tenant");
  assert.notEqual(ta, "sample", "no visitor lands in the legacy shared sample tenant");
  assert.ok(!ta.startsWith("u_"), "a demo tenant can never collide with a signed-in tenant key");
});

test("a tampered cookie sid is rejected by shape (hex only — no key-structure characters)", () => {
  assert.equal(isDemoSocialSid("u_victim_proj_x"), false);
  assert.equal(isDemoSocialSid("../../etc"), false);
  assert.equal(isDemoSocialSid(""), false);
  assert.equal(isDemoSocialSid(undefined), false);
  assert.equal(isDemoSocialSid("abc"), false, "too short to be unguessable");
  assert.equal(isDemoSocialSid(newDemoSocialSid()), true);
});
