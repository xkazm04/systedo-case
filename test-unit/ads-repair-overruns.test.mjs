/** The ads tool repairs a char-limit overrun with the model, not the clamp.
 *
 *  The wrapper skips the repair re-prompt when every violation is a length overrun,
 *  because normalize()'s clamp "fixes" it for free. For ad copy the clamp's fix is a
 *  mid-word cut plus an ellipsis, shipped as a finished asset. Paired run on the
 *  fast tier (2026-10-22, 4 briefs x 3): 2 of 12 first outputs overran all four
 *  descriptions (92-122 chars, limit 90); the clamp shipped 8 truncated descriptions,
 *  the one repair call shipped 0 and left 0 over the limit, at 2 extra calls in 12.
 *  The quality tier overran 0 of 8, so the opt-in costs nothing there. Pure: no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionViolations, shouldRepair } from "@/lib/ai/tools/_shared";
import { NOT_OBJECT_VIOLATION } from "@/lib/ai/tools/_validate";
import { adsSkill, validateAds } from "@/lib/ai/tools/ads";
import { briefSkill } from "@/lib/ai/tools/brief";
import { skillToGenerateArgs } from "@/lib/skills/types";

const overlong = {
  headlines: ["Ergonomická židle pro domov"],
  descriptions: ["Nastavitelné područky, bederní opěrka a prodyšná síťovina pro práci u počítače z domova. Záruka 5 let."],
  callouts: ["Doprava zdarma"],
  keywords: ["kancelářská židle"],
  longHeadline: "Ergonomická kancelářská židle",
  rationale: "proč",
};

test("a pure overrun repairs only when the tool opted in", () => {
  const partition = partitionViolations(validateAds(overlong));
  assert.deepEqual(partition.needsModel, []);
  assert.equal(partition.clampable.length, 1);
  assert.equal(shouldRepair(partition), false, "default keeps the clamp-only saving");
  assert.equal(shouldRepair(partition, true), true);
});

test("a violation that needs the model repairs either way; none never does", () => {
  const needs = partitionViolations([NOT_OBJECT_VIOLATION]);
  assert.equal(shouldRepair(needs), true);
  assert.equal(shouldRepair(needs, true), true);
  assert.equal(shouldRepair(partitionViolations([]), true), false);
});

test("the clamp the ads tool would otherwise ship cuts the asset mid-word", () => {
  const [d] = adsSkill.normalize(overlong).descriptions;
  assert.ok(d.length <= 90);
  assert.ok(d.endsWith("…"), "the shipped description is truncated, not rewritten");
});

test("ads opts in and the flag reaches the wrapper args; other tools keep the default", () => {
  const req = { product: "Židle", benefits: "pohodlí", audience: "lidé", platform: "google", tone: "pratelsky" };
  assert.equal(skillToGenerateArgs(adsSkill, req).repairOverruns, true);
  assert.equal(briefSkill.repairOverruns, undefined);
});
