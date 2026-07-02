/** Unit tests for the pure line-diff behind the LLM contract drift report
 *  (scripts/lib/diff-lines.mjs). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffLines, formatDiff, sortKeysDeep } from "../scripts/lib/diff-lines.mjs";

test("identical texts diff to all-same entries", () => {
  const d = diffLines("a\nb", "a\nb");
  assert.deepEqual(d.map((e) => e.type), ["same", "same"]);
});

test("a changed line shows as del + add, keeping surrounding context", () => {
  const d = diffLines("keep\nold line\nkeep2", "keep\nnew line\nkeep2");
  assert.deepEqual(d, [
    { type: "same", line: "keep" },
    { type: "del", line: "old line" },
    { type: "add", line: "new line" },
    { type: "same", line: "keep2" },
  ]);
});

test("pure insertion and pure deletion", () => {
  assert.deepEqual(diffLines("a", "a\nb").filter((e) => e.type === "add"), [{ type: "add", line: "b" }]);
  assert.deepEqual(diffLines("a\nb", "b").filter((e) => e.type === "del"), [{ type: "del", line: "a" }]);
});

test("empty old text diffs to all-adds (new golden case)", () => {
  const d = diffLines("", "x\ny");
  // the empty string still contributes one empty line to delete
  assert.deepEqual(d.filter((e) => e.type === "add").map((e) => e.line), ["x", "y"]);
});

test("formatDiff marks changes with -/+ and collapses long same-runs", () => {
  const entries = diffLines("s1\ns2\ns3\ns4\nold", "s1\ns2\ns3\ns4\nnew");
  const text = formatDiff(entries, { maxSameRun: 2 });
  assert.match(text, /- old/);
  assert.match(text, /\+ new/);
  assert.match(text, /…/); // s3/s4 collapsed
});

test("sortKeysDeep yields key-order-independent stable rendering", () => {
  const a = { b: 1, a: { d: [2, { z: 1, y: 2 }], c: 3 } };
  const b = { a: { c: 3, d: [2, { y: 2, z: 1 }] }, b: 1 };
  assert.equal(
    JSON.stringify(sortKeysDeep(a), null, 2),
    JSON.stringify(sortKeysDeep(b), null, 2)
  );
  // arrays keep their order
  assert.deepEqual(sortKeysDeep({ x: [3, 1, 2] }).x, [3, 1, 2]);
});
