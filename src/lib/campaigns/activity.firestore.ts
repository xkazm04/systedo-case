/** The tenant activity feed — FIRESTORE backend (`tenants/{tenant}/activity`).
 *  Selected by the dispatcher in ./activity.ts when LOCAL_DB is off. Both methods
 *  reproduce the EXACT queries activity.ts issued before this seam existed (same
 *  collection path, same `.add`, same `orderBy("at","desc").limit(n)` read and the
 *  same single-field `where("at",">=")` window — still no composite index needed),
 *  so the production path is byte-identical. Errors are NOT caught here: the
 *  dispatcher owns the `{records, ok}` outage contract. Server-only. */
import { firestore } from "@/lib/firebase";
import type { ActivityRecord, ActivityRecordData } from "./activity";

function activityCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("activity");
}

export async function appendActivity(tenant: string, doc: ActivityRecordData): Promise<void> {
  await activityCol(tenant).add(doc);
}

export async function readActivity(
  tenant: string,
  opts: { limit: number; sinceIso?: string }
): Promise<ActivityRecord[]> {
  const base = activityCol(tenant);
  const q = opts.sinceIso ? base.where("at", ">=", opts.sinceIso) : base;
  const snap = await q.orderBy("at", "desc").limit(opts.limit).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ActivityRecordData) }));
}
