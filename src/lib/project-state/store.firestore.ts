/** Per-(user, project, key) JSON-blob state store — FIRESTORE backend. One doc at
 *  `users/{userId}/projectState/{projectId}__{key}`. Server-only (firebase-admin is
 *  Node-only); imported lazily by the dispatcher so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface.
 *
 *  This backend deals in RAW BYTES only: the envelope/version decoding and the whole
 *  typed API live in the dispatcher (./store), so the two backends cannot drift on
 *  blob semantics. Its one real job beyond storage is the compare-and-swap the
 *  dispatcher's optimistic-concurrency layer needs — expressed as a Firestore
 *  TRANSACTION (the cloud equivalent of the local backend's conditional UPDATE), so
 *  the compare and the swap commit together and a racing writer loses the race
 *  instead of silently overwriting. */
import { firestore } from "@/lib/firebase";

function stateCol(userId: string) {
  return firestore.collection("users").doc(userId).collection("projectState");
}

function stateDoc(userId: string, projectId: string, key: string) {
  return stateCol(userId).doc(`${projectId}__${key}`);
}

/** The stored bytes for (user, project, key), or null when nothing is stored (or the
 *  field is not a string, which is the same thing from a reader's point of view). */
export async function readRawProjectState(
  userId: string,
  projectId: string,
  key: string
): Promise<string | null> {
  const doc = await stateDoc(userId, projectId, key).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  return typeof raw === "string" ? raw : null;
}

/** Store `raw`.
 *   • `expected === undefined` → unconditional set (last write wins).
 *   • `expected === null`      → succeed only if NOTHING is stored yet.
 *   • `expected === string`    → succeed only if the stored bytes are exactly that.
 *  Returns false when the compare-and-swap lost the race (the dispatcher turns that
 *  into a retryable ProjectStateConflictError). */
export async function writeRawProjectState(
  userId: string,
  projectId: string,
  key: string,
  raw: string,
  expected: string | null | undefined
): Promise<boolean> {
  const ref = stateDoc(userId, projectId, key);
  if (expected === undefined) {
    await ref.set({ data: raw, updatedAt: new Date().toISOString() });
    return true;
  }
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists ? snap.data()?.data : undefined;
    const current = typeof stored === "string" ? stored : null;
    if (current !== expected) return false;
    tx.set(ref, { data: raw, updatedAt: new Date().toISOString() });
    return true;
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
