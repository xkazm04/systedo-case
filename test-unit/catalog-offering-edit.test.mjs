/** Pure helpers behind the scaled Katalog manager + ad sidebar: the search predicate
 *  (diacritic/case-insensitive, empty = match all) and the per-field draft parsers a
 *  memoized OfferingCard uses on blur. These are the testable "pure part" of the
 *  per-row-state isolation; the render isolation itself is React.memo + stable callbacks
 *  + immutable array updates in the components. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_PAGE_SIZE,
  normalizeText,
  offeringMatchesQuery,
  parseMarginPct,
  parseNumInput,
} from "@/components/app/modules/catalog/offering-edit.ts";

const prod = (over = {}) => ({
  kind: "product", id: "p:1", projectId: "p", name: "Kešu ořechy", category: "Ořechy",
  active: true, nature: "online", price: 249, currency: "CZK", channels: [], tags: ["bio"],
  source: "manual", updatedAt: "", sku: "ABC-1", stock: 10, dailyVelocity: 1, gtin: "8590",
  ...over,
});

test("normalizeText strips diacritics and lowercases", () => {
  assert.equal(normalizeText("Kešu Ořechy"), "kesu orechy");
  assert.equal(normalizeText("  ŽLUŤ  "), "zlut");
});

test("offeringMatchesQuery: empty query matches everything (list identical to un-searched)", () => {
  assert.equal(offeringMatchesQuery(prod(), ""), true);
  assert.equal(offeringMatchesQuery(prod(), "   "), true);
});

test("offeringMatchesQuery: matches name/category/sku/gtin/tags, diacritic-insensitive", () => {
  assert.equal(offeringMatchesQuery(prod(), "kesu"), true); // name, no diacritics
  assert.equal(offeringMatchesQuery(prod(), "OŘECH"), true); // category, case
  assert.equal(offeringMatchesQuery(prod(), "abc-1"), true); // sku
  assert.equal(offeringMatchesQuery(prod(), "8590"), true); // gtin
  assert.equal(offeringMatchesQuery(prod(), "bio"), true); // tag
  assert.equal(offeringMatchesQuery(prod(), "zzz"), false);
});

test("offeringMatchesQuery: non-product has no sku/gtin to match", () => {
  const plan = { kind: "plan", name: "Pro", category: "Plán", tags: [] };
  assert.equal(offeringMatchesQuery(plan, "pro"), true);
  assert.equal(offeringMatchesQuery(plan, "sku"), false);
});

test("parseNumInput clamps ≥ 0, keeps fallback on blank/invalid, accepts comma decimals", () => {
  assert.equal(parseNumInput("42"), 42);
  assert.equal(parseNumInput("12,5"), 12.5);
  assert.equal(parseNumInput("", 7), 7); // blank → fallback
  assert.equal(parseNumInput("-3", 7), 7); // negative → fallback
  assert.equal(parseNumInput("abc", 7), 7); // invalid → fallback
});

test("parseMarginPct: percent → 0–1 fraction, blank → undefined, clamped", () => {
  assert.equal(parseMarginPct("30"), 0.3);
  assert.equal(parseMarginPct(""), undefined);
  assert.equal(parseMarginPct("150"), 1); // clamp high
  assert.equal(parseMarginPct("-5"), 0); // clamp low
  assert.equal(parseMarginPct("x"), undefined);
});

test("CATALOG_PAGE_SIZE is the documented pagination threshold", () => {
  assert.equal(CATALOG_PAGE_SIZE, 50);
});
