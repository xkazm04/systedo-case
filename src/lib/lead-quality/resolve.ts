/** Data-source seam for the lead-quality funnel. `resolveLeadSources` returns the
 *  project's IMPORTED leads (aggregated into the funnel's LeadSource shape) when it
 *  has any, else the seeded per-project sample — the single place the module flips
 *  sample→real. Mirrors lp-exp/resolve + local-signals/resolve. Server-only (reads
 *  the lead store). The funnel/velocity/alert math is untouched; this only chooses
 *  which source set feeds it, and labels the provenance. */
import "server-only";
import { getLeadImports } from "./store";
import { aggregateLeads } from "./import";
import type { LeadSource } from "./sample";

export interface ResolvedLeadSources {
  /** the active set: the project's aggregated imported leads when present, else sample */
  sources: LeadSource[];
  /** whether the active set is live (imported) rather than the illustrative sample */
  live: boolean;
  /** provenance of the active set */
  source: "sample" | "import" | "url";
  /** ISO timestamp of the import, when live */
  syncedAt?: string;
  /** for source "url": the hosted CSV the leads were fetched from */
  sourceUrl?: string;
}

/** The active source set for a project's funnel: its imported leads aggregated when
 *  it has any, else the passed seeded sample. `sample` is computed by the caller
 *  (sourcesForProject) so this stays free of the project plumbing. Never throws — a
 *  store hiccup degrades to the sample so the module never breaks on it. */
export async function resolveLeadSources(
  projectId: string,
  sample: LeadSource[]
): Promise<ResolvedLeadSources> {
  let state = null;
  try {
    state = await getLeadImports(projectId);
  } catch {
    state = null; // store hiccup → sample, never break the funnel
  }
  if (state && state.items.length > 0) {
    return {
      sources: aggregateLeads(state.items),
      live: true,
      source: state.source,
      syncedAt: state.syncedAt,
      sourceUrl: state.sourceUrl,
    };
  }
  return { sources: sample, live: false, source: "sample" };
}
