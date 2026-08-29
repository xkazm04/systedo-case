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
import { blendSections, primarySection, readSections } from "./blend";
import { isLiveMetrics, type MetricsSource, type ReportMetrics } from "./types";

export interface ResolvedDataset {
  data: PerformanceData;
  /** the platform behind the numbers once real data is synced, "multi" when two
   *  platforms were actually blended (ADR-0010), else "sample" (illustrative). */
  source: "sample" | MetricsSource | "multi";
  /** true when the numbers are the client's own synced data. */
  live: boolean;
  /** ISO timestamp of the last sync (live only). */
  syncedAt?: string;
  /** the ad account behind the live data (live only). */
  customerId?: string;
  /** the synced account's captured ISO-4217 currency (live only, non-CZK only) — drives
   *  currency-aware money labels on the report. Absent → the base CZK formatting. */
  currencyCode?: string;
  /** true when a LIVE series is older than the staleness window (>7d) — drives the
   *  report's stale banner + the recap's staleness caveat. Never true on sample. */
  stale?: boolean;
  /** every live platform this project holds a section for, blend order. Present
   *  ONLY when there is more than one (a single-source project is byte-identical to
   *  its pre-ADR-0010 resolve, key for key). */
  sources?: MetricsSource[];
  /** true when the project's sections disagree on currency, so blending them would
   *  fabricate a total: `data` is the PRIMARY section alone and the report must
   *  refuse to present it as the whole picture. Only ever set alongside `sources`. */
  mixedCurrency?: boolean;
}

/** The active dataset for a project's report: live if synced rows exist, else sample. */
export async function resolveReportDataset(project: Project): Promise<ResolvedDataset> {
  let metrics: ReportMetrics | null = null;
  try {
    metrics = await getReportMetrics(project.id);
  } catch (err) {
    // Store hiccup → degrade to sample, never break the report. Log it so a genuine
    // store failure is distinguishable from "never synced" (which returns null cleanly).
    console.error("[report-metrics] store read failed for %s", project.id, err);
    metrics = null;
  }
  if (isLiveMetrics(metrics)) {
    // ADR-0010: the stored blob holds one section per platform. Blending is a pure,
    // read-time derivation (./blend) — one section blends to itself, so a
    // single-source project resolves exactly what it did before. The PRIMARY
    // section's meta stays the provenance the report labels (Google when present),
    // which is also what the blob's legacy top-level `meta` holds.
    const blended = blendSections(metrics);
    // `?? metrics` is unreachable for a live blob (isLiveMetrics already proved the
    // legacy pair is a section) — it only keeps this total without a non-null assert.
    const primary = primarySection(readSections(metrics)) ?? metrics;
    const data = buildLiveDataset(
      project,
      blended.rows,
      primary.meta.currencyCode,
      // A mix only exists once two same-currency sections were actually blended;
      // otherwise no argument is passed and the dataset is byte-identical.
      blended.channels.length > 0 ? { channels: blended.channels, channelDaily: blended.channelDaily } : undefined
    );
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
      // "multi" ONLY when two sections were genuinely blended. A refused blend
      // (mixed currency) serves the primary alone, so it is labelled as the primary
      // and `mixedCurrency` carries the rest of the truth.
      source: blended.channels.length > 0 ? "multi" : primary.meta.source,
      live: true,
      syncedAt: primary.meta.syncedAt,
      customerId: primary.meta.customerId,
      stale: isReportStale(primary.meta.syncedAt, new Date()),
      // Additive, and only for a genuinely multi-source project — a single-source
      // resolve stays key-for-key identical to the pre-ADR-0010 output.
      ...(blended.sources.length > 1 ? { sources: blended.sources } : {}),
      ...(blended.mixedCurrency ? { mixedCurrency: true } : {}),
      // Surface the captured currency so the report tiles can label a foreign account in
      // its own currency (build.ts also set data.client.currency to the same code).
      ...(data.client.currency && data.client.currency !== "CZK" ? { currencyCode: data.client.currency } : {}),
    };
  }
  return { data: getProjectDataset(project), source: "sample", live: false };
}
