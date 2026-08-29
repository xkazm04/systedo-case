/** Social read-back counters — backend DISPATCHER (ADR-0001). Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB path
 *  never evaluates the Firestore module. Server-only.
 *
 *  ROW-based, not a blob (the `go_clicks` shape): one row per (post, UTC day), keyed
 *  `(post_id, day)`, with the owning `tenant` riding ON the row. Two consequences, both
 *  deliberate:
 *
 *   • THE UPSERT OVERWRITES. A read-back is a SNAPSHOT of a post's lifetime counters,
 *     never an increment — see ./metrics.ts's snapshot rule. Running the cron twice in
 *     one day must leave the same numbers, which is what makes the step idempotent
 *     without a sent-guard claim.
 *   • THE ROWS CARRY NO PERSON. A post id, a day and three integers, and nothing about
 *     who saw or liked anything — the `analytics_daily` / `go_clicks` privacy posture.
 *     There is no row a viewer could be recovered from because there is no row about a
 *     viewer.
 *
 *  Both backends owe: overwrite-on-conflict for `upsertSocialMetricDay`, at most one row
 *  per (post, day), and DETERMINISTIC ordering on every capped read (`day` then
 *  `post_id` ascending) so the two drivers can never disagree about which rows a caller
 *  sees (ADR-0001's capped-read rule). */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { SocialMetricDay } from "./metrics";

function backend() {
  return LOCAL_DB ? import("./metrics-store.local") : import("./metrics-store.firestore");
}

/** Write one (post, day) snapshot, REPLACING whatever was there. */
export async function upsertSocialMetricDay(row: SocialMetricDay): Promise<void> {
  return (await backend()).upsertSocialMetricDay(row);
}

/** Counter rows for these posts with `day >= sinceDay` (inclusive). An empty id list
 *  reads as "nothing to ask about" and never hits the backend. */
export async function listPostMetricDays(
  postIds: readonly string[],
  sinceDay: string
): Promise<SocialMetricDay[]> {
  if (postIds.length === 0) return [];
  return (await backend()).listPostMetricDays(postIds, sinceDay);
}

/** Drop rows older than `beforeDay` (exclusive). Returns how many went. */
export async function pruneSocialMetrics(beforeDay: string): Promise<number> {
  return (await backend()).pruneSocialMetrics(beforeDay);
}

/** Drop every row a tenant owns — the delete cascade's hook. TENANT-keyed rather than
 *  project-keyed because social posts themselves live under
 *  `resolveTenant(…, { accountScoped: false })`, i.e. exactly `buildTenantKey(userId,
 *  projectId)`; the cascade entry passes that key, the same way the microsite entry
 *  does. */
export async function clearSocialMetricsForTenant(tenant: string): Promise<void> {
  return (await backend()).clearSocialMetricsForTenant(tenant);
}
