/** Reading the 409 back. `parseCadenceRefusal` is the single place three surfaces
 *  tell "your own weekly cap stopped this" apart from every other scheduling
 *  failure — and getting it wrong is not a silent bug: the week planner, the
 *  content-plan board and the Distribuce card all fall back to `json.error`, so a
 *  missed refusal renders the machine string "cadence-exceeded" at a human, and a
 *  FALSE positive shows a confident sentence about a cap of NaN.
 *
 *  Pinned here in both directions, against the exact body the route sends. */
import { test } from "node:test";
import assert from "node:assert/strict";

const { parseCadenceRefusal } = await import("@/lib/publishing/refusal");

/** Byte-for-byte the shape src/app/api/social/posts/route.ts returns. */
const BODY = {
  error: "cadence-exceeded",
  channel: "instagram",
  cap: 3,
  count: 3,
  weekStart: "2026-08-24",
};

test("the route's 409 body parses into the refusal the UI renders", () => {
  assert.deepEqual(parseCadenceRefusal(409, BODY), {
    channel: "instagram",
    cap: 3,
    count: 3,
    weekStart: "2026-08-24",
  });
});

test("only a 409 that SAYS cadence-exceeded is one", () => {
  assert.equal(parseCadenceRefusal(422, BODY), null);
  assert.equal(parseCadenceRefusal(500, BODY), null);
  assert.equal(parseCadenceRefusal(409, { ...BODY, error: "conflict" }), null);
  assert.equal(parseCadenceRefusal(409, { error: "cadence-exceeded" }), null);
});

test("a body it cannot explain is NOT a refusal — the caller keeps its own error", () => {
  // Each of these would otherwise produce a sentence with a hole in it.
  assert.equal(parseCadenceRefusal(409, { ...BODY, cap: null }), null);
  assert.equal(parseCadenceRefusal(409, { ...BODY, cap: 0 }), null);
  assert.equal(parseCadenceRefusal(409, { ...BODY, cap: "3" }), null);
  assert.equal(parseCadenceRefusal(409, { ...BODY, count: undefined }), null);
  assert.equal(parseCadenceRefusal(409, { ...BODY, channel: "myspace" }), null);
});

test("nothing at all is nothing, not a crash", () => {
  assert.equal(parseCadenceRefusal(409, null), null);
  assert.equal(parseCadenceRefusal(409, undefined), null);
  assert.equal(parseCadenceRefusal(409, "cadence-exceeded"), null);
});

test("a missing weekStart degrades to empty rather than dropping the refusal", () => {
  // The week label is decoration; the cap and the count are the message.
  const r = parseCadenceRefusal(409, { ...BODY, weekStart: undefined });
  assert.deepEqual(r, { channel: "instagram", cap: 3, count: 3, weekStart: "" });
});
