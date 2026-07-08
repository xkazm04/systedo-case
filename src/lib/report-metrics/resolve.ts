/** A1 data-source seam. `resolveReportDataset` returns the dataset the monthly
 *  report + AI recap should run on: a project's LIVE synced Ads series when it has
 *  one, else the scaled sample dataset (clearly illustrative). This is the single
 *  place the report/recap flip from demo to real — the modules downstream consume
 *  the unchanged PerformanceData shape. Server-only (reads the metrics store). */
import "server-only";
import type { Project } from "@/lib/projects/types";
import type { PerformanceData } from "@/lib/types";
import { getProjectDataset } from "@/lib/project-data/dataset";
import { getReportMetrics } from "./store";
import { buildLiveDataset } from "./build";
import type { ReportMetrics } from "./types";

export interface ResolvedDataset {
  data: PerformanceData;
  /** "google-ads" once real data is synced, else "sample" (illustrative). */
  source: "sample" | "google-ads";
  /** true when the numbers are the client's own synced data. */
  live: boolean;
  /** ISO timestamp of the last sync (live only). */
  syncedAt?: string;
  /** the ad account behind the live data (live only). */
  customerId?: string;
}

/** The active dataset for a project's report: live if synced rows exist, else sample. */
export async function resolveReportDataset(project: Project): Promise<ResolvedDataset> {
  let metrics: ReportMetrics | null = null;
  try {
    metrics = await getReportMetrics(project.id);
  } catch {
    metrics = null; // store hiccup → degrade to sample, never break the report
  }
  if (metrics && metrics.rows.length > 0) {
    return {
      data: buildLiveDataset(project, metrics.rows),
      source: metrics.meta.source,
      live: true,
      syncedAt: metrics.meta.syncedAt,
      customerId: metrics.meta.customerId,
    };
  }
  return { data: getProjectDataset(project), source: "sample", live: false };
}
