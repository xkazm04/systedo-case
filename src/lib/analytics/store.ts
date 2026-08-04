/** First-party analytics store — backend dispatcher. Holds ONLY aggregated daily
 *  counters (metric key + UTC day + count): no IP, no user agent, no cookies, no
 *  session or per-user rows, by design — the privacy posture IS the schema. Local
 *  node:sqlite when LOCAL_DB is on, else Firestore; the backend is imported
 *  LAZILY so the LOCAL_DB path never evaluates the Firestore module. Server-only.
 *  Mirrors onboarding/store. */
import { LOCAL_DB } from "@/lib/local-mode";

/** One aggregated counter: how many times `metric` was recorded on `day` (UTC). */
export interface DailyMetricRow {
  /** e.g. "view:/dashboard", "view:/app-gate", "signup", "activation" */
  metric: string;
  /** UTC calendar day, "YYYY-MM-DD" */
  day: string;
  count: number;
}

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** Increment one (metric, day) counter by 1. */
export async function bumpDailyMetric(metric: string, day: string): Promise<void> {
  return (await backend()).bumpDailyMetric(metric, day);
}

/** Every counter row with day >= sinceDay (inclusive). */
export async function listDailyMetricsSince(sinceDay: string): Promise<DailyMetricRow[]> {
  return (await backend()).listDailyMetricsSince(sinceDay);
}
