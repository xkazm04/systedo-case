/** Per-project twin store — backend dispatcher. Local node:sqlite when LOCAL_DB is
 *  on, else Firestore; the backend is imported LAZILY so the LOCAL_DB path never
 *  evaluates the Firestore module. Project-scoped (the trained voice, the style
 *  facts and the outbox belong to the project). Server-only. Mirrors
 *  organic-channels/store. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { TwinState } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved twin, or null when nothing has been trained yet (→ the
 *  seeded per-type sample). */
export async function getTwin(projectId: string): Promise<TwinState | null> {
  return (await backend()).getTwin(projectId);
}

/** Replace the project's twin state. */
export async function saveTwin(projectId: string, state: TwinState): Promise<void> {
  return (await backend()).saveTwin(projectId, state);
}

/** Drop a project's twin (→ reverts to the seeded sample: untrained, no outbox). */
export async function clearTwin(projectId: string): Promise<void> {
  return (await backend()).clearTwin(projectId);
}
