/** Unit tests for the cross-tool handoff mappers (src/lib/ai/handoff):
 *  brief → PPC-ads seed mapping and the no-mid-item length-capped join. */
import { test } from "node:test";
import assert from "node:assert/strict";
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
