/** Social read-back counters — LOCAL node:sqlite backend (WP W3-D). Table
 *  `social_post_metrics` (DDL + migration v33 in src/lib/db.ts). Selected when LOCAL_DB
 *  is on. Server-only. Mirrors the Firestore backend's interface exactly.
 *
 *  `upsertSocialMetricDay` is an upsert-OVERWRITE, not an upsert-increment: a read-back
 *  is a snapshot (see ./metrics.ts). That single choice is what makes the cron step
 *  recompute-idempotent — running it twice in a day leaves the same three integers. */
import { getDb } from "@/lib/db";
import type { SocialMetricDay } from "./metrics";

interface MetricRow {
  post_id: string;
  day: string;
  tenant: string;
  reach: number;
  likes: number;
  comments: number;
}

const toRow = (r: MetricRow): SocialMetricDay => ({
  postId: r.post_id,
  day: r.day,
  tenant: r.tenant,
  reach: r.reach,
  likes: r.likes,
  comments: r.comments,
});

export async function upsertSocialMetricDay(row: SocialMetricDay): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO social_post_metrics (post_id, day, tenant, reach, likes, comments)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (post_id, day) DO UPDATE SET
         tenant = excluded.tenant,
         reach = excluded.reach,
         likes = excluded.likes,
         comments = excluded.comments`
    )
    .run(row.postId, row.day, row.tenant, row.reach, row.likes, row.comments);
}

export async function listPostMetricDays(
  postIds: readonly string[],
  sinceDay: string
): Promise<SocialMetricDay[]> {
  if (postIds.length === 0) return [];
  // ONE bound statement, reused per post — deliberately NOT an `IN (…)` list built by
  // interpolating a run of `?` (scripts/sast.mjs blocks that idiom, and the rule is
  // worth more than the convenience). The loop costs nothing: the caller's post list is
  // capped, the statement is prepared once, and node:sqlite is synchronous in-process.
  // It is also the exact twin of the Firestore backend, which reads one bounded page
  // per post for its own reasons.
  const stmt = getDb().prepare(
    "SELECT post_id, day, tenant, reach, likes, comments FROM social_post_metrics WHERE post_id = ? AND day >= ?"
  );
  const out: SocialMetricDay[] = [];
  for (const id of postIds) {
    for (const r of stmt.all(id, sinceDay) as unknown as MetricRow[]) out.push(toRow(r));
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.postId.localeCompare(b.postId));
}

export async function pruneSocialMetrics(beforeDay: string): Promise<number> {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM social_post_metrics WHERE day < ?")
    .get(beforeDay) as { n: number } | undefined;
  const n = row?.n ?? 0;
  if (n > 0) db.prepare("DELETE FROM social_post_metrics WHERE day < ?").run(beforeDay);
  return n;
}

export async function clearSocialMetricsForTenant(tenant: string): Promise<void> {
  getDb().prepare("DELETE FROM social_post_metrics WHERE tenant = ?").run(tenant);
}
