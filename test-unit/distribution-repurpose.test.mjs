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

// --- locale -----------------------------------------------------------------
// The deterministic drafts are copy the user COPIES OUT of the app (into an
// inbox, a LinkedIn composer, a scheduler). Hardcoded Czech meant an en-locale
// project's four cards were Czech on first paint, before any regenerate.

const bodyless = { title: "How to store nuts", url: "https://blog.example.cz/nuts" };

test("the connective copy follows the locale — an en article ships no Czech", () => {
  const en = repurpose(bodyless, "en");
  const joined = en.map((v) => v.text).join("\n");
  // The generator's own words: generic lead, both CTAs, the subject prefix.
  assert.match(joined, /We wrote a practical guide/);
  assert.match(joined, /Full article \(and checklist\) here:/);
  assert.match(joined, /Save it for later/);
  assert.match(joined, /^Subject: How to store nuts/m);
  assert.match(joined, /Read the full article/);
  // and nothing Czech survives
  for (const cs of ["Sepsali jsme", "Celý článek", "Uložte si", "Předmět:", "Číst celý článek"]) {
    assert.ok(!joined.includes(cs), `en variants leaked Czech copy: ${cs}`);
  }
});

test("cs stays the default, so the AI tool's locale-less fallback is unchanged", () => {
  assert.deepEqual(repurpose(bodyless), repurpose(bodyless, "cs"));
  assert.match(repurpose(bodyless)[0].text, /^Předmět: /);
});

test("localizing never changes the channel set, order, budgets or links", () => {
  const cs = repurpose(article, "cs");
  const en = repurpose(article, "en");
  assert.deepEqual(en.map((v) => v.channel), cs.map((v) => v.channel));
  assert.deepEqual(en.map((v) => v.max), cs.map((v) => v.max));
  assert.deepEqual(en.map((v) => v.link), cs.map((v) => v.link));
});

test("en variants also respect the soft channel budgets", () => {
  for (const v of repurpose(article, "en")) {
    assert.ok(v.text.length <= CHANNEL_LIMITS[v.channel], `${v.channel} over budget: ${v.text.length}`);
  }
});

test("an unknown locale degrades to the home market rather than emitting raw keys", () => {
  const out = repurpose(bodyless, "de");
  assert.equal(out.length, REPURPOSE_CHANNELS.length);
  assert.match(out[0].text, /^Předmět: /);
});
