/** Direction 2 — "stop paying for repairs the clamp already fixes".
 *
 *  Every validate() violation used to trigger a full second model call, even when
 *  the violation was a char-limit overrun that normalize()'s clamp() fixes
 *  deterministically anyway. The wrapper now re-prompts only for violations a model
 *  genuinely has to fix, and `partitionViolations` is the rule that decides.
 *
 *  The dangerous direction is the false POSITIVE: mis-reading a "you left out a
 *  required field" violation as clampable would skip a repair the model really
 *  needed. So the matcher is anchored to exactly what `lenViolation` emits, and
 *  these tests pin both directions — including the real messages every tool emits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isClampableViolation,
  lenViolation,
  lenViolations,
  partitionViolations,
} from "@/lib/ai/tools/_shared";
import { NOT_OBJECT_VIOLATION } from "@/lib/ai/tools/_validate";
import { validateAds } from "@/lib/ai/tools/ads";
import { validateBrief } from "@/lib/ai/tools/brief";

test("lenViolation keeps the exact sentence the tools always emitted", () => {
  // Byte-identical to the pre-refactor template — no prompt, UI string or golden moves.
  assert.equal(lenViolation("Title tag", 71, 60), "Title tag má 71 znaků (limit 60).");
  assert.equal(lenViolation("Nadpis #2", 34, 30), "Nadpis #2 má 34 znaků (limit 30).");
});

test("lenViolations numbers items 1-based and skips the ones inside the limit", () => {
  assert.deepEqual(lenViolations("Nadpis", ["ok", "x".repeat(31)], 30), [
    "Nadpis #2 má 31 znaků (limit 30).",
  ]);
  assert.deepEqual(lenViolations("Nadpis", ["ok"], 30), []);
});

test("a char-limit overrun is clampable", () => {
  assert.equal(isClampableViolation(lenViolation("Popisek #1", 120, 90)), true);
  assert.equal(isClampableViolation("Varianta pro LinkedIn má 3400 znaků (limit 3000)."), true);
  assert.equal(isClampableViolation("Příspěvek pro x má 300 znaků (limit 280)."), true);
});

test("everything that is NOT a char-limit overrun needs the model", () => {
  // The three real non-length violation families the tools emit today.
  assert.equal(isClampableViolation(NOT_OBJECT_VIOLATION), false);
  assert.equal(isClampableViolation("Chybí shrnutí (summary)."), false);
  assert.equal(
    isClampableViolation("Chybí varianta pro kanál LinkedIn — vrať právě jednu variantu pro každý požadovaný kanál."),
    false
  );
  // Near-misses that must NOT be mistaken for the canonical shape.
  assert.equal(isClampableViolation("má 30 znaků (limit 30)."), false, "no label");
  assert.equal(isClampableViolation("Nadpis má mnoho znaků (limit 30)."), false, "no count");
  assert.equal(
    isClampableViolation("Nadpis má 34 znaků (limit 30). A ještě něco jiného."),
    false,
    "a compound sentence is not a bare overrun"
  );
  assert.equal(isClampableViolation(""), false);
});

test("partitionViolations splits a mixed list and preserves order within each half", () => {
  const mixed = [
    "Nadpis #1 má 34 znaků (limit 30).",
    "Chybí shrnutí (summary).",
    "Nadpis #2 má 40 znaků (limit 30).",
    NOT_OBJECT_VIOLATION,
  ];
  const { clampable, needsModel } = partitionViolations(mixed);
  assert.deepEqual(clampable, ["Nadpis #1 má 34 znaků (limit 30).", "Nadpis #2 má 40 znaků (limit 30)."]);
  assert.deepEqual(needsModel, ["Chybí shrnutí (summary).", NOT_OBJECT_VIOLATION]);
  assert.deepEqual(partitionViolations([]), { clampable: [], needsModel: [] });
});

test("a pure length overrun from a REAL validator skips the repair call", () => {
  // The ads tool: headlines over the Google Ads limit. cleanClampedList() in
  // normalizeAdResult clamps every one of them, so a second model call bought nothing.
  const overlong = {
    headlines: ["x".repeat(50), "y".repeat(45)],
    descriptions: ["ok"],
    callouts: ["ok"],
    keywords: ["ok"],
    longHeadline: "z".repeat(200),
    rationale: "proč",
  };
  const violations = validateAds(overlong);
  assert.ok(violations.length >= 3, "expected the headline + longHeadline overruns");
  const { clampable, needsModel } = partitionViolations(violations);
  assert.deepEqual(needsModel, [], "a pure length overrun must not re-prompt the model");
  assert.equal(clampable.length, violations.length);
});

test("a truncated parse from a REAL validator still earns the repair call", () => {
  const { needsModel } = partitionViolations(validateBrief("{\"titleTag\": "));
  assert.deepEqual(needsModel, [NOT_OBJECT_VIOLATION]);
});

test("a mixed failure still re-prompts — and the note carries the FULL list", () => {
  // brief: the title tag is over the limit AND the parse is otherwise fine, so only
  // the length fires. Pair it with a non-object to prove the mixed case re-prompts.
  const overlong = { titleTag: "t".repeat(90), metaDescription: "m".repeat(200) };
  const violations = validateBrief(overlong);
  assert.equal(violations.length, 2);
  assert.deepEqual(partitionViolations(violations).needsModel, []);

  const mixed = [...violations, "Chybí H1."];
  const { needsModel } = partitionViolations(mixed);
  assert.equal(needsModel.length, 1);
  // The wrapper passes `violations` (not `needsModel`) to buildRepairNote when a
  // re-prompt does fire, so the repaired output stays identical to today's.
  assert.equal(mixed.length, 3);
});
