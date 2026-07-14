/** Per-project imported-leads store — FIRESTORE backend. One doc at
 *  `leadImports/{projectId}` holding the {items, source, syncedAt, updatedAt} blob.
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so
 *  the LOCAL_DB path never pulls firebase-admin in. Mirrors local-signals/store.firestore. */
import { firestore } from "@/lib/firebase";
import type { ImportedLeadsState } from "./types";

function leadsDoc(projectId: string) {
  return firestore.collection("leadImports").doc(projectId);
}

export async function getLeadImports(projectId: string): Promise<ImportedLeadsState | null> {
  const doc = await leadsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as ImportedLeadsState;
  } catch {
    return null;
  }
}

export async function saveLeadImports(projectId: string, state: ImportedLeadsState): Promise<void> {
  await leadsDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearLeadImports(projectId: string): Promise<void> {
  await leadsDoc(projectId).delete();
}
