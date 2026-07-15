/** Per-project diagnoses store — FIRESTORE backend. One doc at
 *  `diagnoses/{projectId}` holding the {items, updatedAt} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors organic-channels/store.firestore. */
import { firestore } from "@/lib/firebase";
import {
  appendDiagnosis,
  setStatusIn,
  type DiagnosisState,
  type DiagnosisStatus,
  type StoredDiagnosis,
} from "./types";

function diagnosesDoc(projectId: string) {
  return firestore.collection("diagnoses").doc(projectId);
}

/** Parse the {items, updatedAt} blob out of a doc snapshot, or null. Shared by the
 *  plain read and the transactional read-modify-write below. */
function readState(raw: unknown): DiagnosisState | null {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as DiagnosisState;
  } catch {
    return null;
  }
}

export async function getDiagnoses(projectId: string): Promise<DiagnosisState | null> {
  const doc = await diagnosesDoc(projectId).get();
  if (!doc.exists) return null;
  return readState(doc.data()?.data);
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

/** Direction 3 — ATOMIC read-modify-write. The append (or status change) reads the
 *  blob and writes it back inside ONE Firestore transaction, so two concurrent saves
 *  for the same project (the panel + the weekly-digest cron) can't each read the same
 *  base blob and have the second `.set()` clobber the first's just-stored diagnosis. */
export async function recordDiagnosis(
  projectId: string,
  diagnosis: StoredDiagnosis
): Promise<StoredDiagnosis> {
  const ref = diagnosesDoc(projectId);
  await firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const cur = doc.exists ? readState(doc.data()?.data) : null;
    tx.set(ref, {
      data: JSON.stringify(appendDiagnosis(cur, diagnosis)),
      updatedAt: new Date().toISOString(),
    });
  });
  return diagnosis;
}

export async function updateDiagnosisStatus(
  projectId: string,
  id: string,
  status: DiagnosisStatus
): Promise<boolean> {
  const ref = diagnosesDoc(projectId);
  return firestore.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const cur = doc.exists ? readState(doc.data()?.data) : null;
    if (!cur) return false;
    const { state, found } = setStatusIn(cur, id, status);
    if (!found) return false;
    tx.set(ref, { data: JSON.stringify(state), updatedAt: new Date().toISOString() });
    return true;
  });
}
