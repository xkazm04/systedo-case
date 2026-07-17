/** Unit tests for the deterministic repurpose() (src/lib/distribution/generate.ts):
 *  variants must be derived from the article's own body (not a fixed generic blurb)
 *  and must never emit niche-specific hashtags a non-matching project would post by
 *  mistake. Runs the TS source directly via the shared resolve hook. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { repurpose, CHANNEL_LIMITS, REPURPOSE_CHANNELS } from "@/lib/distribution/generate";

const article = {
  title: "Jak skladovat ořechy",
  url: "https://blog.example.cz/orechy",
  body:
    "Skladování ořechů rozhoduje o jejich chuti i trvanlivosti — vzduch, teplo a světlo je nechají žluknout.\n\n" +
    "Nejlepší je vzduchotěsná nádoba v chladu a tmě; delší zásoby patří do mrazáku, kde vydrží měsíce.",
};

test("no variant carries hardcoded niche (parenting) hashtags", () => {
  for (const v of repurpose(article)) {
    assert.doesNotMatch(v.text, /#rodicovstvi|#miminko/, `${v.channel} leaked niche hashtags`);
  }
});

test("variants draw substance from the article body, not a fixed generic blurb", () => {
  const byChannel = Object.fromEntries(repurpose(article).map((v) => [v.channel, v]));
  // Newsletter + Instagram lead with the article's opening paragraph
  assert.match(byChannel.Newsletter.text, /Skladování ořechů rozhoduje/);
  assert.match(byChannel.Instagram.text, /Skladování ořechů rozhoduje/);
  // LinkedIn pulls the second paragraph's substance
  assert.match(byChannel.LinkedIn.text, /vzduchotěsná nádoba/);
});

test("a body-less article falls back to a generic lead (never crashes, no hashtags)", () => {
  const variants = repurpose({ title: "Titulek", url: "https://x.cz/a" });
  assert.equal(variants.length, REPURPOSE_CHANNELS.length);
  for (const v of variants) {
    assert.ok(v.text.length > 0);
    assert.doesNotMatch(v.text, /#rodicovstvi|#miminko/);
  }
});

test("each variant stays within its soft channel budget", () => {
  for (const v of repurpose(article)) {
    assert.ok(v.text.length <= CHANNEL_LIMITS[v.channel], `${v.channel} over budget: ${v.text.length}`);
  }
});
