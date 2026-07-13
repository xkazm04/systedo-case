/** Per-project diagnoses store — backend dispatcher + read-modify-write helpers.
 *  Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is imported
 *  LAZILY so the LOCAL_DB path never evaluates the Firestore module. Project-scoped
 *  (a diagnosis belongs to the project whose data produced it). Server-only.
 *  Mirrors organic-channels/store; the pure state transitions live in ./types. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import {
  appendDiagnosis,
  latestOfKind,
  setStatusIn,
  type DiagnosisKind,
  type DiagnosisState,
  type DiagnosisStatus,
  type StoredDiagnosis,
} from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved diagnoses blob, or null when nothing has been saved. */
export async function getDiagnoses(projectId: string): Promise<DiagnosisState | null> {
  return (await backend()).getDiagnoses(projectId);
}

/** Replace the project's diagnoses blob. */
export async function saveDiagnoses(projectId: string, state: DiagnosisState): Promise<void> {
  return (await backend()).saveDiagnoses(projectId, state);
}

/** Drop a project's diagnoses (revert to the empty state). */
export async function clearDiagnoses(projectId: string): Promise<void> {
  return (await backend()).clearDiagnoses(projectId);
}

/** Read-modify-write: prepend one diagnosis (re-capped per kind) and persist. A
 *  store hiccup on the read is swallowed to a fresh blob so a first save never
 *  fails on a missing doc. Returns the stored diagnosis. */
export async function recordDiagnosis(
  projectId: string,
  diagnosis: StoredDiagnosis
): Promise<StoredDiagnosis> {
  let cur: DiagnosisState | null = null;
  try {
    cur = await getDiagnoses(projectId);
  } catch {
    cur = null;
  }
  await saveDiagnoses(projectId, appendDiagnosis(cur, diagnosis));
  return diagnosis;
}

/** Read-modify-write: set one diagnosis's status by id. Returns false (no write)
 *  when the project has no blob or the id is unknown, so the route can 404. */
export async function updateDiagnosisStatus(
  projectId: string,
  id: string,
  status: DiagnosisStatus
): Promise<boolean> {
  const cur = await getDiagnoses(projectId);
  if (!cur) return false;
  const { state, found } = setStatusIn(cur, id, status);
  if (!found) return false;
  await saveDiagnoses(projectId, state);
  return true;
}

/** Every stored diagnosis for a project, newest-first, optionally one kind only. */
export async function listDiagnoses(
  projectId: string,
  kind?: DiagnosisKind
): Promise<StoredDiagnosis[]> {
  let state: DiagnosisState | null = null;
  try {
    state = await getDiagnoses(projectId);
  } catch {
    state = null;
  }
  const items = state?.items ?? [];
  return kind ? items.filter((it) => it.kind === kind) : items;
}

/** The newest diagnosis of a kind for a project, or null. Never throws (a store
 *  hiccup degrades to "no saved diagnosis"). */
export async function latestDiagnosis(
  projectId: string,
  kind: DiagnosisKind
): Promise<StoredDiagnosis | null> {
  try {
    return latestOfKind(await getDiagnoses(projectId), kind);
  } catch {
    return null;
  }
}
