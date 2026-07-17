/** Per-project cost-model store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped. Server-only. Mirrors
 *  report-metrics/store. */
/** KEYING INVARIANT: rows here are keyed by projectId ALONE (no uid), unlike the
 *  catalog/warehouse/project-state stores which key by (uid, projectId). This is safe
 *  ONLY because project ids are UUID-unique across all users and EVERY route into this
 *  store first passes requireOwnedProject (or rejectUnknownProject for the tenant-keyed
 *  callers) — never call it with a wire-supplied id that has not been ownership-checked.
 *  deleteProjectCascade scrubs by project id for the same reason. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { CostModel } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved cost model, or null when never entered (→ pre-COGS report). */
export async function getCostModel(projectId: string): Promise<CostModel | null> {
  return (await backend()).getCostModel(projectId);
}

/** Replace the project's cost model. */
export async function saveCostModel(projectId: string, model: CostModel): Promise<void> {
  return (await backend()).saveCostModel(projectId, model);
}

/** Drop a project's cost model (→ report reverts to pre-COGS contribution). */
export async function clearCostModel(projectId: string): Promise<void> {
  return (await backend()).clearCostModel(projectId);
}
