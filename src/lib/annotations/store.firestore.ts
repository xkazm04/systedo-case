/** Per-project report-annotations store — FIRESTORE backend. One doc at
 *  `annotations/{projectId}` holding the {items, updatedAt} blob. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the LOCAL_DB
 *  path never pulls firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { AnnotationState } from "./types";

function annotationsDoc(projectId: string) {
  return firestore.collection("annotations").doc(projectId);
}

export async function getAnnotations(projectId: string): Promise<AnnotationState | null> {
  const doc = await annotationsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as AnnotationState;
  } catch {
    return null;
  }
}

export async function saveAnnotations(projectId: string, state: AnnotationState): Promise<void> {
  await annotationsDoc(projectId).set({
    data: JSON.stringify(state),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearAnnotations(projectId: string): Promise<void> {
  await annotationsDoc(projectId).delete();
}
