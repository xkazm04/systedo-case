/** Per-(user, project, key) JSON-blob state store — FIRESTORE backend. One doc at
 *  `users/{userId}/projectState/{projectId}__{key}`. Server-only (firebase-admin is
 *  Node-only); imported lazily by the dispatcher so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";

function stateCol(userId: string) {
  return firestore.collection("users").doc(userId).collection("projectState");
}

function stateDoc(userId: string, projectId: string, key: string) {
  return stateCol(userId).doc(`${projectId}__${key}`);
}

export async function getProjectState<T>(userId: string, projectId: string, key: string): Promise<T | null> {
  const doc = await stateDoc(userId, projectId, key).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function saveProjectState<T>(userId: string, projectId: string, key: string, data: T): Promise<void> {
  await stateDoc(userId, projectId, key).set({
    data: JSON.stringify(data),
    updatedAt: new Date().toISOString(),
  });
}

/** Drop EVERY (user, project, *) state doc — all keys for the project. Doc ids are
 *  `${projectId}__${key}`; the per-user projectState collection is small, so list it
 *  once and delete the docs whose id carries this project's prefix — never another
 *  project's. Used by the project-deletion cascade. */
export async function deleteProjectState(userId: string, projectId: string): Promise<void> {
  const prefix = `${projectId}__`;
  const snap = await stateCol(userId).get();
  const doomed = snap.docs.filter((d) => d.id.startsWith(prefix));
  if (doomed.length === 0) return;
  const batch = firestore.batch();
  doomed.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
