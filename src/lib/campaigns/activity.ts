/** A per-tenant, reverse-chronological activity feed: a single durable record of
 *  *what happened* — budget moves and pauses applied, syncs run, alerts fired,
 *  reports sent. Mutations are already audited to `tenants/{tenant}/mutations`,
 *  but that log is write-only plumbing with no user-facing surface; this feed is
 *  the human-readable timeline an agency uses to explain account changes to a
 *  client. Writes are best-effort and never throw into the calling path.
 *  Server-only. */
import { firestore } from "@/lib/firebase";

export type ActivityKind = "budget_shift" | "pause" | "sync" | "alert" | "report";

export interface ActivityInput {
  kind: ActivityKind;
  /** short headline for the timeline row */
  title: string;
  /** one-line supporting detail */
  detail: string;
  /** optional actor label ("Vy", a userId, or "Automatická synchronizace") */
  actor?: string;
}

export interface ActivityRecord extends ActivityInput {
  id: string;
  at: string;
}

function activityCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("activity");
}

/** Append one entry to the tenant's activity feed. Best-effort: a logging failure
 *  must never fail the mutation/sync/alert that triggered it. */
export async function recordActivity(tenant: string, entry: ActivityInput): Promise<void> {
  try {
    await activityCol(tenant).add({ ...entry, at: new Date().toISOString() });
  } catch (err) {
    console.error(`[activity] record failed for ${tenant}:`, err);
  }
}

/** Newest activity for a tenant, most recent first. */
export async function listActivity(tenant: string, limit = 50): Promise<ActivityRecord[]> {
  try {
    const snap = await activityCol(tenant).orderBy("at", "desc").limit(limit).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityRecord, "id">) }));
  } catch (err) {
    console.error(`[activity] list failed for ${tenant}:`, err);
    return [];
  }
}
