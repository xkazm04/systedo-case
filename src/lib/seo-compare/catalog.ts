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

/** Case/diacritic-insensitive fold, so "Alza"/"alza" and accented duplicates
 *  collapse to one competitor. */
function foldKey(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** The one competitor slate: the union of the project's STORED competitor set
 *  (onboarding-seeded, user-editable in the report page) and the competitors named
 *  on its plan offerings, deduped case/diacritic-insensitively. Stored competitors
 *  lead in their given order; plan competitors follow in first-seen order, skipping
 *  any the stored set already contributed. Deterministic ordering keeps the seeded
 *  synth volumes stable per query string, so a given competitor's "vs" volume is the
 *  same however it entered the slate. Pure — the caller does the store I/O. */
export function mergeCompetitors(stored: string[], plans: PlanOffering[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const key = foldKey(name);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const s of stored) add(s);
  for (const p of plans) for (const c of p.competitors) add(c.name);
  return out;
}

/** Generate comparison-intent queries for a brand from its plan offerings AND its
 *  stored competitor set (the union — see {@link mergeCompetitors}). Returns [] only
 *  when there are neither plans nor stored competitors, so callers fall back to the
 *  sample set. Because the stored set feeds in here, editing competitors in the
 *  report page reshapes the "vs {competitor}" slate on the next load. */
export function comparisonQueriesFromCatalog(
  brand: string,
  plans: PlanOffering[],
  storedCompetitors: string[] = [],
): CompareQuery[] {
  const competitors = mergeCompetitors(storedCompetitors, plans);
  // Nothing to ground on (no plans, no stored rivals) → sample fallback upstream.
  if (plans.length === 0 && competitors.length === 0) return [];
  const out: CompareQuery[] = [synth(`${brand} alternativa`, "alternative")];
  for (const c of competitors) out.push(synth(`${brand} vs ${c}`, "vs"));
  out.push(synth(`${brand} cena`, "pricing"));
  out.push(synth(`${brand} recenze`, "review"));
  return out;
}
