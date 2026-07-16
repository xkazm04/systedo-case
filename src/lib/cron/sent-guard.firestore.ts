/** Cron sent-guard — FIRESTORE backend. One doc at
 *  `tenants/{tenant}/config/{kind}` holding the last-claimed `period`. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the
 *  LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend's
 *  interface. */
import { firestore } from "@/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import { isNewPeriod } from "./schedule";

function guardRef(tenant: string, kind: string) {
  return firestore.collection("tenants").doc(tenant).collection("config").doc(kind);
}

/** Atomic claim-first via a transaction: read the recorded period, and only when
 *  it differs write the new one and return true. Two overlapping runs contend on
 *  the same doc; the transaction serialises them so exactly one wins the claim. */
export async function claimSentPeriod(
  tenant: string,
  kind: string,
  period: string
): Promise<boolean> {
  const ref = guardRef(tenant, kind);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = (snap.data() as { period?: string } | undefined)?.period;
    if (!isNewPeriod(previous, period)) return false; // already claimed
    tx.set(ref, { period, claimedAt: new Date().toISOString() }, { merge: true });
    return true;
  });
}

/** Release a claim: clear the recorded period ONLY when it is still this exact
 *  one (transaction-guarded), so a later period's claim is never clobbered. */
export async function releaseSentPeriod(
  tenant: string,
  kind: string,
  period: string
): Promise<void> {
  const ref = guardRef(tenant, kind);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previous = (snap.data() as { period?: string } | undefined)?.period;
    if (previous === period) {
      tx.set(ref, { period: FieldValue.delete() }, { merge: true });
    }
  });
}
