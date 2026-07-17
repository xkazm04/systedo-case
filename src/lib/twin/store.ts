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

/** ATOMIC per-project read-modify-write. The `mutator` receives the current sanitized
 *  blob (or null) and returns the next; the read and write happen inside ONE backend
 *  transaction, so a send and a concurrent full-state save can't read the same base and
 *  clobber each other (the send-race / lost-update the two twin write paths shared).
 *  Use this instead of getTwin→saveTwin whenever the write depends on the prior state. */
export async function mutateTwin(
  projectId: string,
  mutator: (prev: TwinState | null) => TwinState
): Promise<TwinState> {
  return (await backend()).mutateTwin(projectId, mutator);
}

/** Drop a project's twin (→ reverts to the seeded sample: untrained, no outbox). */
export async function clearTwin(projectId: string): Promise<void> {
  return (await backend()).clearTwin(projectId);
}
