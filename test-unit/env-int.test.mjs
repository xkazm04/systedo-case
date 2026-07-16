/** Direction 3 — the env stops failing silently. envInt still never throws and
 *  still returns the default for a bad value, but a MALFORMED (set-but-unusable)
 *  value now logs a warning ONCE per key instead of silently swallowing the typo.
 *  An unset/empty var stays silent (the normal "use the default" case). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);
const { envInt } = await import("@/lib/env");

/** Run `fn` with console.warn captured; returns the collected warning strings. */
function captureWarn(fn) {
  const original = console.warn;
  const lines = [];
  console.warn = (...args) => lines.push(args.join(" "));
  try {
    fn();
  } finally {
    console.warn = original;
  }
  return lines;
}

test("valid value → parsed, floored, no warning", () => {
  process.env.ENVINT_VALID = "42.9";
  const warns = captureWarn(() => {
    assert.equal(envInt("ENVINT_VALID", 10), 42);
  });
  assert.deepEqual(warns, []);
});

test("unset var → default, silent (the normal case)", () => {
  delete process.env.ENVINT_UNSET;
  const warns = captureWarn(() => {
    assert.equal(envInt("ENVINT_UNSET", 7), 7);
  });
  assert.deepEqual(warns, []);
});

test("empty var → default, silent", () => {
  process.env.ENVINT_EMPTY = "   ";
  const warns = captureWarn(() => {
    assert.equal(envInt("ENVINT_EMPTY", 5), 5);
  });
  assert.deepEqual(warns, []);
});

test("malformed value → default + ONE warning naming the key, deduped per key", () => {
  process.env.ENVINT_TYPO = "1O"; // letter O, not zero
  const warns = captureWarn(() => {
    assert.equal(envInt("ENVINT_TYPO", 3), 3);
    assert.equal(envInt("ENVINT_TYPO", 3), 3); // second call must NOT warn again
    assert.equal(envInt("ENVINT_TYPO", 3), 3);
  });
  assert.equal(warns.length, 1, "one-time warning per key");
  assert.match(warns[0], /ENVINT_TYPO/);
  assert.match(warns[0], /1O/); // echoes the offending value
  assert.match(warns[0], /positive integer/);
});

test("zero honours allowZero: 0 is malformed by default, valid when allowed", () => {
  process.env.ENVINT_ZERO = "0";
  // default (allowZero:false) → 0 is out of range → default, and it warns.
  const warns = captureWarn(() => {
    assert.equal(envInt("ENVINT_ZERO", 9), 9);
  });
  assert.equal(warns.length, 1);
  assert.match(warns[0], /positive integer/);
  // allowZero:true → 0 is a valid value (spend ceiling "disabled"), no warning.
  const warns2 = captureWarn(() => {
    assert.equal(envInt("ENVINT_ZERO", 9, { allowZero: true }), 0);
  });
  assert.deepEqual(warns2, []);
});
