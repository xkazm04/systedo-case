/** Winning-patterns domain model — framework-free (no I/O, no firebase), shared
 *  by the extractor, the API route and the UI. A "pattern" is a reusable lesson
 *  mined from the tenant's own results (or saved by hand). */

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
}

export function isPatternCategory(v: unknown): v is PatternCategory {
  return typeof v === "string" && (PATTERN_CATEGORIES as readonly string[]).includes(v);
}
