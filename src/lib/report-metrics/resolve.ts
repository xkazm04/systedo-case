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
import { isReportStale } from "./freshness";
import { listAnnotations } from "@/lib/annotations/store";
import { annotationsToEvents } from "@/lib/annotations/types";
import { isLiveMetrics, type ReportMetrics } from "./types";

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
  /** true when a LIVE series is older than the staleness window (>7d) — drives the
   *  report's stale banner + the recap's staleness caveat. Never true on sample. */
  stale?: boolean;
}

/** The active dataset for a project's report: live if synced rows exist, else sample. */
export async function resolveReportDataset(project: Project): Promise<ResolvedDataset> {
  let metrics: ReportMetrics | null = null;
  try {
    metrics = await getReportMetrics(project.id);
  } catch {
    metrics = null; // store hiccup → degrade to sample, never break the report
  }
  if (isLiveMetrics(metrics)) {
    const data = buildLiveDataset(project, metrics.rows);
    // Resolve seam (annotations): a live report has no authored event calendar
    // (build.ts sets events:undefined) — give it memory by mapping the project's
    // client notes into the SAME PerformanceData.events shape a sample dataset
    // uses, so chart markers + recap grounding read one canonical source. A store
    // hiccup degrades to "no events", never breaking the report.
    try {
      const annotations = await listAnnotations(project.id);
      if (annotations.length) data.events = annotationsToEvents(annotations);
    } catch {
      /* leave events undefined */
    }
    return {
      data,
      source: metrics.meta.source,
      live: true,
      syncedAt: metrics.meta.syncedAt,
      customerId: metrics.meta.customerId,
      stale: isReportStale(metrics.meta.syncedAt, new Date()),
    };
  }
  return { data: getProjectDataset(project), source: "sample", live: false };
}
