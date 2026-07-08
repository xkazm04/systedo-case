/** Per-project cost-model store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped. Server-only. Mirrors
 *  report-metrics/store. */
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
