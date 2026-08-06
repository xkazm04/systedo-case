/** Winning-patterns domain model — framework-free (no I/O, no firebase), shared
 *  by the extractor, the API route and the UI. A "pattern" is a reusable lesson
 *  mined from the tenant's own results (or saved by hand). */

import type { SupportedLocale } from "@/lib/format";

export type PatternCategory = "structure" | "budget" | "creative" | "targeting" | "trend";

export const PATTERN_CATEGORIES: PatternCategory[] = [
  "structure",
  "budget",
  "creative",
  "targeting",
  "trend",
];

export const PATTERN_CATEGORY_LABELS: Record<PatternCategory, string> = {
  structure: "Struktura účtu",
  budget: "Rozpočet & bidding",
  creative: "Kreativa & inzeráty",
  targeting: "Cílení",
  trend: "Trend & optimalizace",
};

export const PATTERN_CATEGORY_LABELS_EN: Record<PatternCategory, string> = {
  structure: "Account structure",
  budget: "Budget & bidding",
  creative: "Creative & ads",
  targeting: "Targeting",
  trend: "Trend & optimization",
};

/** The category label for the reader's locale — the library's filter chips, the
 *  pill on each pattern card and the manual-add picker. The KEY is the persisted
 *  `PatternCategory`; only the label is copy. */
export function patternCategoryLabel(c: PatternCategory, locale: SupportedLocale): string {
  return (locale === "en" ? PATTERN_CATEGORY_LABELS_EN : PATTERN_CATEGORY_LABELS)[c];
}

export interface Pattern {
  id: string;
  title: string;
  category: PatternCategory;
  /** the reusable lesson */
  insight: string;
  /** the data that backs it (numbers from the account) */
  evidence: string;
  /** how it was created: derived from data vs hand-saved */
  source: "auto" | "manual";
  createdAt: string;
  /** Direction 2 (library surface only): fresh mined data now contradicts this
   *  SAVED pattern's claim — the named campaign/type/channel fell below target since
   *  it was pinned. Set by `getLibrary`; a contradicted pin is excluded from prompts
   *  (`getPatternLines`) and flagged in the UI so the user unpins. Never persisted,
   *  never set on auto/prompt-path patterns. */
  contradicted?: boolean;
}

export function isPatternCategory(v: unknown): v is PatternCategory {
  return typeof v === "string" && (PATTERN_CATEGORIES as readonly string[]).includes(v);
}

/** A pattern with a search relevance score (0–1) — semantic cosine, or 1 for a
 *  substring fallback hit. */
export interface RankedPattern extends Pattern {
  relevance: number;
}
