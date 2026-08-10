/** Brief grounding — the PURE half.
 *
 *  Tvorba's header chips used to be claims nobody kept: "Podloženo {n} vzory"
 *  counted the whole pattern library while the brief mode injected only the brand
 *  context, and the keyword chip counted saved lists that never reached a prompt.
 *  This module is the single derivation both sides now read, so the chip and the
 *  prompt cannot disagree:
 *
 *    • the /api/ai `brief` row (modes.ts prepare) injects exactly what these
 *      helpers select, and
 *    • ContentEngine's chips count exactly what these helpers select.
 *
 *  Framework-free and I/O-free (no React, no store) so the client component and the
 *  server mode row can both import it; the store-touching resolver lives next door
 *  in ./grounding-load. Unit-pinned by test-unit/content-engine-grounding.test.mjs. */
import type { BriefKeyword } from "@/lib/ai-types";
import type { KeywordList, SavedKeyword } from "@/lib/keywords/types";
import type { Pattern } from "@/lib/patterns/types";

/** How many keyword rows ride into a brief prompt. Mirrors the `slice(0, 12)` in
 *  lib/ai/tools/brief.ts — beyond it the model simply never sees the row, so the
 *  chip must not count it either. */
export const BRIEF_KEYWORD_LIMIT = 12;

/** How many pattern lines ride into a brief prompt — the `limit` the ad-pattern
 *  resolver passes to getPatternLines, which returns exactly `min(eligible, limit)`
 *  lines (MMR re-ranks, it never pads). So the injected count is predictable. */
export const BRIEF_PATTERN_LIMIT = 6;

/** The truth-in-labeling suffix `sampleLessonPatterns()` stamps on every
 *  demo-derived lesson (lib/patterns/extract.ts). The prompt path drops those for a
 *  real tenant (`promptSafePatterns`), and so must the chip — but extract.ts is
 *  server-only (node:crypto + the campaign store), so the client re-uses the
 *  published MARKER rather than the function. The unit test pins the two together. */
export const SAMPLE_LESSON_MARKER = "(ukázková lekce)";

/** The saved keywords that actually ground a brief: negatives are what the account
 *  wants OUT of its traffic, so they are excluded; the rest is de-duplicated
 *  case-insensitively across lists, ranked by opportunity (the high-volume /
 *  low-competition gaps first) and capped at what the prompt will read. */
export function groundableKeywords(lists: KeywordList[]): SavedKeyword[] {
  const seen = new Map<string, SavedKeyword>();
  for (const list of lists) {
    for (const k of list.keywords ?? []) {
      if (k.tag === "negative") continue;
      const key = k.keyword.trim().toLowerCase();
      if (!key) continue;
      const prev = seen.get(key);
      if (!prev || k.opportunity > prev.opportunity) seen.set(key, k);
    }
  }
  return [...seen.values()]
    .sort((a, b) => b.opportunity - a.opportunity || a.keyword.localeCompare(b.keyword, "cs"))
    .slice(0, BRIEF_KEYWORD_LIMIT);
}

/** Saved keywords in the shape the brief prompt renders (volume + competition). */
export function toBriefKeywords(saved: SavedKeyword[]): BriefKeyword[] {
  return saved.map((k) => ({
    keyword: k.keyword,
    volume: k.avgMonthlySearches,
    competition: k.competition,
  }));
}

/** Merge the keywords the caller already carried (a workspace seed — the most
 *  relevant rows, they came from the clicked cluster) with the account's saved
 *  ones, first-seen order preserved and capped at the prompt's own limit. */
export function mergeBriefKeywords(
  seeded: BriefKeyword[] | undefined,
  saved: BriefKeyword[]
): BriefKeyword[] {
  const out: BriefKeyword[] = [];
  const seen = new Set<string>();
  for (const k of [...(seeded ?? []), ...saved]) {
    const key = k.keyword.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
    if (out.length === BRIEF_KEYWORD_LIMIT) break;
  }
  return out;
}

/** A demo-derived sample lesson (see SAMPLE_LESSON_MARKER). */
export function isSampleLesson(p: Pick<Pattern, "insight">): boolean {
  return p.insight.trimEnd().endsWith(SAMPLE_LESSON_MARKER);
}

/** The patterns that may ground THIS tenant's brief, in the same order and under
 *  the same two rules the prompt path applies (`getPatternLines`): a saved pin that
 *  fresh data contradicts is dropped, and demo-derived sample lessons ride along
 *  only on the demo/anonymous surface — never framed as a real account's own wins. */
export function groundablePatterns(
  library: { auto?: Pattern[]; saved?: Pattern[] },
  sampleAllowed: boolean
): Pattern[] {
  return [...(library.saved ?? []), ...(library.auto ?? [])].filter(
    (p) => !p.contradicted && (sampleAllowed || !isSampleLesson(p))
  );
}

/** How many pattern lines a brief generated right now would actually carry. */
export function groundablePatternCount(
  library: { auto?: Pattern[]; saved?: Pattern[] },
  sampleAllowed: boolean
): number {
  return Math.min(groundablePatterns(library, sampleAllowed).length, BRIEF_PATTERN_LIMIT);
}

/** The RAG query for a brief, in the shape the shared ad-pattern resolver takes:
 *  what the piece is about, the term it must win, and who it is for — the brief's
 *  analogue of the ad brief's product / benefits / audience. */
export function briefPatternQuery(req: {
  topic: string;
  primaryKeyword: string;
  audience: string;
}): { product: string; benefits: string; audience: string } {
  return { product: req.topic, benefits: req.primaryKeyword, audience: req.audience };
}

/** Compose the brief's USER-prompt grounding block: the brand context, then the
 *  account's proven pattern lines under their own heading.
 *
 *  Why one string: `BriefRequest.brand` is the tool's existing user-prompt
 *  grounding channel, and a merged grounding text is the house idiom (see
 *  `mergeGrounding` in api/ai/grounding.ts, which joins lead / competitor / profit
 *  / annotation blocks the same way). Nothing here touches the system prompt or
 *  schema, so the LLM-gate golden fingerprint is unmoved.
 *
 *  Byte-identity: with no patterns this returns `brand` unchanged, so every
 *  ungrounded / demo call keeps its exact previous request shape → cache key. */
export function composeBriefBrand(brand: string, patternLines: string[]): string {
  const lines = patternLines.map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return brand;
  const block = [
    "Co se v tomto účtu prokazatelně osvědčilo (vzory z reálného výkonu — ber je jako vodítko pro úhel a argumenty, necituj je doslova):",
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
  return brand ? `${brand}\n\n${block}` : block;
}
