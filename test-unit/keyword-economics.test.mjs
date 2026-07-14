/** Direction 2 — CPC-aware keyword economics:
 *  - midBidCzk / spendEfficiency: the honest opportunity-per-CZK signal that backs
 *    the research table's spend-efficiency sort (no bid data → 0, so it sinks).
 *  - deriveCompareQueries: uses the REAL 0–100 competition index for difficulty when
 *    a saved keyword carries it, and preserves the coarse banded fallback for legacy
 *    lists saved before CPC-aware economics. Pure. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { midBidCzk, spendEfficiency } from "@/lib/keywords/types";
import { deriveCompareQueries } from "@/lib/seo-compare/compute";

test("midBidCzk is the band midpoint, a present bound, or 0", () => {
  assert.equal(midBidCzk({ lowBidCzk: 10, highBidCzk: 30 }), 20);
  assert.equal(midBidCzk({ highBidCzk: 30 }), 30);
  assert.equal(midBidCzk({ lowBidCzk: 10 }), 10);
  assert.equal(midBidCzk({}), 0);
});

test("spendEfficiency = opportunity ÷ mid CPC; no bid data → 0", () => {
  // opportunity 80, mid CPC 20 → 4 opportunity points per CZK.
  assert.equal(spendEfficiency({ opportunity: 80, lowBidCzk: 10, highBidCzk: 30 }), 4);
  // no bids → 0 (sinks to the bottom of an efficiency sort, never falsely tops it).
  assert.equal(spendEfficiency({ opportunity: 90 }), 0);
});

test("spendEfficiency ranks a cheaper, equal-opportunity keyword higher", () => {
  const cheap = { opportunity: 60, lowBidCzk: 4, highBidCzk: 6 }; // mid 5 → 12
  const pricey = { opportunity: 60, lowBidCzk: 40, highBidCzk: 60 }; // mid 50 → 1.2
  assert.ok(spendEfficiency(cheap) > spendEfficiency(pricey));
});

test("deriveCompareQueries uses the REAL competition index for difficulty when present", () => {
  const [q] = deriveCompareQueries([
    { keyword: "nástroj cena", intent: "transactional", opportunity: 50, avgMonthlySearches: 900, competition: "high", competitionIndex: 82, tag: "core" },
  ]);
  assert.equal(q.difficulty, 82, "real index wins over the banded 75 for 'high'");
  assert.equal(q.intent, "pricing");
});

test("deriveCompareQueries falls back to the banded difficulty for legacy lists (no index)", () => {
  const [q] = deriveCompareQueries([
    { keyword: "nástroj cena", intent: "transactional", opportunity: 50, avgMonthlySearches: 900, competition: "high", tag: "core" },
  ]);
  assert.equal(q.difficulty, 75, "banded fallback for competition 'high'");
});

test("deriveCompareQueries clamps an out-of-range index into 0–100", () => {
  const [q] = deriveCompareQueries([
    { keyword: "nástroj recenze", intent: "informational", opportunity: 50, avgMonthlySearches: 400, competition: "low", competitionIndex: 140, tag: "watch" },
  ]);
  assert.equal(q.difficulty, 100);
});
