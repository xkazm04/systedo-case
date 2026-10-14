/** The repurpose tool's system prompt states the hook / value / one-CTA triad and the
 *  Instagram link-in-bio rule (registry technique hook-value-cta-triad). social.ts had
 *  the triad; repurpose.ts, which writes the same LinkedIn/Instagram/X posts, did not,
 *  so the model's call to action was unconstrained while the deterministic floor's was
 *  not. A prompt-contract pin: it proves the instruction is present, not that a model
 *  obeys it. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { REPURPOSE_SYSTEM } from "@/lib/ai/tools/repurpose";

test("system prompt requires hook, concrete value and exactly one call to action", () => {
  assert.match(REPURPOSE_SYSTEM, /háček v první větě/);
  assert.match(REPURPOSE_SYSTEM, /konkrétní hodnotu/);
  assert.match(REPURPOSE_SYSTEM, /právě jednu výzvu k akci/);
});

test("system prompt forbids sharpening the hook with facts the article lacks", () => {
  assert.match(REPURPOSE_SYSTEM, /jen z článku — nic nevymýšlej/);
});

test("system prompt tells Instagram where the link lives instead of pasting one", () => {
  assert.match(REPURPOSE_SYSTEM, /Instagram nemá v textu klikací odkaz[\s\S]*odkaz v biu/);
});
