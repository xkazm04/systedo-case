/** Per-project recaps store — FIRESTORE backend. One doc at `recaps/{projectId}`
 *  holding the {items, updatedAt} blob. Server-only (firebase-admin is Node-only);
 *  imported lazily by the dispatcher so the LOCAL_DB path never pulls firebase-admin
 *  in. Mirrors diagnoses/store.firestore. */
import { firestore } from "@/lib/firebase";
import type { RecapState } from "./types";

function recapsDoc(projectId: string) {
  return firestore.collection("recaps").doc(projectId);
}

export async function getRecaps(projectId: string): Promise<RecapState | null> {
  const doc = await recapsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as RecapState;
  } catch {
    return null;
  }
}

export async function saveRecaps(projectId: string, state: RecapState): Promise<void> {
  await recapsDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearRecaps(projectId: string): Promise<void> {
  await recapsDoc(projectId).delete();
}
