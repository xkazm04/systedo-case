/** Opportunity scoring for comparison/alternative queries: weight by intent,
 *  reward white-space (not ranking / ranking poorly), penalize difficulty. Pure.
 *
 *  Scoring is parameterized: callers may pass their own intent weights and
 *  high/medium tier cutoffs (the "Ladění skóre" panel lets a user tilt the
 *  ranking toward the intent that converts hardest for their app). When no
 *  weights are given it falls back to DEFAULT_SCORE_WEIGHTS, so the static
 *  default ranking — and the unit test pinned to it — stays unchanged. */
import type { CompareIntent, CompareQuery } from "./sample";

export const INTENT_LABELS: Record<CompareIntent, string> = {
  alternative: "Alternativa",
  vs: "Srovnání",
  pricing: "Cena",
  review: "Recenze",
};

export type Opportunity = "high" | "medium" | "low";

/** Tunable scoring inputs. `intent` multiplies a query's volume by how much that
 *  buying-stage matters; `highCutoff` / `mediumCutoff` are the normalized-score
 *  thresholds (0..1) for the high / medium opportunity tiers. */
export interface ScoreWeights {
  intent: Record<CompareIntent, number>;
  /** normalized score (0..1) at/above which a query is a "high" opportunity */
  highCutoff: number;
  /** normalized score (0..1) at/above which a query is a "medium" opportunity */
  mediumCutoff: number;
}

/** The original hardcoded constants, now the default. Changing the panel away
 *  from these re-ranks; "Obnovit výchozí" restores exactly this. */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  intent: {
    pricing: 1.4,
    alternative: 1.3,
    vs: 1.2,
    review: 1.0,
  },
  highCutoff: 0.66,
  mediumCutoff: 0.33,
};

export interface ScoredQuery extends CompareQuery {
  score: number;
  opportunity: Opportunity;
}

/** More upside when we don't yet rank (or rank poorly) for a high-intent term. */
function rankFactor(rank: number | null): number {
  if (rank == null) return 1.3;
  if (rank > 10) return 1.15;
  if (rank > 3) return 0.7;
  return 0.3;
}

export function scoreQueries(
  queries: CompareQuery[],
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): ScoredQuery[] {
  const scored = queries.map((q) => {
    const score = (q.volume * weights.intent[q.intent] * rankFactor(q.rank)) / Math.max(20, q.difficulty);
    return { ...q, score, opportunity: "low" as Opportunity };
  });
  const max = Math.max(...scored.map((s) => s.score), 1);
  for (const s of scored) {
    const norm = s.score / max;
    s.opportunity = norm >= weights.highCutoff ? "high" : norm >= weights.mediumCutoff ? "medium" : "low";
  }
  return scored.sort((a, b) => b.score - a.score);
}
