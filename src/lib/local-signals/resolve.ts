/** A2 data-source seam for the local ranking ladder. `resolveLocalLadder` returns
 *  the project's imported/synced ladder when it has one, else the sample ladder
 *  (clearly illustrative) — the single place mapa/lokalni flip demo→real for rank.
 *  `resolvePacks` does the same for the competitor map-pack (E1): still import-only
 *  (no clean SERP API), but the pins are no longer forced to be synthetic.
 *  Server-only (reads the local-signals store). */
import "server-only";
import { cache } from "react";
import type { AreaPack, KeywordRank } from "@/lib/mappack/sample";
import { packsFromImported } from "@/lib/mappack/compute";
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

export interface ResolvedPacks {
  packs: AreaPack[];
  source: "sample" | LocalSignalsSource;
  live: boolean;
  syncedAt?: string;
  sourceUrl?: string;
}

/** The active competitor map packs for a project (E1): the IMPORTED pack when one
 *  exists, else the passed seeded sample. Same live-over-sample seam as the ladder —
 *  and the last synthesized surface on the map to get one.
 *
 *  A live pack REPLACES the sample outright rather than merging per area: mixing a real
 *  Praha pack with a seeded Brno pack would put six hardcoded rival names on real OSM
 *  tiles under one "live data" label. Areas the import doesn't mention simply have no
 *  pack until they are imported. With no imported section this returns `sample` BY
 *  IDENTITY, so the illustrative path is byte-identical to before. */
export async function resolvePacks(
  projectId: string,
  sample: AreaPack[],
  businessName?: string
): Promise<ResolvedPacks> {
  const signals = await signalsForRequest(projectId);
  const pack = signals?.pack;
  if (pack && pack.rows.length > 0) {
    return {
      packs: packsFromImported(pack.rows, businessName),
      source: pack.meta.source,
      live: true,
      syncedAt: pack.meta.syncedAt,
      sourceUrl: pack.meta.sourceUrl,
    };
  }
  return { packs: sample, source: "sample", live: false };
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
  /** W2-C — how many PUBLISHED local-landing microsites were overlaid onto the
   *  matrix. Absent/0 means none; the UI uses it to say why a cell flipped. This is
   *  a count of live registry rows, never a stored number: unpublishing a page drops
   *  it on the next render. */
  pages?: number;
}

/** One published service×area landing page (W2-C). */
export interface PublishedLocalPage {
  service: string;
  area: string;
  slug: string;
}

/** How `resolveCoverage` learns which service×area pages are actually published.
 *  Injectable so the unit tests can pin the overlay without dragging the session /
 *  registry import graph into node:test — production always uses the default. */
export type PublishedPagesReader = (projectId: string) => Promise<PublishedLocalPage[]>;

/** The real reader: the signed-in caller's own tenant for this project (the SAME key
 *  `enableMicrosite` published under — `resolveTenant(..., {accountScoped:false})`),
 *  then its enabled `local-landing` configs. Everything is imported lazily so this
 *  module keeps its light, framework-free import graph for the callers that never
 *  reach the overlay. Any failure (no session, a registry hiccup) degrades to "no
 *  published pages" — the matrix then reads exactly as it did before W2-C rather
 *  than breaking the module. */
const livePublishedPages: PublishedPagesReader = async (projectId) => {
  try {
    // A DEMO project publishes nothing by construction, and the surfaces that render
    // one (the public portfolio / marketing dashboard) are reached signed-out — so
    // exit BEFORE the session read rather than making those pages read cookies for an
    // answer that is always the empty list.
    const { isDemoProjectId } = await import("@/lib/projects/demo");
    if (isDemoProjectId(projectId)) return [];
    const [{ currentUserId }, { resolveTenant }, { listMicrositesForTenant }] = await Promise.all([
      import("@/lib/session"),
      import("@/lib/campaigns/connector"),
      import("@/lib/microsite"),
    ]);
    const userId = await currentUserId();
    if (!userId) return [];
    const tenant = await resolveTenant(userId, projectId, { accountScoped: false });
    const sites = await listMicrositesForTenant(tenant);
    return sites
      .filter((c) => c.enabled && c.kind === "local-landing" && c.local)
      .map((c) => ({ service: c.local!.service, area: c.local!.area, slug: c.slug }));
  } catch {
    return [];
  }
};

/** ONE registry read per project per REQUEST, for the same reason `signalsForRequest`
 *  exists: /lokalni, the portfolio Overview and the diagnosis resolver all call
 *  resolveCoverage on the same request. */
const pagesForRequest = cache(
  async (projectId: string): Promise<PublishedLocalPage[]> => livePublishedPages(projectId)
);

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
  seed: LocalTarget[],
  opts: { pages?: PublishedPagesReader } = {}
): Promise<ResolvedCoverage> {
  const [signals, published] = await Promise.all([
    signalsForRequest(projectId),
    opts.pages ? opts.pages(projectId) : pagesForRequest(projectId),
  ]);
  // W2-C — the PUBLISHED-page overlay, keyed through the same fold as the import so a
  // page published for "Montáž klimatizací / Plzeň" flips the "Montaz klimatizaci /
  // Plzen" seed too. This is LIVE truth read from the registry on every render: take
  // the page offline and the cell un-flips on the next load. No import row is forged
  // to fake it, which is why the count is reported separately rather than folded into
  // the import's `source`/`live` provenance.
  const publishedKeys = new Set(published.map((p) => coverageKey(p.service, p.area)));
  /** A combo with a published page: it HAS a page, and the seeded rank beside it is
   *  fiction (the page is new — nothing has ranked it yet), so the rank is nulled and
   *  the matrix renders the honest "má stránku" state. */
  const withPages = (targets: LocalTarget[]): LocalTarget[] =>
    targets.map((t) =>
      publishedKeys.has(coverageKey(t.service, t.area)) ? { ...t, hasPage: true, rank: null } : t
    );

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
      // The published-page overlay runs AFTER the import overlay: a page that really
      // exists outranks an import row that says it does not (the import is a snapshot,
      // the registry is now).
      targets: withPages(targets),
      source: coverage.meta.source,
      live: true,
      syncedAt: coverage.meta.syncedAt,
      sourceUrl: coverage.meta.sourceUrl,
      ...(published.length > 0 ? { pages: published.length } : {}),
    };
  }
  // The no-import fast path must still see published pages — a project can publish a
  // local landing page long before it ever imports a coverage CSV. With neither, the
  // seed array is returned BY IDENTITY exactly as before.
  if (published.length > 0) {
    return { targets: withPages(seed), source: "sample", live: false, pages: published.length };
  }
  return { targets: seed, source: "sample", live: false };
}
