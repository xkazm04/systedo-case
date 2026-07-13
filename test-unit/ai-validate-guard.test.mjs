/** Unit tests for the shared validation scaffolding (_validate). The important
 *  guarantee: a NON-OBJECT / truncated parse ALWAYS fails validation so the
 *  wrapper re-prompts once, instead of the old `return []` that let garbage skip
 *  straight to the demo floor. Runs the TS source via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  asRecord,
  withObjectGuard,
  missingStrFields,
  NOT_OBJECT_VIOLATION,
} from "@/lib/ai/tools/_validate";

test("asRecord accepts a plain object and rejects everything else", () => {
  assert.deepEqual(asRecord({ a: 1 }), { a: 1 });
  assert.equal(asRecord(null), null);
  assert.equal(asRecord(undefined), null);
  assert.equal(asRecord("truncated json..."), null);
  assert.equal(asRecord(["a", "b"]), null);
  assert.equal(asRecord(42), null);
});

test("withObjectGuard fails hard on a non-object (triggers the repair re-prompt)", () => {
  const validate = withObjectGuard(() => []);
  // The body would pass, but a non-object never reaches it.
  assert.deepEqual(validate(null), [NOT_OBJECT_VIOLATION]);
  assert.deepEqual(validate("mid-stream cut off"), [NOT_OBJECT_VIOLATION]);
  assert.deepEqual(validate([{ ok: true }]), [NOT_OBJECT_VIOLATION]);
  assert.deepEqual(validate(undefined), [NOT_OBJECT_VIOLATION]);
});

test("withObjectGuard runs the body only for a real object", () => {
  const validate = withObjectGuard((o) => (o.ok ? [] : ["bad"]));
  assert.deepEqual(validate({ ok: true }), []);
  assert.deepEqual(validate({ ok: false }), ["bad"]);
});

test("missingStrFields reports every empty/absent required string field", () => {
  const o = { a: "x", b: "  ", c: 5 };
  const msgs = missingStrFields(o, [
    ["a", "missing a"],
    ["b", "missing b"],
    ["c", "missing c"],
    ["d", "missing d"],
  ]);
  // a is present; b is whitespace-only, c is not a string, d is absent.
  assert.deepEqual(msgs, ["missing b", "missing c", "missing d"]);
});
