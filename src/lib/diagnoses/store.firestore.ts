/** Per-project diagnoses store — FIRESTORE backend. One doc at
 *  `diagnoses/{projectId}` holding the {items, updatedAt} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors organic-channels/store.firestore. */
import { firestore } from "@/lib/firebase";
import type { DiagnosisState } from "./types";

function diagnosesDoc(projectId: string) {
  return firestore.collection("diagnoses").doc(projectId);
}

export async function getDiagnoses(projectId: string): Promise<DiagnosisState | null> {
  const doc = await diagnosesDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as DiagnosisState;
  } catch {
    return null;
  }
}

export async function saveDiagnoses(projectId: string, state: DiagnosisState): Promise<void> {
  await diagnosesDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearDiagnoses(projectId: string): Promise<void> {
  await diagnosesDoc(projectId).delete();
}
