/** Data-source seam for the per-project spine. Today every project reads scaled
 *  sample data (`getProjectDataset`). A project linked to a Google Ads account is
 *  a *live* source; wiring its synced series into the PerformanceData shape is the
 *  remaining (credential-gated) integration — at which point only the resolver
 *  below changes, not the modules that consume the spine.
 *
 *  Live wiring sketch (needs the Ads API + a connected account, hence not active
 *  in the demo):
 *
 *    export async function resolveProjectDataset(project, userId) {
 *      const ctx = await resolveCampaignContext(userId);        // existing connector
 *      if (project.adsCustomerId && ctx.connector.source === "google-ads") {
 *        const series = await ctx.connector.fetchSeries(period); // live daily totals
 *        return anchorSampleToLive(getProjectDataset(project), series);
 *      }
 *      return getProjectDataset(project);                       // sample fallback
 *    }
 *
 *  The other modules' live sources (Merchant Center, CRM, Search Console, ESP,
 *  GBP) follow the same sample→live adapter pattern — see
 *  docs/roadmap/integration-backlog.md. */
import type { Project } from "@/lib/projects/types";

export interface ProjectDataSource {
  source: "sample" | "google-ads";
  label: string;
  live: boolean;
}

/** The active data source for a project: live once an Ads account is linked,
 *  sample otherwise. Used to label surfaces honestly (živá vs ukázková data). */
export function projectDataSource(project: Project): ProjectDataSource {
  if (project.adsCustomerId) {
    return { source: "google-ads", label: "Živá data · Google Ads", live: true };
  }
  return { source: "sample", label: "Ukázková data", live: false };
}
