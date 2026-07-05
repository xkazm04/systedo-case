/** Project catalog store — backend dispatcher. Resolves to the local node:sqlite
 *  store when LOCAL_DB is on, else Firestore. The backend is imported LAZILY so the
 *  LOCAL_DB path never evaluates `store.firestore` (never pulls firebase-admin in).
 *  Both backends export an identical interface. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { Offering } from "./offering";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved offerings, or null if it has never been saved. */
export async function listOfferings(userId: string, projectId: string): Promise<Offering[] | null> {
  return (await backend()).listOfferings(userId, projectId);
}

/** Replace the project's whole catalog. */
export async function saveOfferings(userId: string, projectId: string, offerings: Offering[]): Promise<void> {
  return (await backend()).saveOfferings(userId, projectId, offerings);
}
