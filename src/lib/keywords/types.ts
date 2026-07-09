/** Keyword research domain model — framework-free (no React, no I/O), shared by
 *  the Google Ads Keyword Planner client, the sample fallback, the API route and
 *  the UI. A "content gap" = high search volume meeting low competition. */

export type Competition = "low" | "medium" | "high";

export const COMPETITION_LABELS: Record<Competition, string> = {
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
};

export type KeywordIntent = "informational" | "transactional" | "brand" | "local";

export const KEYWORD_INTENT_LABELS: Record<KeywordIntent, string> = {
  informational: "Informační",
  transactional: "Transakční",
  brand: "Značkové",
  local: "Lokální",
};

/** What a provider (Ads Keyword Planner or the sample generator) returns before
 *  intent + opportunity are derived. */
export interface RawKeywordIdea {
  keyword: string;
  /** average monthly searches */
  avgMonthlySearches: number;
  competition: Competition;
  /** 0–100 competition index */
  competitionIndex: number;
  /** top-of-page bid range, CZK */
  lowBidCzk: number;
  highBidCzk: number;
}

/** A finalized idea with derived intent + opportunity, ready for the UI. */
export interface KeywordIdea extends RawKeywordIdea {
  intent: KeywordIntent;
  /** 0–100: high volume + low competition ranks highest (the content gap) */
  opportunity: number;
}

export interface KeywordGroup {
  intent: KeywordIntent;
  ideas: KeywordIdea[];
  totalVolume: number;
}

export interface KeywordResult {
  seed: string;
  /** which provider produced the data */
  source: "google-ads" | "sample";
  ideas: KeywordIdea[];
  groups: KeywordGroup[];
}

// --- saved lists (pure model; persistence lives in store.ts) ------------------

/** How a saved keyword is bucketed by the user. */
export type KeywordTag = "core" | "negative" | "watch";

export const KEYWORD_TAG_LABELS: Record<KeywordTag, string> = {
  core: "Klíčové",
  negative: "Vylučovací",
  watch: "Sledované",
};

/** A keyword frozen into a saved list (metrics snapshotted at save time). */
export interface SavedKeyword {
  keyword: string;
  intent: KeywordIntent;
  opportunity: number;
  avgMonthlySearches: number;
  competition: Competition;
  tag: KeywordTag;
}

export interface KeywordListInput {
  name: string;
  seed: string;
  source: KeywordResult["source"];
  keywords: SavedKeyword[];
}

export interface KeywordList extends KeywordListInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Distinct negative keywords across all lists — the block you'd push to Ads as
 *  negatives to cut wasted spend. Pure; case-insensitive de-dupe, sorted (cs). */
export function aggregateNegatives(lists: KeywordList[]): string[] {
  const seen = new Map<string, string>();
  for (const list of lists) {
    for (const k of list.keywords) {
      if (k.tag !== "negative") continue;
      const key = k.keyword.trim().toLowerCase();
      if (key && !seen.has(key)) seen.set(key, k.keyword.trim());
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "cs"));
}

// --- intent classification (deterministic, Czech-aware) ----------------------

const TRANSACTIONAL = [
  "koupit", "koupě", "cena", "ceny", "levně", "levné", "sleva", "akce", "eshop",
  "e-shop", "objednat", "prodej", "nákup", "doprava", "skladem", "výprodej",
];
const INFORMATIONAL = [
  "jak", "co", "proč", "kdy", "kde", "návod", "recenze", "nejlepší", "srovnání",
  "test", "rozdíl", "vs", "druhy", "typy", "význam", "zdravé", "benefit",
];
// Near-me / booking markers — the way people search for a local service (find a
// provider nearby, get an appointment). A geo/"near me" query is its own intent:
// high commercial value but won by local presence (GBP + a locality page), not a
// generic transactional page — so it deserves its own bucket, not "transactional".
const LOCAL = [
  "v okolí", "poblíž", "poblíž mě", "nedaleko", "v okolí mě", "blízko", "u nás",
  "rezervace", "rezervovat", "objednání", "objednat se", "otevírací doba",
  "kontakt", "adresa", "pobočka", "provozovna",
];

/** Classify a keyword's search intent. Brand match wins, then local (near-me /
 *  booking), then transactional, then informational; defaults to informational.
 *  Local is checked before transactional so "…objednat se poblíž" reads as local,
 *  not a generic buy query. */
export function classifyIntent(keyword: string, brand?: string): KeywordIntent {
  const k = keyword.toLowerCase();
  if (brand && k.includes(brand.toLowerCase())) return "brand";
  if (LOCAL.some((t) => k.includes(t))) return "local";
  if (TRANSACTIONAL.some((t) => k.includes(t))) return "transactional";
  if (INFORMATIONAL.some((t) => k.includes(t))) return "informational";
  return "informational";
}

/** Opportunity score: 60 % normalized volume + 40 % inverse competition, so a
 *  high-volume / low-competition keyword (the gap worth writing for) tops out. */
export function opportunityScore(idea: RawKeywordIdea, maxVolume: number): number {
  const vol = maxVolume > 0 ? idea.avgMonthlySearches / maxVolume : 0;
  const ease = 1 - idea.competitionIndex / 100;
  return Math.round((vol * 0.6 + ease * 0.4) * 100);
}

/** Finalize raw ideas: classify intent, score opportunity, sort by opportunity
 *  (desc) and group by intent. */
export function finalizeKeywords(
  seed: string,
  source: KeywordResult["source"],
  raw: RawKeywordIdea[],
  brand?: string
): KeywordResult {
  const maxVolume = raw.reduce((m, r) => Math.max(m, r.avgMonthlySearches), 0);
  const ideas: KeywordIdea[] = raw
    .map((r) => ({
      ...r,
      intent: classifyIntent(r.keyword, brand),
      opportunity: opportunityScore(r, maxVolume),
    }))
    .sort((a, b) => b.opportunity - a.opportunity);

  const byIntent = new Map<KeywordIntent, KeywordIdea[]>();
  for (const idea of ideas) {
    const arr = byIntent.get(idea.intent);
    if (arr) arr.push(idea);
    else byIntent.set(idea.intent, [idea]);
  }
  const groups: KeywordGroup[] = [...byIntent.entries()]
    .map(([intent, list]) => ({
      intent,
      ideas: list,
      totalVolume: list.reduce((s, i) => s + i.avgMonthlySearches, 0),
    }))
    .sort((a, b) => b.totalVolume - a.totalVolume);

  return { seed, source, ideas, groups };
}
