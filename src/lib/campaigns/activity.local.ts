/** The tenant activity feed — LOCAL node:sqlite backend. Selected by the dispatcher
 *  in ./activity.ts under LOCAL_DB, closing a Firestore-only tail that made the whole
 *  audit trail unusable offline: every read threw (→ `ok:false` → the aktivita page's
 *  "Data nedostupná", never its documented seeded fallback) and every
 *  emitProjectActivity write was a silent no-op.
 *
 *  Adapter choice: unlike the per-USER social connections (which had to borrow a
 *  reserved pseudo-tenant), activity is already TENANT-keyed and shaped exactly like
 *  a Firestore sub-collection — `tenants/{tenant}/activity/{autoId}` with a JSON body
 *  and an ISO `at` field. That is the generic `tenant_docs` twin's native shape, so
 *  the rows live there directly under collection `activity`: `addDoc` mints the auto
 *  id, and `listDocs` with `orderBy: { field: "at", dir: "desc" }` + `limit`
 *  reproduces the Firestore read (json_extract on an ISO string orders
 *  lexicographically = chronologically). No new table, so no db.ts migration and no
 *  repeat of the v20 dropped-table lesson.
 *
 *  The one query the generic interface cannot express is the windowed
 *  `where("at", ">=", since)`. It does not need to: the window is a PREFIX of the
 *  newest-first ordering, so reading the newest `limit` rows and dropping those older
 *  than `since` yields exactly the Firestore result set. LOCAL_DB-only by
 *  construction (imports the local twin directly, never firebase). Server-only. */
import { localTenantDocs } from "@/lib/tenant-docs/local";
import type { ActivityRecord, ActivityRecordData } from "./activity";

const COLLECTION = "activity";

export async function appendActivity(tenant: string, doc: ActivityRecordData): Promise<void> {
  await localTenantDocs.addDoc(tenant, COLLECTION, doc);
}

export async function readActivity(
  tenant: string,
  opts: { limit: number; sinceIso?: string }
): Promise<ActivityRecord[]> {
  const rows = await localTenantDocs.listDocs(tenant, COLLECTION, {
    orderBy: { field: "at", dir: "desc" },
    limit: opts.limit,
  });
  const records = rows.map((r) => ({ id: r.id, ...(r.data as ActivityRecordData) }));
  return opts.sinceIso ? records.filter((r) => r.at >= opts.sinceIso!) : records;
}
