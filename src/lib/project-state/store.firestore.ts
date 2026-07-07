/** Per-(user, project, key) JSON-blob state store — FIRESTORE backend. One doc at
 *  `users/{userId}/projectState/{projectId}__{key}`. Server-only (firebase-admin is
 *  Node-only); imported lazily by the dispatcher so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";

function stateDoc(userId: string, projectId: string, key: string) {
  return firestore.collection("users").doc(userId).collection("projectState").doc(`${projectId}__${key}`);
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
