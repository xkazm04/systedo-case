/** Sklik → neutral keyword-idea adapter: fetch keyword suggestions for a seed and map
 *  Sklik's wire shape onto this app's framework-free RawKeywordIdea (the same shape the
 *  Google Keyword Planner client and the sample generator produce), so the keyword
 *  engine can MERGE Sklik ideas with the Google/sample result. DATA-IN only. Pure over a
 *  {@link SklikClient}, so a fixture transport exercises the whole mapping with no
 *  network — parallels sklik/adapter.ts (the campaign fetchers).
 *
 *  MAPPING SEAM (the moneyToCzk precedent): Sklik's public drak keyword surface is not
 *  stably documented offline — the RPC method name lives in client.ts
 *  (SKLIK_KEYWORDS_METHOD) and every field assumption is localised in
 *  `mapSklikSuggestion` here. When a metric is absent, a CONSERVATIVE default is used
 *  (documented per field) so a Sklik-only keyword lands LOW in the opportunity ranking
 *  rather than falsely topping it. Verify the units + field names against a real account
 *  and adjust only this file. */
import type { Competition, KeywordSource, RawKeywordIdea } from "@/lib/keywords/types";
import type { SklikClient } from "./client";
import { moneyToCzk, type SklikKeywordSuggestion } from "./types";

/** The source label every Sklik-derived idea carries into a merged result. */
export const SKLIK_KEYWORD_SOURCE: KeywordSource = "sklik";

// --- conservative defaults for absent metrics (documented) -------------------

/** Unknown search volume → a small, honest floor (NOT an invented headline number), so
 *  the idea still surfaces but its normalised-volume contribution to `opportunity` is
 *  near zero. */
export const SKLIK_DEFAULT_VOLUME = 10;
/** Unknown competition → mid (index 50) rather than optimistic-low, so an unknown-
 *  difficulty keyword isn't flattered in the opportunity score. */
export const SKLIK_DEFAULT_COMPETITION_INDEX = 50;

function competitionBand(index: number): Competition {
  return index >= 66 ? "high" : index >= 33 ? "medium" : "low";
}

/** Normalise Sklik's `competition` (which may be 0–1 OR 0–100 depending on the surface —
 *  offline-unverifiable) into a 0–100 index. A value ≤ 1 is read as a fraction. */
function competitionIndex(raw: number | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return SKLIK_DEFAULT_COMPETITION_INDEX;
  const idx = raw <= 1 ? raw * 100 : raw;
  return Math.max(0, Math.min(100, Math.round(idx)));
}

/** Map one Sklik suggestion onto a neutral RawKeywordIdea, or null to drop it (no
 *  keyword). Best-effort volume/competition/CPC; absent fields fall back to the
 *  conservative defaults above. Bids derive from `avgCpc` (through the moneyToCzk seam)
 *  as a symmetric band around the average; no CPC → 0/0 (the idea scores 0 on spend
 *  efficiency and sinks in that sort, honestly, rather than inventing a price). */
export function mapSklikSuggestion(s: SklikKeywordSuggestion): RawKeywordIdea | null {
  const keyword = typeof s.keyword === "string" ? s.keyword.trim() : "";
  if (!keyword) return null;
  const avgMonthlySearches =
    s.searchCount != null && Number.isFinite(s.searchCount) && s.searchCount > 0
      ? Math.round(s.searchCount)
      : SKLIK_DEFAULT_VOLUME;
  const idx = competitionIndex(s.competition);
  const cpc = s.avgCpc != null ? moneyToCzk(s.avgCpc) : 0;
  const lowBidCzk = cpc > 0 ? Math.max(1, Math.round(cpc * 0.7)) : 0;
  const highBidCzk = cpc > 0 ? Math.round(cpc * 1.3) : 0;
  return {
    keyword,
    avgMonthlySearches,
    competition: competitionBand(idx),
    competitionIndex: idx,
    lowBidCzk,
    highBidCzk,
    source: SKLIK_KEYWORD_SOURCE,
  };
}

/** Fetch + map Sklik keyword ideas for a seed. Pure over the client (injectable
 *  transport). Drops suggestions with no keyword. Never sets a top-level source — the
 *  caller (keyword engine) decides how to merge/label. */
export async function fetchSklikKeywordIdeas(client: SklikClient, seed: string): Promise<RawKeywordIdea[]> {
  const suggestions = await client.suggestKeywords(seed);
  return suggestions
    .map(mapSklikSuggestion)
    .filter((i): i is RawKeywordIdea => i !== null);
}
