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

/** Which provider a single idea came from. Distinct from the result-level `source`
 *  ("google-ads" | "sample") because a MERGED result carries ideas from more than one
 *  provider at once — so the label belongs per idea. Only set when sources are actually
 *  mixed (Sklik contributed); a Google-only / sample-only result leaves it undefined so
 *  its shape stays byte-identical to before Sklik existed. */
export type KeywordSource = "google" | "sklik" | "sample";

export const KEYWORD_SOURCE_LABELS: Record<KeywordSource, string> = {
  google: "Google",
  sklik: "Sklik",
  sample: "Ukázka",
};

/** What a provider (Ads Keyword Planner, Sklik, or the sample generator) returns
 *  before intent + opportunity are derived. */
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
  /** which provider produced THIS idea — set only on a merged (mixed-source) result */
  source?: KeywordSource;
}

/** Merge two raw idea lists (the Google/sample base + Sklik suggestions), deduped by
 *  keyword (case-insensitive, trimmed), preserving first-seen order. DEDUPE RULE —
 *  provenance first: a real provider record (google/sklik) always beats a `sample`
 *  record regardless of the sample's fabricated volume. Real-vs-real (or same-source)
 *  then keeps the RICHER record: the one with the higher avgMonthlySearches wins (a real
 *  volume beats a conservative default); ties keep whichever carries CPC bid data; still
 *  tied → keep the first (base) record. The kept record's own `source` label is preserved, so a
 *  keyword both providers return is attributed to whichever actually supplied the
 *  numbers shown. Pure — no I/O; the engine tags each side's `source` before calling. */
export function mergeRawIdeas(base: RawKeywordIdea[], extra: RawKeywordIdea[]): RawKeywordIdea[] {
  const richer = (a: RawKeywordIdea, b: RawKeywordIdea): RawKeywordIdea => {
    // Provenance trumps volume: a real Sklik measurement must never lose to a
    // fabricated sample volume (the sample generator scales head terms to ~9000,
    // which would otherwise beat Sklik's real figure and discard it). The volume
    // rule below applies only real-vs-real (e.g. google vs sklik) and same-source.
    const aSample = a.source === "sample";
    const bSample = b.source === "sample";
    if (aSample !== bSample) return aSample ? b : a;
    if (b.avgMonthlySearches > a.avgMonthlySearches) return b;
    if (b.avgMonthlySearches < a.avgMonthlySearches) return a;
    const aHasBid = a.highBidCzk > 0 || a.lowBidCzk > 0;
    const bHasBid = b.highBidCzk > 0 || b.lowBidCzk > 0;
    if (bHasBid && !aHasBid) return b;
    return a;
  };
  const byKey = new Map<string, RawKeywordIdea>();
  const order: string[] = [];
  for (const idea of [...base, ...extra]) {
    const key = idea.keyword.trim().toLowerCase();
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, idea);
      order.push(key);
    } else {
      byKey.set(key, richer(existing, idea));
    }
  }
  return order.map((k) => byKey.get(k)!);
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

/** A keyword frozen into a saved list (metrics snapshotted at save time). The CPC
 *  band + the raw 0–100 competition index are optional so legacy lists saved before
 *  CPC-aware economics (no bid fields) still read cleanly — consumers guard for
 *  `undefined` and fall back to the coarse competition band. */
export interface SavedKeyword {
  keyword: string;
  intent: KeywordIntent;
  opportunity: number;
  avgMonthlySearches: number;
  competition: Competition;
  /** low top-of-page bid, CZK (optional — absent on pre-CPC saved lists) */
  lowBidCzk?: number;
  /** high top-of-page bid, CZK (optional — absent on pre-CPC saved lists) */
  highBidCzk?: number;
  /** raw 0–100 competition index (optional — absent on pre-CPC saved lists) */
  competitionIndex?: number;
  tag: KeywordTag;
}

/** Estimated mid top-of-page bid (CZK): the midpoint of the low/high band, or
 *  whichever bound is present, else 0 when there is no bid data. Pure. */
export function midBidCzk(idea: { lowBidCzk?: number; highBidCzk?: number }): number {
  const lo = idea.lowBidCzk ?? 0;
  const hi = idea.highBidCzk ?? 0;
  if (lo > 0 && hi > 0) return (lo + hi) / 2;
  return hi || lo || 0;
}

/** Spend-efficiency = opportunity points per CZK of estimated top-of-page bid
 *  (opportunity ÷ mid CPC). It answers "how much organic upside does this keyword
 *  carry relative to what the paid click would cost" — a higher value is a better
 *  free-traffic bet than buying the click. A deliberately coarse, honest ratio (not
 *  a currency amount); keywords with no bid data (mid = 0) score 0 so they sink to
 *  the bottom of an efficiency sort rather than falsely topping it. */
export function spendEfficiency(idea: {
  opportunity: number;
  lowBidCzk?: number;
  highBidCzk?: number;
}): number {
  const mid = midBidCzk(idea);
  return mid > 0 ? idea.opportunity / mid : 0;
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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** True when `brand` occurs in `k` as a whole word (word-boundary match), not as a
 *  substring buried inside another word. Guards against short/generic project names
 *  ("Bio", "Ora") hijacking every keyword that merely contains those letters — a raw
 *  `includes` mislabels "srovnání" as brand for a project named "Ora". A brand shorter
 *  than 3 chars is too ambiguous to match at all. */
function brandMatches(k: string, brand: string): boolean {
  const b = brand.trim().toLowerCase();
  if (b.length < 3) return false;
  // A brand token that is itself a generic intent marker can't distinguish brand
  // intent from that marker's intent → don't let it claim the brand bucket.
  if (TRANSACTIONAL.includes(b) || INFORMATIONAL.includes(b) || LOCAL.includes(b)) return false;
  return new RegExp(`(^|\\s)${escapeRegex(b)}(\\s|$)`).test(k);
}

/** Classify a keyword's search intent. Brand match wins, then local (near-me /
 *  booking), then transactional, then informational; defaults to informational.
 *  Local is checked before transactional so "…objednat se poblíž" reads as local,
 *  not a generic buy query. Brand is matched on WORD BOUNDARIES (min 3 chars, never a
 *  generic marker word) so a short/common project name can't hijack every bucket. */
export function classifyIntent(keyword: string, brand?: string): KeywordIntent {
  const k = keyword.toLowerCase();
  if (brand && brandMatches(k, brand)) return "brand";
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
