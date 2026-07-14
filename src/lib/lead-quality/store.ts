/** Per-project imported-leads store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped (the imported leads
 *  belong to the project). Server-only. Mirrors local-signals/store + lp-exp/store. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { ImportedLeadsState } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's imported-leads blob, or null when nothing has been imported. */
export async function getLeadImports(projectId: string): Promise<ImportedLeadsState | null> {
  return (await backend()).getLeadImports(projectId);
}

/** Replace the project's imported-leads blob. */
export async function saveLeadImports(projectId: string, state: ImportedLeadsState): Promise<void> {
  return (await backend()).saveLeadImports(projectId, state);
}

/** Drop a project's imported leads (→ reverts the funnel to the seeded sample). */
export async function clearLeadImports(projectId: string): Promise<void> {
  return (await backend()).clearLeadImports(projectId);
}
