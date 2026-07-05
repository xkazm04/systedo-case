/** Catalog-grounded comparison queries — the replacement for the static
 *  SAMPLE_QUERIES. Uses the project's brand + each plan offering's named competitors
 *  to synthesize "{brand} alternativa / vs {competitor} / cena / recenze" queries.
 *  Volume/difficulty/rank are seeded deterministically off the query string (the
 *  rank-tracker / keyword-planner seam supplies the real figures). */
import type { PlanOffering } from "@/lib/catalog/offering";
import { seed01 } from "@/lib/project-data/seed";
import type { CompareIntent, CompareQuery } from "./sample";

const INTENT_VOLUME: Record<CompareIntent, [number, number]> = {
  alternative: [800, 2600],
  vs: [300, 1400],
  pricing: [500, 1900],
  review: [200, 900],
};

function synth(query: string, intent: CompareIntent): CompareQuery {
  const [lo, hi] = INTENT_VOLUME[intent];
  const volume = Math.round((lo + seed01(`${query}:vol`) * (hi - lo)) / 10) * 10;
  const difficulty = Math.round(28 + seed01(`${query}:diff`) * 46); // 28–74
  // Most comparison queries are white space (no page yet); ~30% already rank.
  const r = seed01(`${query}:rank`);
  const rank = r < 0.7 ? null : Math.round(6 + seed01(`${query}:pos`) * 20);
  return { query, intent, volume, difficulty, rank };
}

/** Generate comparison-intent queries for a brand from its plan offerings. Returns
 *  [] when there are no plans, so callers can fall back to the sample set. */
export function comparisonQueriesFromCatalog(brand: string, plans: PlanOffering[]): CompareQuery[] {
  if (plans.length === 0) return [];
  const competitors: string[] = [];
  const seen = new Set<string>();
  for (const p of plans) {
    for (const c of p.competitors) {
      const key = c.name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        competitors.push(c.name);
      }
    }
  }
  const out: CompareQuery[] = [synth(`${brand} alternativa`, "alternative")];
  for (const c of competitors) out.push(synth(`${brand} vs ${c}`, "vs"));
  out.push(synth(`${brand} cena`, "pricing"));
  out.push(synth(`${brand} recenze`, "review"));
  return out;
}
