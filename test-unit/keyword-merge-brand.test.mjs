/** Wave 26 — two ambiguity fixes in the keyword domain model (pure, no I/O):
 *  (a) mergeRawIdeas: provenance trumps volume, so a real Sklik measurement is never
 *      discarded in favour of a fabricated sample volume on a keyword both return.
 *  (b) classifyIntent: brand is matched on WORD BOUNDARIES (min 3 chars, never a
 *      generic marker word), so a short/common project name can't hijack every bucket. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRawIdeas, classifyIntent } from "@/lib/keywords/types";

const idea = (keyword, avgMonthlySearches, source, bid = 0) => ({
  keyword,
  avgMonthlySearches,
  competition: "low",
  competitionIndex: 20,
  lowBidCzk: bid,
  highBidCzk: bid,
  source,
});

test("a real Sklik record beats a higher-volume sample record on the same keyword", () => {
  const base = [idea("boty", 9000, "sample")]; // fabricated head-term volume
  const extra = [idea("boty", 1200, "sklik")]; // real, lower measured volume
  const merged = mergeRawIdeas(base, extra);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].source, "sklik", "provenance wins — the real record is kept");
  assert.equal(merged[0].avgMonthlySearches, 1200, "the real volume survives, not the sample's 9000");
});

test("real-vs-real (google vs sklik) still keeps the richer (higher-volume) record", () => {
  const base = [idea("boty", 800, "google")];
  const extra = [idea("boty", 1500, "sklik")];
  const merged = mergeRawIdeas(base, extra);
  assert.equal(merged[0].source, "sklik");
  assert.equal(merged[0].avgMonthlySearches, 1500);
});

test("non-overlapping keywords from both sources are all preserved in order", () => {
  const merged = mergeRawIdeas([idea("a", 100, "sample")], [idea("b", 50, "sklik")]);
  assert.deepEqual(merged.map((i) => i.keyword), ["a", "b"]);
});

test("brand match requires a whole-word hit — a substring inside another word does not fire", () => {
  // Project literally named "Ora" must NOT claim "srovnání" (which contains "ora").
  assert.notEqual(classifyIntent("srovnání nástrojů", "Ora"), "brand");
  // But a real whole-word brand mention does classify as brand.
  assert.equal(classifyIntent("ora recenze", "Ora"), "brand");
  assert.equal(classifyIntent("koupit ora", "Ora"), "brand");
});

test("a brand shorter than 3 chars never matches", () => {
  assert.notEqual(classifyIntent("cd přehrávač", "CD"), "brand");
});

test("a brand that is itself a generic marker word can't claim the brand bucket", () => {
  // "cena" is a transactional marker; a project named "Cena" must not turn every
  // pricing query into brand intent.
  assert.equal(classifyIntent("cena boty", "Cena"), "transactional");
});

test("a distinctive brand still wins over other buckets (unchanged behavior)", () => {
  assert.equal(classifyIntent("flowbase cena", "Flowbase"), "brand");
});
