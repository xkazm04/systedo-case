/** Public-scan claim store — FIRESTORE backend. One doc at `scanClaims/{token}`
 *  holding the JSON claim blob plus a top-level `createdAt` the prune sweep can
 *  range-query. Server-only (firebase-admin is Node-only); imported lazily by the
 *  dispatcher so the LOCAL_DB path never pulls firebase-admin in. Mirrors the local
 *  backend; all TTL / minting policy lives in the dispatcher.
 *
 *  Why the app prunes instead of leaning on a Firestore TTL policy: a TTL policy is
 *  provisioned out of band (see durable-limit's note on `expireAt`), so a fresh
 *  environment that never ran the gcloud command would accumulate claims forever.
 *  The bounded sweep on the mint path needs no provisioning and is idempotent; an
 *  operator who ALSO configures a TTL policy on `createdAt` simply makes it a
 *  no-op. */
import { firestore } from "@/lib/firebase";
import type { ScanClaim } from "./claim-token";

function collection() {
  return firestore.collection("scanClaims");
}

export async function getClaim(token: string): Promise<ScanClaim | null> {
  const doc = await collection().doc(token).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as ScanClaim;
  } catch {
    return null;
  }
}

export async function putClaim(claim: ScanClaim): Promise<void> {
  await collection().doc(claim.token).set({
    data: JSON.stringify(claim),
    createdAt: claim.createdAt,
  });
}

export async function deleteClaim(token: string): Promise<void> {
  await collection().doc(token).delete();
}

/** Delete up to `limit` docs created before `cutoffIso`. ISO-8601 UTC strings sort
 *  lexicographically, so the range query is the same ordering the sqlite twin uses
 *  (ADR-0001's capped-read rule: both drivers must pick the same rows). */
export async function pruneClaims(cutoffIso: string, limit: number): Promise<number> {
  const snap = await collection().where("createdAt", "<", cutoffIso).orderBy("createdAt").limit(limit).get();
  if (snap.empty) return 0;
  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return snap.size;
}
