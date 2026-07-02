import { performance } from "@/lib/data";
import { buildMetricsSnapshot } from "@/lib/metrics";
import { snapshotToArticle } from "@/lib/snapshot-to-article";

/** The auto-generated 90-day report article, built once at module scope and
 *  shared by the page and its Open Graph card — so the share card's headline
 *  and the rendered report can never drift apart (same snapshot parameters,
 *  same deterministic bridge). */
export const reportArticle = snapshotToArticle(
  buildMetricsSnapshot(performance, { key: "90d", label: "90 dní", days: 90 }),
  { name: performance.client.name, segment: performance.client.segment },
  performance.meta.asOf
);
