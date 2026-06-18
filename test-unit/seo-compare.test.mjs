/** Unit tests for the parameterized opportunity scoring in the Srovnání & SEO
 *  module: custom weights/thresholds must re-rank and re-tier vs the defaults,
 *  while the no-arg call must reproduce the pinned default behavior. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreQueries,
  DEFAULT_SCORE_WEIGHTS,
} from "@/lib/seo-compare/compute";

/** A pricing query the defaults rank *below* a higher-volume vs query — until we
 *  tilt the pricing intent weight up. Both not-ranking (same rankFactor) so the
 *  intent weight × volume is the only lever. */
const QUERIES = [
  { query: "vs-big", intent: "vs", volume: 1200, difficulty: 30, rank: null },
  { query: "pricing-small", intent: "pricing", volume: 900, difficulty: 30, rank: null },
];

test("scoreQueries with no weights reproduces the default ranking/tiers", () => {
  const withDefault = scoreQueries(QUERIES);
  const withExplicit = scoreQueries(QUERIES, DEFAULT_SCORE_WEIGHTS);
  // identical query order and per-query score/tier
  assert.deepEqual(
    withDefault.map((r) => [r.query, r.score, r.opportunity]),
    withExplicit.map((r) => [r.query, r.score, r.opportunity]),
  );
  // default intent weights leave the higher-volume vs query on top
  // (1200×1.2 = 1440 > 900×1.4 = 1260)
  assert.equal(withDefault[0].query, "vs-big");
});

test("boosting the pricing intent weight promotes the pricing query", () => {
  const tuned = {
    ...DEFAULT_SCORE_WEIGHTS,
    intent: { ...DEFAULT_SCORE_WEIGHTS.intent, pricing: 2.0 },
  };
  const ranked = scoreQueries(QUERIES, tuned);
  // 900×2.0 = 1800 now beats 1200×1.2 = 1440
  assert.equal(ranked[0].query, "pricing-small");
});

test("custom tier thresholds change the opportunity tier", () => {
  // one clearly dominant query → the other normalizes well below it.
  const data = [
    { query: "top", intent: "pricing", volume: 5000, difficulty: 20, rank: null },
    { query: "mid", intent: "pricing", volume: 1500, difficulty: 20, rank: null },
  ];
  // "mid" normalizes to 1500/5000 = 0.30 → "low" under the default 0.33 medium cut
  const def = scoreQueries(data);
  assert.equal(def.find((r) => r.query === "mid").opportunity, "low");
  // lower the medium cutoff to 0.2 and it becomes "medium"
  const loose = scoreQueries(data, { ...DEFAULT_SCORE_WEIGHTS, mediumCutoff: 0.2 });
  assert.equal(loose.find((r) => r.query === "mid").opportunity, "medium");
});

test("the original default-output test still holds (regression guard)", () => {
  const ranked = scoreQueries([
    { query: "a", intent: "pricing", volume: 2000, difficulty: 30, rank: null },
    { query: "b", intent: "review", volume: 200, difficulty: 60, rank: 3 },
  ]);
  assert.equal(ranked[0].query, "a");
  assert.equal(ranked[0].opportunity, "high");
});
