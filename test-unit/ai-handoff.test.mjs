/** Unit tests for the cross-tool handoff mappers (src/lib/ai/handoff):
 *  brief → PPC-ads seed mapping and the no-mid-item length-capped join. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AD_SEED_LIMITS, briefToAdSeed, joinWithinLimit } from "@/lib/ai/handoff";
import { AD_FIELD_LIMITS } from "@/lib/ai/field-limits";
import { validateAdRequest } from "@/lib/ai/validation";

const brief = (over = {}) => ({
  titleTag: "Skladování ořechů: kompletní průvodce",
  metaDescription: "meta",
  h1: "Jak skladovat ořechy",
  slug: "skladovani-orechu",
  outline: [
    { heading: "Proč žluknou", points: ["Vzduch a světlo", "Teplota nad 20 °C"] },
    { heading: "Jak na to", points: ["Vzduchotěsné sklenice", "Lednice pro delší zásoby"] },
  ],
  faq: [],
  keywords: ["skladování ořechů", "žluknutí ořechů"],
  internalLinks: [],
  rationale: "",
  ...over,
});

test("joinWithinLimit joins with commas and never cuts an item mid-way", () => {
  assert.equal(joinWithinLimit(["aaa", "bbb", "ccc"], 100), "aaa, bbb, ccc");
  // "aaa, bbb" = 8 chars fits; adding ", ccc" would exceed 10 → stop cleanly
  assert.equal(joinWithinLimit(["aaa", "bbb", "ccc"], 10), "aaa, bbb");
  assert.equal(joinWithinLimit([], 10), "");
  assert.equal(joinWithinLimit(["  ", ""], 10), "");
});

test("joinWithinLimit keeps at least the first item, hard-capped", () => {
  assert.equal(joinWithinLimit(["x".repeat(20)], 5), "xxxxx");
});

test("briefToAdSeed maps topic/audience/outline points onto the ad request", () => {
  const seed = briefToAdSeed("Jak skladovat ořechy a semínka", "Domácí pekaři", brief());
  assert.equal(seed.product, "Jak skladovat ořechy a semínka");
  assert.equal(seed.audience, "Domácí pekaři");
  assert.equal(
    seed.benefits,
    "Vzduch a světlo, Teplota nad 20 °C, Vzduchotěsné sklenice, Lednice pro delší zásoby"
  );
});

test("briefToAdSeed falls back to the brief h1 for product and keywords for benefits", () => {
  const seed = briefToAdSeed("  ", "", brief({ outline: [{ heading: "H", points: [] }] }));
  assert.equal(seed.product, "Jak skladovat ořechy");
  assert.equal(seed.benefits, "skladování ořechů, žluknutí ořechů");
  assert.equal("audience" in seed, false);
});

test("briefToAdSeed omits fields below the validator MIN instead of emitting them too-short", () => {
  // A 1-char audience and an empty benefits source would look filled yet be rejected
  // by validateAdRequest — the seed must omit them (honest empty field), not carry them.
  const seed = briefToAdSeed("Produkt", "x", brief({ outline: [{ heading: "H", points: [] }], keywords: [] }));
  assert.equal("audience" in seed, false);
  assert.equal("benefits" in seed, false);
  assert.equal(seed.product, "Produkt");
});

test("briefToAdSeed output always clears its target validator's MINs", () => {
  const seed = briefToAdSeed("Jak skladovat ořechy a semínka", "Domácí pekaři", brief());
  for (const [field, bound] of Object.entries(AD_FIELD_LIMITS)) {
    const v = seed[field];
    if (v !== undefined) assert.ok(v.length >= bound.min, `${field} below min`);
  }
  // The completed seed (plus the platform/tone the form supplies) passes the validator.
  const res = validateAdRequest({ ...seed, platform: "google", tone: "pratelsky" });
  assert.equal(res.valid, true);
});

test("briefToAdSeed respects the server-side field caps", () => {
  const long = "b".repeat(700);
  const seed = briefToAdSeed(
    "t".repeat(300),
    "a".repeat(400),
    brief({ outline: [{ heading: "H", points: [long] }] })
  );
  assert.equal(seed.product.length, AD_SEED_LIMITS.product);
  assert.equal(seed.audience.length, AD_SEED_LIMITS.audience);
  assert.equal(seed.benefits.length, AD_SEED_LIMITS.benefits);
});

// ── the handoff is wired at BOTH mount points, through one shared wiring ──────

/** `onCreateAds` was real, tested and offered by ContentBriefGenerator — but only
 *  the standalone /ai-asistent surface ever passed it, so the project's own Tvorba
 *  could not take a maker from brief to ad without leaving the project. Both mounts
 *  now consume the SAME hook (components/ai/useBriefToAds), which is what stops
 *  them drifting into two different handoffs again. Source-level, because "the prop
 *  is passed at this mount point" is a property of the source. */
const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("both brief mount points wire onCreateAds from the shared hook", () => {
  const mounts = {
    "standalone assistant": read("../src/components/ai/AiAssistant.tsx"),
    "project content engine": read("../src/components/app/modules/ContentEngine.tsx"),
  };
  for (const [name, src] of Object.entries(mounts)) {
    assert.ok(/useBriefToAdsHandoff/.test(src), `${name} uses the shared hook`);
    assert.ok(
      /<ContentBriefGenerator[^>]*onCreateAds=\{ads\.onCreateAds\}/s.test(src),
      `${name} passes the shared callback to ContentBriefGenerator`
    );
    assert.ok(
      /<AdGenerator[\s\S]{0,200}seed=\{ads\.seed\}/.test(src),
      `${name} lands the handoff on AdGenerator with the shared seed`
    );
    assert.ok(/key=\{[^}]*ads\.nonce[^}]*\}/.test(src), `${name} re-keys on the shared nonce`);
  }
});

test("there is exactly one brief → ads bridge", () => {
  // briefToAdSeed is called at ContentBriefGenerator's single call site; no mount
  // point may map a brief onto an AdRequest itself.
  for (const rel of [
    "../src/components/ai/AiAssistant.tsx",
    "../src/components/app/modules/ContentEngine.tsx",
    "../src/components/ai/useBriefToAds.ts",
  ]) {
    assert.ok(!/briefToAdSeed\(/.test(read(rel)), `${rel} must not re-map the brief`);
  }
  const generator = read("../src/components/ai/ContentBriefGenerator.tsx");
  assert.equal((generator.match(/briefToAdSeed\(/g) ?? []).length, 1);
  assert.ok(generator.includes('from "@/lib/ai/handoff"'), "the bridge stays in lib/ai/handoff");
});
