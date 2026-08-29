/** Per-project live-metrics store — backend dispatcher. Resolves to the local
 *  node:sqlite store when LOCAL_DB is on, else Firestore. The backend is imported
 *  LAZILY so the LOCAL_DB path never evaluates the Firestore module. Both backends
 *  export an identical interface. Project-scoped (not per-user): the synced series
 *  belongs to the project. Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";
import { primarySection, readSections } from "./blend";
import { isLiveMetrics, type MetricsSource, type ReportMetrics, type ReportMetricsSection } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's synced metrics, or null when it has never synced (→ sample fallback). */
export async function getReportMetrics(projectId: string): Promise<ReportMetrics | null> {
  return (await backend()).getReportMetrics(projectId);
}

/** The honest "live data" signal for a project — true once it has actually synced
 *  rows (see `isLiveMetrics`), false when only an Ads account is linked or nothing
 *  has synced. The single source label surfaces (Overview/Settings/Content engine)
 *  should read from, so they agree with the Monthly Report. Server-only (store hits
 *  the DB); a store hiccup degrades to "not live" rather than breaking the caller. */
export async function hasSyncedMetrics(projectId: string): Promise<boolean> {
  try {
    return isLiveMetrics(await getReportMetrics(projectId));
  } catch {
    return false;
  }
}

/** Replace the project's synced metrics with a fresh sync. */
export async function saveReportMetrics(projectId: string, metrics: ReportMetrics): Promise<void> {
  return (await backend()).saveReportMetrics(projectId, metrics);
}

/** Drop a project's synced metrics (→ reverts the report to sample data). */
export async function clearReportMetrics(projectId: string): Promise<void> {
  return (await backend()).clearReportMetrics(projectId);
}

/** ONE platform's section of the project's blob (ADR-0010), or null when that
 *  platform has never synced into this project. Honours the legacy-read rule, so a
 *  pre-sections blob answers for the source its own meta names and null for the
 *  other. This is the per-source freshness probe the cron's due-gate reads — asking
 *  the top-level `meta.syncedAt` would report Google's age for a Sklik decision. */
export async function getReportSection(
  projectId: string,
  source: MetricsSource
): Promise<ReportMetricsSection | null> {
  return readSections(await getReportMetrics(projectId))[source] ?? null;
}

/** Drop ONE platform's section, leaving the others intact and rewriting the legacy
 *  top-level `meta`/`rows` from whatever is still primary. Clearing the LAST section
 *  clears the whole blob (→ the report reverts to sample data), which is exactly
 *  what `clearReportMetrics` has always meant. A no-op when the section is absent,
 *  so it is safe to call blind. */
export async function clearReportSection(projectId: string, source: MetricsSource): Promise<void> {
  const sections = readSections(await getReportMetrics(projectId));
  if (!sections[source]) return;
  delete sections[source];
  const primary = primarySection(sections);
  if (!primary) return clearReportMetrics(projectId);
  return saveReportMetrics(projectId, { meta: primary.meta, rows: primary.rows, sources: sections });
}
