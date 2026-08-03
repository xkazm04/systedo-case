/** A per-tenant, reverse-chronological activity feed: a single durable record of
 *  *what happened* — budget moves and pauses applied, syncs run, alerts fired,
 *  reports sent. Mutations are already audited to `tenants/{tenant}/mutations`,
 *  but that log is write-only plumbing with no user-facing surface; this feed is
 *  the human-readable timeline an agency uses to explain account changes to a
 *  client. Writes are best-effort and never throw into the calling path.
 *  Server-only. */
import { firestore } from "@/lib/firebase";

export type ActivityKind = "budget_shift" | "pause" | "sync" | "alert" | "report" | "update";

/** Severity for the project-wide activity view (the account-level Activity
 *  module); optional so the existing campaign writers stay unchanged. */
export type ActivitySeverity = "info" | "success" | "warning" | "critical";

export interface ActivityInput {
  kind: ActivityKind;
  /** short headline for the timeline row */
  title: string;
  /** one-line supporting detail */
  detail: string;
  /** optional actor label ("Vy", a userId, or "Automatická synchronizace") */
  actor?: string;
  /** module key the event belongs to — powers the project-wide Activity feed's
   *  module filter/chip. Absent for legacy campaign events (inferred from kind). */
  module?: string;
  /** optional severity for the project-wide feed (inferred from kind when absent) */
  severity?: ActivitySeverity;
  /** the inbox alert this event belongs to, linking the timeline into one
   *  traceable thread (alert fired → change-set staged → applied). Absent for
   *  events with no alert origin. */
  alertId?: string;
  /** the control-plane change-set this event belongs to — the other half of the
   *  alert → change-set → apply thread. Absent for non-change-set events. */
  changeSetId?: string;
  /** Set ONLY on a row that IS an asset-publish event (an AI-generated asset
   *  actually leaving the app), carrying the shared `{kind, via}` taxonomy from
   *  lib/activity/publish. Structured rather than parsed back out of `title`,
   *  because the title is prose that is free to be reworded or localized while the
   *  publish-rate rollup must keep counting the same rows. Absent on every other
   *  row — including the "post scheduled" promise, which is not a publish. */
  publishKind?: string;
  publishVia?: string;
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

/** Newest activity for a tenant, most recent first. `ok` distinguishes a genuine
 *  empty feed (`ok: true`, records: []) from a backend read failure (`ok: false`),
 *  so a caller can show "temporarily unavailable" on an outage instead of falling
 *  back to fabricated sample events as if the project simply had no history. */
export async function listActivity(
  tenant: string,
  limit = 50
): Promise<{ records: ActivityRecord[]; ok: boolean }> {
  try {
    const snap = await activityCol(tenant).orderBy("at", "desc").limit(limit).get();
    return {
      records: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityRecord, "id">) })),
      ok: true,
    };
  } catch (err) {
    console.error(`[activity] list failed for ${tenant}:`, err);
    return { records: [], ok: false };
  }
}

/** Hard backstop on rows read for one windowed rollup. Nothing prunes the activity
 *  feed, so a bound is needed even with a date filter; a 30-day slice of one
 *  tenant's feed stays far below it. */
const ACTIVITY_WINDOW_MAX = 2000;

/** Activity recorded at or after `sinceIso`, newest first — the windowed read
 *  behind periodic rollups (the publish-rate measure). Single-field range + order,
 *  so no composite index is needed. Mirrors {@link listActivity}'s `ok` contract: a
 *  read FAILURE is `ok: false`, an empty window is `ok: true` with no records, so a
 *  caller can tell an outage from "nothing happened yet" and never present one as
 *  the other. */
export async function listActivitySince(
  tenant: string,
  sinceIso: string,
  limit = ACTIVITY_WINDOW_MAX
): Promise<{ records: ActivityRecord[]; ok: boolean }> {
  try {
    const snap = await activityCol(tenant)
      .where("at", ">=", sinceIso)
      .orderBy("at", "desc")
      .limit(limit)
      .get();
    return {
      records: snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityRecord, "id">) })),
      ok: true,
    };
  } catch (err) {
    console.error(`[activity] list-since failed for ${tenant}:`, err);
    return { records: [], ok: false };
  }
}
