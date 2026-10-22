/** The ads prompt asks for short headlines at the rater's own bucket edge.
 *
 *  "Stay slightly under the limit" alone pulled every recorded generated set to
 *  19-29 characters with no headline in the short bucket, so Ad Strength's
 *  length-variety factor could never pass on generated copy. buildAdPrompt now
 *  asks for at least two short headlines, using HEADLINE_SHORT_MAX from
 *  src/lib/ad-strength.ts, so the number the generator is told and the number the
 *  rater counts cannot drift apart. Pure: no network. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adsSkill } from "@/lib/ai/tools/ads";
import { HEADLINE_SHORT_MAX, computeAdStrength } from "@/lib/ad-strength";

const req = {
  product: "Směsi ořechů",
  benefits: "čerstvě pražené každý týden",
  audience: "aktivní lidé",
  platform: "google",
  tone: "pratelsky",
};

test("prompt asks for short headlines at the rater's short-bucket edge", () => {
  const prompt = adsSkill.buildPrompt(req);
  assert.match(prompt, new RegExp(`aspoň 2 krátké do ${HEADLINE_SHORT_MAX} znaků`));
});

test("the edge the prompt names is the edge the rater passes on", () => {
  const short = "x".repeat(HEADLINE_SHORT_MAX);
  const lengthVariety = (headlines) =>
    computeAdStrength({ headlines, descriptions: [], callouts: [], keywords: [], longHeadline: "", rationale: "" }, "en")
      .factors.find((f) => f.label === "Length variety").status;
  assert.equal(lengthVariety([short, "y".repeat(20), "z".repeat(28)]), "pass");
  assert.equal(lengthVariety(["x".repeat(HEADLINE_SHORT_MAX + 1), "y".repeat(20), "z".repeat(28)]), "partial");
});
