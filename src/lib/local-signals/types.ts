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
  /** number of ranked keyword×area rows */
  rowCount: number;
  /** for source "url": the hosted CSV the ladder was fetched from (enables refresh) */
  sourceUrl?: string;
}

/** Persisted per project: provenance + the live keyword-rank ladder. */
export interface LocalSignals {
  meta: LocalSignalsMeta;
  ladder: KeywordRank[];
}
