/** Data-source seam for the LP-experiments module. `resolveExperiments` returns the
 *  project's PERSISTED experiments when it has any, else the seeded per-project sample —
 *  the single place the module flips sample→real. Mirrors organic-channels/resolve.
 *  Server-only (reads the lp-exp store). The evaluate() verdict math is untouched; this
 *  only chooses which experiment set feeds it. */
import "server-only";
import { listExperiments } from "./store";
import type { LpExperiment } from "./sample";

export interface ResolvedExperiments {
  /** the active set: the project's persisted experiments when present, else the sample */
  experiments: LpExperiment[];
  /** "sample" (seeded, illustrative — never mined as account-proven) or "live" (the
   *  project's own persisted experiments — a significant winner IS mined as a live
   *  creative pattern) */
  source: "sample" | "live";
}

/** The active experiment set for a project: its persisted experiments when it has any,
 *  else the passed seeded sample. `sample` is computed by the caller
 *  (experimentsForProject) so this stays free of the project plumbing. Never throws —
 *  a store hiccup degrades to the sample so the module never breaks on it. */
export async function resolveExperiments(
  projectId: string,
  sample: LpExperiment[]
): Promise<ResolvedExperiments> {
  const items = await listExperiments(projectId);
  if (items.length > 0) return { experiments: items, source: "live" };
  return { experiments: sample, source: "sample" };
}
