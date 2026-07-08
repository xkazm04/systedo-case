/** Per-project local-signals store — FIRESTORE backend. One doc at
 *  `localSignals/{projectId}` holding the {meta, ladder} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { LocalSignals } from "./types";

function signalsDoc(projectId: string) {
  return firestore.collection("localSignals").doc(projectId);
}

export async function getLocalSignals(projectId: string): Promise<LocalSignals | null> {
  const doc = await signalsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as LocalSignals;
  } catch {
    return null;
  }
}

export async function saveLocalSignals(projectId: string, signals: LocalSignals): Promise<void> {
  await signalsDoc(projectId).set({
    data: JSON.stringify(signals),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearLocalSignals(projectId: string): Promise<void> {
  await signalsDoc(projectId).delete();
}
