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
 *  exact-match case that must still be true afterwards.
 *
 *  Threat-model flow TM-03 (docs/security/threat-model.md § Credentials, by flow):
 *  `CRON_SECRET` enters from platform env, is never stored, and is compared against an
 *  inbound Authorization header by this one function. The model's "what stands on it"
 *  cell names this file; `npm run threat:flows` keeps the two pointing at each other. */
import { test } from "node:test";
import assert from "node:assert/strict";

import { cronAuthorized } from "@/lib/cron-auth";
import { contract } from "./contract.mjs";

/** What a failure here MEANS, in the words of the rule rather than of the value.
 *  `security-rules` is the row in .github/constraint-map.json that requires an API
 *  route to establish who is calling; these six cron endpoints establish it with
 *  this one function, so a red assertion below is that rule breaking and the
 *  message says so. See test-unit/contract.mjs. */
const callerIdentity = contract("security-rules");

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
    assert.equal(
      cronAuthorized(req("Bearer anything")),
      false,
      callerIdentity(
        "a deployment with no CRON_SECRET configured authorized a caller. The guard fails OPEN, which " +
          "makes six /api/cron/* endpoints a public API on a deployment that ships on push"
      )
    );
    assert.equal(
      cronAuthorized(req()),
      false,
      callerIdentity("a cron request with no Authorization header at all was authorized")
    );
  });
});

test("fails CLOSED: an EMPTY CRON_SECRET authorizes nobody, including `Bearer `", () => {
  withSecret("", () => {
    assert.equal(
      cronAuthorized(req("Bearer ")),
      false,
      callerIdentity("an EMPTY CRON_SECRET authorized `Bearer ` — a blank secret is not a secret")
    );
    assert.equal(
      cronAuthorized(req("Bearer")),
      false,
      callerIdentity("an EMPTY CRON_SECRET authorized a bare `Bearer` scheme")
    );
  });
});

test("the exact `Bearer <secret>` header, and only it, is authorized", () => {
  withSecret(SECRET, () => {
    assert.equal(
      cronAuthorized(req(`Bearer ${SECRET}`)),
      true,
      callerIdentity(
        "the correct `Bearer <CRON_SECRET>` header was REFUSED. This direction is not a security hole, it " +
          "is six schedules silently doing nothing — .github/environments.json § schedules"
      )
    );
  });
});

test("a near-miss header is refused: wrong secret, wrong scheme, wrong case, no scheme", () => {
  withSecret(SECRET, () => {
    const nearMiss = (what) => callerIdentity(`a near-miss cron header was authorized: ${what}`);
    assert.equal(cronAuthorized(req(`Bearer ${SECRET}x`)), false, nearMiss("a longer secret"));
    assert.equal(cronAuthorized(req(`Bearer ${SECRET.slice(0, -1)}`)), false, nearMiss("a truncated secret"));
    assert.equal(cronAuthorized(req("Bearer cron-secret-under-tesT")), false, nearMiss("one character off"));
    assert.equal(cronAuthorized(req(`bearer ${SECRET}`)), false, nearMiss("lowercase scheme"));
    assert.equal(cronAuthorized(req(SECRET)), false, nearMiss("the bare secret, no scheme"));
    assert.equal(cronAuthorized(req(`Bearer  ${SECRET}`)), false, nearMiss("a doubled space"));
  });
});

test("a missing Authorization header is a false, not a throw", () => {
  withSecret(SECRET, () => {
    let authorized = true;
    assert.doesNotThrow(() => {
      authorized = cronAuthorized(req());
    }, callerIdentity("a cron request with no Authorization header THREW — a 500 where the contract says 401"));
    assert.equal(authorized, false, callerIdentity("a cron request with no Authorization header was authorized"));
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
      assert.doesNotThrow(
        () => {
          authorized = cronAuthorized(req(header));
        },
        callerIdentity(
          `header ${JSON.stringify(header.slice(0, 24))} threw instead of returning false — both sides ` +
            "have stopped being digested, so a wrong-length probe is a 500 and the secret's LENGTH leaks"
        )
      );
      assert.equal(
        authorized,
        false,
        callerIdentity(`a wrong-length header ${JSON.stringify(header.slice(0, 24))} was authorized`)
      );
    }
  });
});
