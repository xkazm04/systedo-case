/** Unit tests for the lead-quality, SEO-opportunity and experiment signal math
 *  that feed the cross-module recommendations. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMetrics, summarize } from "@/lib/lead-quality/compute";
import { scoreQueries } from "@/lib/seo-compare/compute";
import { evaluate } from "@/lib/lp-exp/compute";

test("lead-quality flags cheap-but-junk sources by qualification rate", () => {
  const junk = { source: "Meta", leads: 1000, qualified: 100, won: 5, spend: 50_000, revenue: 200_000 };
  const good = { source: "Search", leads: 100, qualified: 80, won: 30, spend: 50_000, revenue: 900_000 };
  assert.equal(withMetrics(junk).junk, true); // qualRate 0.10 < 0.35, paid
  assert.equal(withMetrics(good).junk, false);
  // CPQL > CPL for the junk source
  const m = withMetrics(junk);
  assert.ok(m.cpql > m.cpl);
  assert.equal(summarize([junk, good]).junkCount, 1);
});

test("scoreQueries ranks high-volume white-space first", () => {
  const ranked = scoreQueries([
    { query: "a", intent: "pricing", volume: 2000, difficulty: 30, rank: null },
    { query: "b", intent: "review", volume: 200, difficulty: 60, rank: 3 },
  ]);
  assert.equal(ranked[0].query, "a");
  assert.equal(ranked[0].opportunity, "high");
});

test("evaluate detects a significant landing-page winner", () => {
  const r = evaluate({
    id: "x",
    cluster: "c",
    status: "done",
    variants: [
      { label: "A", visitors: 5000, signups: 200 },
      { label: "B", visitors: 5000, signups: 300 },
    ],
  });
  assert.equal(r.winner.label, "B");
  assert.equal(r.significant, true);
  assert.ok(r.confidence > 0.9);
});
