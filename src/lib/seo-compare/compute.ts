/** Opportunity scoring for comparison/alternative queries: weight by intent,
 *  reward white-space (not ranking / ranking poorly), penalize difficulty. Pure. */
import type { CompareIntent, CompareQuery } from "./sample";

export const INTENT_LABELS: Record<CompareIntent, string> = {
  alternative: "Alternativa",
  vs: "Srovnání",
  pricing: "Cena",
  review: "Recenze",
};

const INTENT_WEIGHT: Record<CompareIntent, number> = {
  pricing: 1.4,
  alternative: 1.3,
  vs: 1.2,
  review: 1.0,
};

export type Opportunity = "high" | "medium" | "low";

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

export function scoreQueries(queries: CompareQuery[]): ScoredQuery[] {
  const scored = queries.map((q) => {
    const score = (q.volume * INTENT_WEIGHT[q.intent] * rankFactor(q.rank)) / Math.max(20, q.difficulty);
    return { ...q, score, opportunity: "low" as Opportunity };
  });
  const max = Math.max(...scored.map((s) => s.score), 1);
  for (const s of scored) {
    const norm = s.score / max;
    s.opportunity = norm >= 0.66 ? "high" : norm >= 0.33 ? "medium" : "low";
  }
  return scored.sort((a, b) => b.score - a.score);
}
