/** First-party analytics — LOCAL node:sqlite backend. One row per (metric, UTC
 *  day) in `.data/systedo.db` (table `analytics_daily`, DDL in src/lib/db.ts),
 *  incremented in place. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { DailyMetricRow } from "./store";

export async function bumpDailyMetric(metric: string, day: string): Promise<void> {
  getDb()
    .prepare(
      `INSERT INTO analytics_daily (metric, day, count) VALUES (?, ?, 1)
       ON CONFLICT (metric, day) DO UPDATE SET count = count + 1`
    )
    .run(metric, day);
}

export async function listDailyMetricsSince(sinceDay: string): Promise<DailyMetricRow[]> {
  return getDb()
    .prepare("SELECT metric, day, count FROM analytics_daily WHERE day >= ? ORDER BY day")
    .all(sinceDay) as unknown as DailyMetricRow[];
}
