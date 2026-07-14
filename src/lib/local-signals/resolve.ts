/** A2 data-source seam for the local ranking ladder. `resolveLocalLadder` returns
 *  the project's imported/synced ladder when it has one, else the sample ladder
 *  (clearly illustrative) — the single place mapa/lokalni flip demo→real for rank.
 *  The competitor map-pack stays sample (no clean API) and is labelled as such.
 *  Server-only (reads the local-signals store). */
import "server-only";
import type { KeywordRank } from "@/lib/mappack/sample";
import type { ReviewItem } from "@/lib/reviews/sample";
import { fromImported } from "@/lib/reviews/compute";
import { getLocalSignals } from "./store";
import type { LocalSignalsSource } from "./types";

export interface ResolvedLadder {
  ladder: KeywordRank[];
  /** "sample" (illustrative) or the live provenance once imported/synced. */
  source: "sample" | LocalSignalsSource;
  live: boolean;
  syncedAt?: string;
  /** for source "url": the hosted CSV to refresh from */
  sourceUrl?: string;
}

/** The active ranking ladder for a project: live when synced rows exist, else the
 *  passed sample ladder. `sample` is computed by the caller (keywordLadder) so this
 *  stays free of the catalog/locality plumbing. */
export async function resolveLocalLadder(
  projectId: string,
  sample: KeywordRank[]
): Promise<ResolvedLadder> {
  let signals = null;
  try {
    signals = await getLocalSignals(projectId);
  } catch {
    signals = null; // store hiccup → sample, never break the map
  }
  if (signals && signals.ladder.length > 0) {
    return {
      ladder: signals.ladder,
      source: signals.meta.source,
      live: true,
      syncedAt: signals.meta.syncedAt,
      sourceUrl: signals.meta.sourceUrl,
    };
  }
  return { ladder: sample, source: "sample", live: false };
}

export interface ResolvedReviews {
  reviews: ReviewItem[];
  source: "sample" | LocalSignalsSource;
  live: boolean;
  syncedAt?: string;
  sourceUrl?: string;
}

/** The active review set for a project: the imported reviews when a live section
 *  exists, else the passed sample. Same live-over-sample seam as the ladder — the
 *  single place the review inbox / reputation surfaces flip demo→real. */
export async function resolveReviews(
  projectId: string,
  sample: ReviewItem[],
  now: number = Date.now()
): Promise<ResolvedReviews> {
  let signals = null;
  try {
    signals = await getLocalSignals(projectId);
  } catch {
    signals = null; // store hiccup → sample, never break the inbox
  }
  const imported = signals?.reviews;
  if (imported && imported.items.length > 0) {
    return {
      reviews: fromImported(imported.items, now),
      source: imported.meta.source,
      live: true,
      syncedAt: imported.meta.syncedAt,
      sourceUrl: imported.meta.sourceUrl,
    };
  }
  return { reviews: sample, source: "sample", live: false };
}
