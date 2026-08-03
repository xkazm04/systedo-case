/** A2 data-source seam for the local ranking ladder. `resolveLocalLadder` returns
 *  the project's imported/synced ladder when it has one, else the sample ladder
 *  (clearly illustrative) — the single place mapa/lokalni flip demo→real for rank.
 *  The competitor map-pack stays sample (no clean API) and is labelled as such.
 *  Server-only (reads the local-signals store). */
import "server-only";
import { cache } from "react";
import type { KeywordRank } from "@/lib/mappack/sample";
import type { ReviewItem } from "@/lib/reviews/sample";
import type { LocationRow } from "@/lib/locations/sample";
import type { LocalTarget } from "@/lib/local/sample";
import { fromImported } from "@/lib/reviews/compute";
import { mergeGbp } from "@/lib/locations/compute";
import { getLocalSignals } from "./store";
import { coverageKey } from "./import";
import type { LocalSignals, LocalSignalsSource } from "./types";

/** ONE local-signals read per project per REQUEST. Every resolver below reads the same
 *  per-project blob, so a single `/lokalni` load used to hit the store four times (ladder
 *  + reviews + locations + coverage, all inside one `Promise.all`) and the portfolio
 *  Overview added two more per project row. React's `cache()` memoizes for the lifetime
 *  of a single server request — the SAME mechanism `@/lib/session` uses to share one auth
 *  read across the /app gate, layout and page.
 *
 *  This is request memoization ONLY — never a TTL or a cross-request cache — so an import
 *  landing between two requests is picked up immediately and no tenant's blob can leak
 *  into another's request. The store hiccup → `null` fallback (every resolver falls back
 *  to its sample rather than breaking the surface) lives here too, so one failed read is
 *  one failed read per request instead of four independent retries. */
const signalsForRequest = cache(async (projectId: string): Promise<LocalSignals | null> => {
  try {
    return await getLocalSignals(projectId);
  } catch {
    return null; // store hiccup → sample, never break the surface
  }
});

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
  const signals = await signalsForRequest(projectId);
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
  const signals = await signalsForRequest(projectId);
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

export interface ResolvedLocations {
  rows: LocationRow[];
  source: "sample" | LocalSignalsSource;
  live: boolean;
  syncedAt?: string;
  sourceUrl?: string;
}

/** The active locations roster for a project: the seeded roster with imported GBP rows
 *  merged in (matched by name, unmatched imported rows appended) when a live GBP section
 *  exists, else the pure sample. Same live-over-sample seam as ladder/reviews. */
export async function resolveLocations(
  projectId: string,
  sample: LocationRow[]
): Promise<ResolvedLocations> {
  const signals = await signalsForRequest(projectId);
  const gbp = signals?.gbp;
  if (gbp && gbp.rows.length > 0) {
    return {
      rows: mergeGbp(sample, gbp.rows),
      source: gbp.meta.source,
      live: true,
      syncedAt: gbp.meta.syncedAt,
      sourceUrl: gbp.meta.sourceUrl,
    };
  }
  return { rows: sample, source: "sample", live: false };
}

export interface ResolvedCoverage {
  /** the seeded coverage targets with live page-presence overlaid where imported */
  targets: LocalTarget[];
  source: "sample" | LocalSignalsSource;
  live: boolean;
  syncedAt?: string;
  sourceUrl?: string;
}

/** The active coverage matrix for a project (D1): live page-presence resolved OVER the
 *  catalog-seeded targets per (service, locality). A matching imported row flips the
 *  target's `hasPage`; combos the import doesn't mention keep their seeded `hasPage`.
 *  The `rank` column is nulled on EVERY combo once coverage is live — the import has no
 *  rank data, so the seeded rank is fiction that must not ride under the live label (no
 *  live rank → no rank). A project with no coverage section returns the seed array
 *  BYTE-IDENTICAL (same reference, seeded ranks intact — it stays clearly illustrative).
 *  Same live-over-sample seam as ladder/reviews/locations. */
export async function resolveCoverage(
  projectId: string,
  seed: LocalTarget[]
): Promise<ResolvedCoverage> {
  const signals = await signalsForRequest(projectId);
  const coverage = signals?.coverage;
  if (coverage && coverage.rows.length > 0) {
    const byKey = new Map(coverage.rows.map((r) => [coverageKey(r.service, r.locality), r]));
    // The coverage import carries page-PRESENCE only, never a rank. The seed's rank is
    // deterministic fiction (targetsFromCatalog's `seed01(k+":rank")` hash), so under the
    // live-coverage label it must NOT masquerade as a real SERP position — null it on
    // every combo (rank truth lives in the imported ladder, tracked by keyword×area
    // elsewhere). Keeps `coveredButWeak` honest instead of a fabricated KPI.
    const targets = seed.map((t) => {
      const hit = byKey.get(coverageKey(t.service, t.area));
      return { ...t, hasPage: hit ? hit.hasPage : t.hasPage, rank: null };
    });
    return {
      targets,
      source: coverage.meta.source,
      live: true,
      syncedAt: coverage.meta.syncedAt,
      sourceUrl: coverage.meta.sourceUrl,
    };
  }
  return { targets: seed, source: "sample", live: false };
}
