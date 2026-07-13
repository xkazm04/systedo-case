/** Pure RAG query builders for the winning-patterns library — one per AI surface
 *  that grounds in patterns. Each turns the surface's own situation into a short
 *  natural-language query that `getPatternLines` ranks the library against, so the
 *  model sees the lessons that actually apply. No I/O, no React — directly unit-
 *  testable and shared by the analyze routes and the ads tool wiring. */
import {
  CAMPAIGN_TYPE_LABELS,
  aggregate,
  withMetrics,
  type Campaign,
} from "@/lib/campaigns/types";

/** The portfolio-eval query: totals + the best/worst campaign as anchors. Kept
 *  byte-identical to the string the analyze routes built inline, so the overall
 *  path's pattern ranking is unchanged. */
export function overallPatternQuery(campaigns: Campaign[]): string {
  const totals = aggregate(campaigns);
  const rows = campaigns.map(withMetrics);
  const best = [...rows].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...rows].filter((c) => c.cost > 0).sort((a, b) => a.roas - b.roas)[0];
  return [
    `Portfolio ROAS ${totals.roas.toFixed(1)}, PNO ${(totals.pno * 100).toFixed(0)} %.`,
    best ? `Nejlepší kampaň ${best.name} (${best.type}).` : "",
    worst ? `Nejslabší kampaň ${worst.name} (${worst.type}).` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The per-campaign-eval query: the campaign's type + its own headline metrics,
 *  so the ranked patterns are the ones relevant to a campaign of THIS shape and
 *  performance (a struggling Search campaign surfaces the brand-search /
 *  budget-trap lessons; a strong PMax surfaces the scaling ones). */
export function campaignPatternQuery(target: Campaign): string {
  const c = withMetrics(target);
  const parts = [`Kampaň ${target.name} typu ${CAMPAIGN_TYPE_LABELS[target.type]}.`];
  if (c.roas > 0 && Number.isFinite(c.pno)) {
    parts.push(`ROAS ${c.roas.toFixed(1)}, PNO ${(c.pno * 100).toFixed(0)} %.`);
  } else if (c.cost > 0) {
    parts.push(`Náklady ${Math.round(c.cost)} Kč bez návratnosti.`);
  }
  return parts.join(" ");
}

/** The ads-generator query: the campaign brief the user typed (product, benefits,
 *  audience) — grounds the creative patterns (headline angles, tone, offer) that
 *  actually fit what is being advertised. Keywords aren't known until generation,
 *  so the brief is the input signal. */
export function adPatternQuery(req: { product: string; benefits: string; audience: string }): string {
  return [req.product, req.benefits, req.audience]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(". ");
}
