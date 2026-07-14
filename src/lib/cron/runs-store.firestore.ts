/** Durable cron run store — FIRESTORE backend. One doc per invocation in the
 *  `cronRuns` collection (doc id = record.id). Server-only (firebase-admin is
 *  Node-only); imported lazily by the dispatcher so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import { CRON_RUN_RETENTION, type CronRunRecord } from "./run-record";

const COLLECTION = "cronRuns";

export async function saveCronRun(record: CronRunRecord): Promise<void> {
  const col = firestore.collection(COLLECTION);
  await col.doc(record.id).set(record);
  // Retention: keep only the newest CRON_RUN_RETENTION docs for THIS cron. Query
  // by cron (single-field index, auto) and sort in memory to avoid needing a
  // composite index, then delete the overflow.
  const snap = await col.where("cron", "==", record.cron).get();
  const docs = snap.docs
    .map((d) => ({ id: d.id, finishedAt: (d.data() as CronRunRecord).finishedAt ?? "" }))
    .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : a.finishedAt > b.finishedAt ? -1 : 0));
  const overflow = docs.slice(CRON_RUN_RETENTION);
  if (overflow.length) {
    const batch = firestore.batch();
    for (const d of overflow) batch.delete(col.doc(d.id));
    await batch.commit();
  }
}

export async function listRecentCronRuns(limit = 200): Promise<CronRunRecord[]> {
  const snap = await firestore
    .collection(COLLECTION)
    .orderBy("finishedAt", "desc")
    .limit(limit)
    .get();
  return snap.docs.map((d) => d.data() as CronRunRecord);
}
