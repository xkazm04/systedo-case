/** A2 — live local signals. Today the map/ladder for a `local` project is
 *  illustrative (seeded packs). The map-pack COMPETITOR listing has no clean Google
 *  API (it's SERP data), but a business's own keyword RANK ladder can be brought in
 *  real — imported from any rank tracker, or later a provider/GBP connector. When a
 *  project has a synced ladder the module runs on it and labels it live; otherwise
 *  it falls back to the sample ladder, honestly marked. */
import type { KeywordRank } from "@/lib/mappack/sample";

export type LocalSignalsSource = "import" | "url" | "gbp";

export interface LocalSignalsMeta {
  source: LocalSignalsSource;
  /** ISO timestamp of the sync/import that produced these rows */
  syncedAt: string;
  /** number of rows this section carries */
  rowCount: number;
  /** for source "url": the hosted CSV the section was fetched from (enables refresh) */
  sourceUrl?: string;
}

/** A single imported public review (the live counterpart of reviews/sample's seed). */
export interface ImportedReview {
  id: string;
  author: string;
  area: string;
  /** star rating, clamped 1..5 */
  rating: number;
  text: string;
  /** ISO date (YYYY-MM-DD) the review was posted */
  at: string;
}

/** The live reviews section: its own provenance + the imported reviews. */
export interface ImportedReviews {
  meta: LocalSignalsMeta;
  items: ImportedReview[];
}

/** A single imported Google Business Profile location snapshot (D3). */
export interface ImportedGbpRow {
  /** location name as exported (matched to a catalog locality tolerantly on read) */
  name: string;
  /** connection health */
  status: "connected" | "attention" | "disconnected";
  reviews: number;
  /** average star rating, 0..5 */
  rating: number;
  /** reviews awaiting a reply */
  unanswered: number;
}

/** The live GBP section: its own provenance + the imported location rows. */
export interface ImportedGbp {
  meta: LocalSignalsMeta;
  rows: ImportedGbpRow[];
}

/** A single imported page-coverage row (D1): whether a dedicated page/microsite
 *  exists for one service×locality combination. Matched to the catalog-seeded coverage
 *  matrix tolerantly on read (case/whitespace-insensitive service|locality key). */
export interface ImportedCoverageRow {
  service: string;
  locality: string;
  /** a dedicated landing/microsite exists for this service×locality */
  hasPage: boolean;
}

/** The live coverage section: its own provenance + the imported page-presence rows.
 *  Fed by a tolerant CSV import AND by per-cell manual toggles on the coverage matrix,
 *  both riding the same union-merge store seam. */
export interface ImportedCoverage {
  meta: LocalSignalsMeta;
  rows: ImportedCoverageRow[];
}

/** Persisted per project: the keyword-rank ladder (top-level `meta`+`ladder`, kept
 *  for backward compatibility) plus optional live review, GBP and coverage sections,
 *  each with its own provenance. Old `{meta, ladder}` blobs read cleanly (the optional
 *  sections absent). */
export interface LocalSignals {
  meta: LocalSignalsMeta;
  ladder: KeywordRank[];
  reviews?: ImportedReviews;
  gbp?: ImportedGbp;
  coverage?: ImportedCoverage;
}
