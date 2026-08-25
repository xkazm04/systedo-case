/** The SELF_HOSTED deploy-mode seam (src/lib/deploy-mode.ts): the explicit
 *  operator switch that legalises a Firestore-less production install, and the
 *  fail-closed boot rule that keeps an open install a decision, not an accident.
 *  Design: docs/open-source/self-hosting.md §1. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { deployMode, selfHostBootError, selfHosted } from "@/lib/deploy-mode";

test("selfHosted requires the exact explicit value 'true'", () => {
  assert.equal(selfHosted({ SELF_HOSTED: "true" }), true);
  assert.equal(selfHosted({}), false);
  assert.equal(selfHosted({ SELF_HOSTED: "1" }), false);
  assert.equal(selfHosted({ SELF_HOSTED: "TRUE" }), false);
  assert.equal(selfHosted({ SELF_HOSTED: "false" }), false);
});

test("deployMode: self-hosted wins over NODE_ENV; otherwise cloud iff production", () => {
  assert.equal(deployMode({ SELF_HOSTED: "true", NODE_ENV: "production" }), "self-hosted");
  assert.equal(deployMode({ SELF_HOSTED: "true" }), "self-hosted");
  assert.equal(deployMode({ NODE_ENV: "production" }), "cloud");
  assert.equal(deployMode({ NODE_ENV: "development" }), "dev");
  assert.equal(deployMode({}), "dev");
});

test("fail-closed boot: self-hosted prod with no operator password refuses to boot", () => {
  const err = selfHostBootError({ SELF_HOSTED: "true", NODE_ENV: "production" });
  assert.ok(err);
  assert.match(err, /ADAMANT_OPERATOR_PASSWORD/);
  assert.match(err, /ALLOW_OPEN/); // names the deliberate escape hatch
});

test("fail-closed boot: a password, or the explicit ALLOW_OPEN=1, permits boot", () => {
  assert.equal(
    selfHostBootError({ SELF_HOSTED: "true", NODE_ENV: "production", ADAMANT_OPERATOR_PASSWORD: "s3cret" }),
    null
  );
  assert.equal(
    selfHostBootError({ SELF_HOSTED: "true", NODE_ENV: "production", ALLOW_OPEN: "1" }),
    null
  );
  // ALLOW_OPEN must be exactly "1"
  assert.ok(selfHostBootError({ SELF_HOSTED: "true", NODE_ENV: "production", ALLOW_OPEN: "true" }));
});

test("fail-closed boot never fires outside self-hosted production", () => {
  assert.equal(selfHostBootError({ SELF_HOSTED: "true", NODE_ENV: "development" }), null);
  assert.equal(selfHostBootError({ NODE_ENV: "production" }), null);
  assert.equal(selfHostBootError({}), null);
});
