/** Per-project landing-page-experiments store — FIRESTORE backend. One doc at
 *  `lpExperiments/{projectId}` holding the {items, updatedAt} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors annotations/store.firestore. */
import { firestore } from "@/lib/firebase";
import type { LpExperimentState } from "./types";

function experimentsDoc(projectId: string) {
  return firestore.collection("lpExperiments").doc(projectId);
}

export async function getExperiments(projectId: string): Promise<LpExperimentState | null> {
  const doc = await experimentsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as LpExperimentState;
  } catch {
    return null;
  }
}

export async function saveExperiments(projectId: string, state: LpExperimentState): Promise<void> {
  await experimentsDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearExperiments(projectId: string): Promise<void> {
  await experimentsDoc(projectId).delete();
}
