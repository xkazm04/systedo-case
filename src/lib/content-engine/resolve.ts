/** Data-source seam for the Obsahový engine — the one place that decides WHAT the
 *  module renders and, inseparably, what it may be LABELLED.
 *
 *  The bug this exists to prevent: the module used to label itself "Živá data ·
 *  Google Ads" whenever `hasSyncedMetrics(project)` was true, while the topic
 *  clusters, volumes, decay percentages and article lists it rendered were ALWAYS
 *  the procedurally-varied fixture in ./sample. A synced Ads account grounds the
 *  monthly report; it grounds nothing on this screen. Labelling derived from a
 *  CONNECTION rather than from the DERIVATION is exactly the live-vs-sample
 *  integrity violation the repo forbids.
 *
 *  So: the label follows `derivedFrom`, which is what actually produced the numbers.
 *  Today that is always "sample" — the real derivation for clusters/decay is the
 *  keyword tool + Search Console traffic trend (see ./sample's seam note), and no
 *  such sync exists yet. When it lands, this resolver returns those rows with
 *  `derivedFrom: "search-console"` and every label downstream flips with the data,
 *  in one place.
 *
 *  `adsSynced` is carried through NOT as a live signal but as the honest caveat: a
 *  project that has synced Ads data deserves to be told that this particular screen
 *  is not computed from it, instead of silently seeing "Ukázková data" and assuming
 *  the sync failed.
 *
 *  Pure (no store, no framework) so the owning server page reads the sync signal and
 *  passes it in, and the rule stays unit-testable. */
import type { Project } from "@/lib/projects/types";
import {
  clustersForProject,
  SAMPLE_DECAY,
  type DecayingPost,
  type TopicCluster,
} from "./sample";

/** What the rendered clusters/decay were computed from. */
export type ContentDerivation = "sample" | "search-console";

export interface ResolvedContentDataset {
  clusters: TopicCluster[];
  decay: DecayingPost[];
  /** The provenance of the numbers above — the ONLY thing the label may follow. */
  derivedFrom: ContentDerivation;
  /** true iff the rendered numbers are the client's own measured data. */
  live: boolean;
  /** The project has synced Ads rows — which ground the report, not this screen.
   *  Drives an honest caveat, never a "live" label. */
  adsSynced: boolean;
}

/** The active dataset for the content engine. `adsSynced` is the caller's honest
 *  sync signal (`hasSyncedMetrics`) and deliberately does NOT influence `live`. */
export function resolveContentDataset(
  project: Project,
  opts: { adsSynced?: boolean } = {}
): ResolvedContentDataset {
  const adsSynced = opts.adsSynced === true;
  // Only branch that exists today. Kept as an explicit derivation value (rather than
  // an implicit "false") so the Search Console seam slots in without re-deriving the
  // labelling rule at the call sites.
  const derivedFrom: ContentDerivation = "sample";
  return {
    clusters: clustersForProject(project),
    decay: SAMPLE_DECAY,
    derivedFrom,
    live: derivedFrom !== "sample",
    adsSynced,
  };
}
