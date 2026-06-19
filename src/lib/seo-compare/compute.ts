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

// --- Acquisition tie: ground each SEO opportunity in real conversion economics ---

/** Relative conversion propensity per intent vs the site's baseline CR: bottom-
 *  funnel intents (pricing/alternative) convert nearer the site rate, research
 *  intents (vs/review) lower. A coarse, clearly-labeled estimate — there is no
 *  query-level attribution, so we anchor to the real channel CR and tilt by stage. */
const INTENT_CONVERSION_FACTOR: Record<CompareIntent, number> = {
  pricing: 1.0,
  alternative: 0.85,
  vs: 0.7,
  review: 0.6,
};

/** The acquisition channel comparison/SEO content earns traffic into, with that
 *  channel's REAL economics from the project's performance data. */
export interface SeoChannel {
  channel: string;
  /** real conversion rate of that channel (0..1) */
  cr: number;
  /** average order value of that channel (CZK) */
  aov: number;
}

/** Pick the organic/SEO channel from the project's channel rows (SEO content earns
 *  organic/direct traffic), falling back to the top channel. Null when no usable CR. */
export function seoChannelFrom(
  rows: { channel: string; cr: number; aov: number }[],
): SeoChannel | null {
  const organic = rows.find((r) => /organ|přím|seo/i.test(r.channel));
  const pick = organic ?? rows[0];
  return pick && pick.cr > 0 ? { channel: pick.channel, cr: pick.cr, aov: pick.aov } : null;
}

/** What winning a query is worth, tied to real economics — so ranking reflects
 *  expected RESULTS (conversions/revenue), not just search volume. */
export interface QueryAcquisition {
  channel: string;
  cr: number;
  /** estimated monthly conversions: volume × channel CR × buying-stage factor */
  estConversions: number;
  /** estimated monthly revenue: estConversions × channel AOV (0 when no AOV) */
  estRevenue: number;
}

export function acquisitionFor(q: CompareQuery, seo: SeoChannel | null): QueryAcquisition | null {
  if (!seo || seo.cr <= 0) return null;
  const estConversions = q.volume * seo.cr * INTENT_CONVERSION_FACTOR[q.intent];
  return { channel: seo.channel, cr: seo.cr, estConversions, estRevenue: estConversions * seo.aov };
}
