/** Per-project live-metrics store — backend dispatcher. Resolves to the local
 *  node:sqlite store when LOCAL_DB is on, else Firestore. The backend is imported
 *  LAZILY so the LOCAL_DB path never evaluates the Firestore module. Both backends
 *  export an identical interface. Project-scoped (not per-user): the synced series
 *  belongs to the project. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { ReportMetrics } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's synced metrics, or null when it has never synced (→ sample fallback). */
export async function getReportMetrics(projectId: string): Promise<ReportMetrics | null> {
  return (await backend()).getReportMetrics(projectId);
}

/** Replace the project's synced metrics with a fresh sync. */
export async function saveReportMetrics(projectId: string, metrics: ReportMetrics): Promise<void> {
  return (await backend()).saveReportMetrics(projectId, metrics);
}

/** Drop a project's synced metrics (→ reverts the report to sample data). */
export async function clearReportMetrics(projectId: string): Promise<void> {
  return (await backend()).clearReportMetrics(projectId);
}
