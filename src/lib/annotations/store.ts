/** Per-project report-annotations store — backend dispatcher + read-modify-write
 *  helpers. Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module.
 *  Project-scoped (the notes belong to the project, not the user who wrote them).
 *  Server-only. Mirrors diagnoses/store; the pure state transitions live in ./types. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import {
  addAnnotation,
  removeAnnotation,
  type Annotation,
  type AnnotationState,
} from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved annotations blob, or null when nothing has been added. */
export async function getAnnotations(projectId: string): Promise<AnnotationState | null> {
  return (await backend()).getAnnotations(projectId);
}

/** Replace the project's annotations blob. */
export async function saveAnnotations(projectId: string, state: AnnotationState): Promise<void> {
  return (await backend()).saveAnnotations(projectId, state);
}

/** Drop a project's annotations. */
export async function clearAnnotations(projectId: string): Promise<void> {
  return (await backend()).clearAnnotations(projectId);
}

/** Every annotation for a project (newest-first). Never throws — a store hiccup
 *  degrades to "no notes" so the report/recap never break on it. */
export async function listAnnotations(projectId: string): Promise<Annotation[]> {
  try {
    return (await getAnnotations(projectId))?.items ?? [];
  } catch {
    return [];
  }
}

/** Read-modify-write: append one sanitized note (re-capped) and persist. Returns the
 *  next full list so the route can echo it back. A read hiccup degrades to a fresh
 *  blob so a first save never fails on a missing doc. */
export async function recordAnnotation(
  projectId: string,
  input: { date: string; text: string }
): Promise<Annotation[]> {
  let cur: AnnotationState | null = null;
  try {
    cur = await getAnnotations(projectId);
  } catch {
    cur = null;
  }
  const next = addAnnotation(cur, input);
  await saveAnnotations(projectId, next);
  return next.items;
}

/** Read-modify-write: remove one note by id. Returns false (no write) when the
 *  project has no blob or the id is unknown, so the route can 404. */
export async function deleteAnnotation(projectId: string, id: string): Promise<boolean> {
  const cur = await getAnnotations(projectId);
  if (!cur) return false;
  const { state, found } = removeAnnotation(cur, id);
  if (!found) return false;
  await saveAnnotations(projectId, state);
  return true;
}
