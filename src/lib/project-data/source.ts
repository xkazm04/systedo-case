/** Pure data-source LABEL mapper for the per-project surfaces. Given the honest
 *  `live` signal — the project has actually SYNCED rows, resolved server-side by
 *  `hasSyncedMetrics` / `resolveReportDataset` (see report-metrics) — this returns
 *  the source + human label to render. It deliberately does NOT derive "live"
 *  itself: linking an Ads account is not the same as having synced data, and the
 *  label must never claim "živá data" before the Monthly Report actually shows it.
 *
 *  Framework-free (takes a boolean, touches no DB) so the client Settings/Content
 *  modules can import it while the server owner passes `live` down as a prop.
 *
 *  The other modules' live sources (Merchant Center, CRM, Search Console, ESP,
 *  GBP) follow the same sample→live adapter pattern — see
 *  docs/roadmap/integration-backlog.md. */

export interface ProjectDataSource {
  source: "sample" | "google-ads";
  label: string;
  live: boolean;
}

/** Map the honest `live` signal to a source descriptor + label. `live` must come
 *  from synced-rows detection (`hasSyncedMetrics`), never from `adsCustomerId`,
 *  so every surface labels itself consistently (živá vs ukázková data). */
export function projectDataSource(live: boolean): ProjectDataSource {
  if (live) {
    return { source: "google-ads", label: "Živá data · Google Ads", live: true };
  }
  return { source: "sample", label: "Ukázková data", live: false };
}
