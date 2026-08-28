/** Per-project diagnoses store — LOCAL node:sqlite backend. One row per project in
 *  `.data/systedo.db` (table `diagnoses`, DDL in src/lib/db.ts) holding the {items,
 *  updatedAt} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the Firestore
 *  backend's interface (and organic-channels/store.local). */
import { getDb } from "@/lib/db";
import type { DatabaseSync } from "node:sqlite";
import {
  appendDiagnosis,
  parseDiagnosisState,
  setStatusIn,
  type DiagnosisState,
  type DiagnosisStatus,
  type StoredDiagnosis,
} from "./types";

interface Row {
  data: string;
}

/** Synchronous SELECT of the blob (node:sqlite is sync), so the read-modify-write
 *  helpers below can run it inside a BEGIN IMMEDIATE transaction without awaiting. */
function selectState(db: DatabaseSync, projectId: string): DiagnosisState | null {
  const row = db.prepare("SELECT data FROM diagnoses WHERE project_id = ?").get(projectId) as
    | Row
    | undefined;
  if (!row) return null;
  return parseDiagnosisState(row.data);
}

function upsertState(db: DatabaseSync, projectId: string, state: DiagnosisState): void {
  db.prepare(
    `INSERT INTO diagnoses (project_id, data, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (project_id)
     DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(projectId, JSON.stringify(state), new Date().toISOString());
}

export async function getDiagnoses(projectId: string): Promise<DiagnosisState | null> {
  return selectState(getDb(), projectId);
}

export async function saveDiagnoses(projectId: string, state: DiagnosisState): Promise<void> {
  upsertState(getDb(), projectId, state);
}

export async function clearDiagnoses(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM diagnoses WHERE project_id = ?").run(projectId);
}

/** Direction 3 — ATOMIC read-modify-write, mirroring the Firestore transaction.
 *  node:sqlite is synchronous (so the read→mutate→write can't interleave within a
 *  process), and BEGIN IMMEDIATE guards against a second process (a concurrent dev
 *  worker / the cron) racing the same row and clobbering a just-stored diagnosis. */
export async function recordDiagnosis(
  projectId: string,
  diagnosis: StoredDiagnosis
): Promise<StoredDiagnosis> {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertState(db, projectId, appendDiagnosis(selectState(db, projectId), diagnosis));
    db.exec("COMMIT");
    return diagnosis;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export async function updateDiagnosisStatus(
  projectId: string,
  id: string,
  status: DiagnosisStatus
): Promise<boolean> {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const cur = selectState(db, projectId);
    if (!cur) {
      db.exec("COMMIT");
      return false;
    }
    const { state, found } = setStatusIn(cur, id, status);
    if (found) upsertState(db, projectId, state);
    db.exec("COMMIT");
    return found;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
