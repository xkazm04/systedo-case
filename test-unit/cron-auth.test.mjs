/** The cron guard, from the outside.
 *
 *  Six Vercel crons (`vercel.json` → `/api/cron/*`) are authorized by exactly one
 *  function, `cronAuthorized` in src/lib/cron-auth.ts, and nothing in the suite
 *  exercised it: `CRON_SECRET` appeared only in the env-preflight tests
 *  (doctor / readiness), which assert the variable is NAMED, never that the guard
 *  built on it says no. A guard whose only test is "the env var exists" passes just
 *  as green when the comparison is inverted, when the fail-closed branch is removed,
 *  or when the constant-time compare is replaced by one that throws on a
 *  wrong-length header — and each of those turns six unauthenticated endpoints into
 *  a public API in a deployment that ships on push.
 *
 *  So these tests are written against the ways that function can be WRONG rather
 *  than the one way it is right: no secret, an empty secret, a header that is
 *  absent, one that is close, one that is a different LENGTH (which is what the
 *  SHA-256 of both sides buys — `timingSafeEqual` throws on unequal-length inputs,
 *  so an un-digested compare is a 500 on every probe rather than a 401), and the
 *  exact-match case that must still be true afterwards. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { cronAuthorized } from "@/lib/cron-auth";

const SECRET = "cron-secret-under-test";

/** A cron request with the given `authorization` header, or none at all. */
const req = (authorization) =>
  new Request(
    "https://adamant.test/api/cron/sync",
    authorization === undefined ? undefined : { headers: { authorization } }
  );

/** Run `fn` with CRON_SECRET set to `value` (or unset when `undefined`), and put
 *  the environment back afterwards — every test file in this suite shares one
 *  process. */
function withSecret(value, fn) {
  const before = process.env.CRON_SECRET;
  if (value === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = before;
  }
}

test("fails CLOSED: with no CRON_SECRET configured, nobody is authorized", () => {
  withSecret(undefined, () => {
    assert.equal(cronAuthorized(req("Bearer anything")), false);
    assert.equal(cronAuthorized(req()), false);
  });
});

test("fails CLOSED: an EMPTY CRON_SECRET authorizes nobody, including `Bearer `", () => {
  withSecret("", () => {
    assert.equal(cronAuthorized(req("Bearer ")), false);
    assert.equal(cronAuthorized(req("Bearer")), false);
  });
});

test("the exact `Bearer <secret>` header, and only it, is authorized", () => {
  withSecret(SECRET, () => {
    assert.equal(cronAuthorized(req(`Bearer ${SECRET}`)), true);
  });
});

test("a near-miss header is refused: wrong secret, wrong scheme, wrong case, no scheme", () => {
  withSecret(SECRET, () => {
    assert.equal(cronAuthorized(req(`Bearer ${SECRET}x`)), false, "a longer secret");
    assert.equal(cronAuthorized(req(`Bearer ${SECRET.slice(0, -1)}`)), false, "a truncated secret");
    assert.equal(cronAuthorized(req("Bearer cron-secret-under-tesT")), false, "one character off");
    assert.equal(cronAuthorized(req(`bearer ${SECRET}`)), false, "lowercase scheme");
    assert.equal(cronAuthorized(req(SECRET)), false, "the bare secret, no scheme");
    assert.equal(cronAuthorized(req(`Bearer  ${SECRET}`)), false, "a doubled space");
  });
});

test("a missing Authorization header is a false, not a throw", () => {
  withSecret(SECRET, () => {
    let authorized = true;
    assert.doesNotThrow(() => {
      authorized = cronAuthorized(req());
    });
    assert.equal(authorized, false);
  });
});

test("a wrong-LENGTH header is a false, not a throw — both sides are digested first", () => {
  withSecret(SECRET, () => {
    // `timingSafeEqual` throws RangeError on unequal-length buffers. Hashing both
    // sides to a fixed 32 bytes is what makes an attacker-chosen length a 401
    // rather than a 500 — and what stops the secret's LENGTH leaking through the
    // difference between the two.
    for (const header of ["", "B", "Bearer", `Bearer ${"x".repeat(4096)}`]) {
      let authorized = true;
      assert.doesNotThrow(() => {
        authorized = cronAuthorized(req(header));
      }, `header ${JSON.stringify(header.slice(0, 24))} threw instead of returning false`);
      assert.equal(authorized, false);
    }
  });
});
