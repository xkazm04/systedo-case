/** C3 — render a competitor set as a grounding line for the recap + social prompts,
 *  so the narrative can be comparative ("vs. the market") without inventing rivals or
 *  their numbers. Pure. Empty set → "". */
import type { SupportedLocale } from "@/lib/format";
import type { CompetitorSet } from "./types";

export function competitorGroundingText(
  set: CompetitorSet | null | undefined,
  locale: SupportedLocale = "cs"
): string {
  const list = set?.competitors ?? [];
  if (list.length === 0) return "";
  const names = list.map((c) => (c.note ? `${c.name} (${c.note})` : c.name)).join(", ");
  return locale === "en"
    ? `Competitive set: ${names}. Frame results against this market where relevant, but never state unverified competitor numbers — compare only on what's given.`
    : `Konkurenční pole: ${names}. Kde to dává smysl, zasaď výsledky do kontextu trhu, ale netvrď neověřená čísla konkurence — porovnávej jen na základě uvedeného.`;
}
