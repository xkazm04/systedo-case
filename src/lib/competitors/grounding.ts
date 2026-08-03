/** C3 — render a competitor set as a grounding line for the recap + social prompts,
 *  so the narrative can be comparative ("vs. the market") without inventing rivals or
 *  their numbers. Pure. Empty set → "".
 *
 *  CURATION GATE: only entries the user actually stands behind are named to the model —
 *  manual entries, plus scan suggestions the user confirmed (see `isCurated`). An
 *  unreviewed website-scan guess is NOT a fact about the tenant's market, and asserting
 *  one to an LLM as "this is your competitive set" manufactures a premise the user never
 *  agreed to. A set consisting ONLY of unconfirmed suggestions grounds nothing → "",
 *  exactly as an empty set does. Legacy records (no `source`) count as manual and are
 *  unaffected. */
import type { SupportedLocale } from "@/lib/format";
import { curatedCompetitors, type CompetitorSet } from "./types";

export function competitorGroundingText(
  set: CompetitorSet | null | undefined,
  locale: SupportedLocale = "cs"
): string {
  const list = curatedCompetitors(set?.competitors);
  if (list.length === 0) return "";
  const names = list.map((c) => (c.note ? `${c.name} (${c.note})` : c.name)).join(", ");
  return locale === "en"
    ? `Competitive set: ${names}. Frame results against this market where relevant, but never state unverified competitor numbers — compare only on what's given.`
    : `Konkurenční pole: ${names}. Kde to dává smysl, zasaď výsledky do kontextu trhu, ale netvrď neověřená čísla konkurence — porovnávej jen na základě uvedeného.`;
}
