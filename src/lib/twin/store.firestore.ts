/** Per-project twin store — FIRESTORE backend. One doc at `twins/{projectId}`
 *  holding the {voices, channels, facts, drafts} blob. Server-only (firebase-admin
 *  is Node-only); imported lazily by the dispatcher so the LOCAL_DB path never
 *  pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { TwinState } from "./types";

function twinDoc(projectId: string) {
  return firestore.collection("twins").doc(projectId);
}

export async function getTwin(projectId: string): Promise<TwinState | null> {
  const doc = await twinDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as TwinState;
  } catch {
    return null;
  }
}

export async function saveTwin(projectId: string, state: TwinState): Promise<void> {
  await twinDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearTwin(projectId: string): Promise<void> {
  await twinDoc(projectId).delete();
}
