/** Per-user social-connection store — FIRESTORE backend
 *  (`socialConnections/{userId}` = { accounts: StoredSocialAccount[] }). Selected
 *  by the dispatcher in ./connection.ts when LOCAL_DB is off. Every method
 *  reproduces the EXACT query connection.ts issued before the seam existed (same
 *  collection/doc path, same set-merge semantics, same connected-user scan), so
 *  the production path is byte-identical. Server-only. */
import "server-only";
import { firestore } from "@/lib/firebase";
import type { StoredSocialAccount } from "./account";

const COLLECTION = "socialConnections";

interface Doc {
  accounts?: StoredSocialAccount[];
}

function ref(userId: string) {
  return firestore.collection(COLLECTION).doc(userId);
}

/** Raw stored accounts (WITH token blobs) — server-only; never serialise directly. */
export async function listStoredAccounts(userId: string): Promise<StoredSocialAccount[]> {
  const doc = await ref(userId).get();
  return (doc.data() as Doc | undefined)?.accounts ?? [];
}

export async function saveStoredAccounts(
  userId: string,
  accounts: StoredSocialAccount[]
): Promise<void> {
  await ref(userId).set({ accounts }, { merge: true });
}

/** User ids with at least one connected account — the set the publish cron walks. */
export async function listConnectedSocialUserIds(): Promise<string[]> {
  const snap = await firestore.collection(COLLECTION).get();
  return snap.docs.filter((d) => ((d.data() as Doc).accounts?.length ?? 0) > 0).map((d) => d.id);
}
