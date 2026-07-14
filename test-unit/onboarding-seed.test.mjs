/** Onboarding apply → keyword-list seed (src/lib/onboarding/seed.ts): the pure
 *  parts of the apply route — the idempotency decision and the payload shaping that
 *  turns a scan's plain keyword strings into SavedKeywords. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./json-loader.mjs", import.meta.url);

const { SCAN_LIST_SEED, scanKeywordsToSaved, shouldSeedScanList } = await import(
  "@/lib/onboarding/seed"
);

// --- payload sanitize -------------------------------------------------------

test("scanKeywordsToSaved: trims, drops empties, dedupes case-insensitively", () => {
  const saved = scanKeywordsToSaved(["  Zubař ", "zubař", "", "   ", "Implantáty"]);
  assert.deepEqual(saved.map((k) => k.keyword), ["Zubař", "Implantáty"]);
});

test("scanKeywordsToSaved: every keyword tagged core with zeroed metrics + medium competition", () => {
  const [k] = scanKeywordsToSaved(["boty"]);
  assert.equal(k.tag, "core");
  assert.equal(k.opportunity, 0);
  assert.equal(k.avgMonthlySearches, 0);
  assert.equal(k.competition, "medium");
  // no CPC fields fabricated (scan has none)
  assert.equal(k.lowBidCzk, undefined);
  assert.equal(k.highBidCzk, undefined);
});

test("scanKeywordsToSaved: intent is classified (brand-aware)", () => {
  const [k] = scanKeywordsToSaved(["Acme boty"], "Acme");
  assert.equal(k.intent, "brand");
  const [t] = scanKeywordsToSaved(["boty koupit"]);
  assert.equal(t.intent, "transactional");
});

test("scanKeywordsToSaved: bounded to at most 12 keywords", () => {
  const many = Array.from({ length: 30 }, (_, i) => `slovo-${i}`);
  assert.equal(scanKeywordsToSaved(many).length, 12);
});

test("scanKeywordsToSaved: non-string / empty input → []", () => {
  assert.deepEqual(scanKeywordsToSaved([]), []);
  assert.deepEqual(scanKeywordsToSaved([null, 42, undefined]), []);
});

// --- idempotency decision ---------------------------------------------------

test("shouldSeedScanList: seeds when the tenant has no scan-tagged list yet", () => {
  assert.equal(shouldSeedScanList([], 5), true);
  assert.equal(shouldSeedScanList(["boty", "vánoce"], 5), true);
});

test("shouldSeedScanList: skips when a scan-tagged list already exists (idempotent)", () => {
  assert.equal(shouldSeedScanList([SCAN_LIST_SEED], 5), false);
  assert.equal(shouldSeedScanList(["boty", SCAN_LIST_SEED, "vánoce"], 5), false);
});

test("shouldSeedScanList: skips when there are no keywords to save", () => {
  assert.equal(shouldSeedScanList([], 0), false);
  assert.equal(shouldSeedScanList(["boty"], 0), false);
});
