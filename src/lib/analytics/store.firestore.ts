/** First-party analytics — FIRESTORE backend. One doc per (metric, UTC day) at
 *  `analyticsDaily/{day}__{encoded metric}` holding {metric, day, count},
 *  incremented atomically (FieldValue.increment — the same pattern the shared
 *  report's view counter uses). The metric is URI-encoded in the doc id only
 *  ("/" is not a valid doc-id character); the FIELD keeps the raw key. Reads are
 *  a single-field `day` range, so no composite index is needed. Server-only;
 *  imported lazily by the dispatcher. Mirrors the local backend. */
import { FieldValue } from "firebase-admin/firestore";
import { firestore } from "@/lib/firebase";
import type { DailyMetricRow } from "./store";

function col() {
  return firestore.collection("analyticsDaily");
}

export async function bumpDailyMetric(metric: string, day: string): Promise<void> {
  await col()
    .doc(`${day}__${encodeURIComponent(metric)}`)
    .set({ metric, day, count: FieldValue.increment(1) }, { merge: true });
}

export async function listDailyMetricsSince(sinceDay: string): Promise<DailyMetricRow[]> {
  const snap = await col().where("day", ">=", sinceDay).get();
  return snap.docs.map((d) => d.data() as DailyMetricRow);
}
