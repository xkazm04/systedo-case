/** Per-project diagnoses store — backend dispatcher + read-modify-write helpers.
 *  Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is imported
 *  LAZILY so the LOCAL_DB path never evaluates the Firestore module. Project-scoped
 *  (a diagnosis belongs to the project whose data produced it). Server-only.
 *  Mirrors organic-channels/store; the pure state transitions live in ./types. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import {
  latestOfKind,
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

/** ATOMIC read-modify-write (Direction 3): prepend one diagnosis (re-capped per kind)
 *  and persist inside a single transaction in the active backend (Firestore txn /
 *  sqlite BEGIN IMMEDIATE), so a concurrent save (panel + digest cron) can't clobber a
 *  just-stored diagnosis. Returns the stored diagnosis; PROPAGATES a store failure so
 *  the caller (the persist route) can surface it instead of silently losing the save. */
export async function recordDiagnosis(
  projectId: string,
  diagnosis: StoredDiagnosis
): Promise<StoredDiagnosis> {
  return (await backend()).recordDiagnosis(projectId, diagnosis);
}

/** ATOMIC read-modify-write: set one diagnosis's status by id. Returns false (no
 *  write) when the project has no blob or the id is unknown, so the route can 404.
 *  Propagates a store failure (Direction 3). */
export async function updateDiagnosisStatus(
  projectId: string,
  id: string,
  status: DiagnosisStatus
): Promise<boolean> {
  return (await backend()).updateDiagnosisStatus(projectId, id, status);
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
