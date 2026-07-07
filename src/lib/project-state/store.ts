/** Per-(user, project, key) state store — backend dispatcher. Resolves to the
 *  local node:sqlite store when LOCAL_DB is on, else Firestore. The backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module.
 *  Both backends export an identical interface. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The stored blob for (user, project, key), or null if never saved (→ caller seed). */
export async function getProjectState<T>(userId: string, projectId: string, key: string): Promise<T | null> {
  return (await backend()).getProjectState<T>(userId, projectId, key);
}

/** Replace the stored blob for (user, project, key). */
export async function saveProjectState<T>(userId: string, projectId: string, key: string, data: T): Promise<void> {
  return (await backend()).saveProjectState<T>(userId, projectId, key, data);
}
