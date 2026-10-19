/** Per-tenant client-report configuration — FIRESTORE backend. One doc at
 *  `tenants/{tenant}/config/report`. Selected when LOCAL_DB is off. Server-only
 *  (firebase-admin is Node-only); imported lazily by the dispatcher so the
 *  LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend's
 *  interface (report-config.local.ts), same split as cron/sent-guard.ts. */
import { firestore } from "@/lib/firebase";
import { FieldValue } from "firebase-admin/firestore";
import type { ReportConfig } from "./report-config-types";

function configRef(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("config").doc("report");
}

export async function readConfig(tenant: string): Promise<Partial<ReportConfig> | undefined> {
  const doc = await configRef(tenant).get();
  return doc.exists ? ((doc.data() as Partial<ReportConfig>) ?? {}) : undefined;
}

export async function writeConfig(tenant: string, patch: Partial<ReportConfig>): Promise<void> {
  await configRef(tenant).set(patch, { merge: true });
}

/** Atomic claim-first via a transaction: two overlapping daily runs can't both
 *  pass the due-check and double-send. */
export async function claimDay(tenant: string, day: string): Promise<boolean> {
  const ref = configRef(tenant);
  return firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastSentDay = (snap.data() as Partial<ReportConfig> | undefined)?.lastSentDay;
    if (lastSentDay === day) return false; // already claimed this day
    tx.set(ref, { lastSentDay: day }, { merge: true });
    return true;
  });
}

/** Release a claim: clear `lastSentDay` only when it is still this exact day
 *  (transaction-guarded), so a later day's claim is never clobbered. */
export async function releaseDay(tenant: string, day: string): Promise<void> {
  const ref = configRef(tenant);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const lastSentDay = (snap.data() as Partial<ReportConfig> | undefined)?.lastSentDay;
    if (lastSentDay === day) {
      tx.set(ref, { lastSentDay: FieldValue.delete() }, { merge: true });
    }
  });
}
