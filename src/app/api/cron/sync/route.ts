/** Scheduled sync: re-sync every connected user's active Google Ads account and
 *  alert them about newly-critical campaigns. Turns the dashboard from "open it
 *  to check" into "we tell you when something breaks".
 *
 *  Guarded by CRON_SECRET (Vercel Cron sends it as a Bearer token when the env var
 *  is set). Schedule lives in vercel.json. */
import { listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveCampaignContext } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { getSyncMeta, saveSeries, upsertCampaigns } from "@/lib/campaigns/store";
import { evaluateAndAlert } from "@/lib/campaigns/alerts";
import { evaluateAnomalyAlerts } from "@/lib/campaigns/anomaly-alerts";
import { recordActivity } from "@/lib/campaigns/activity";
import type { CampaignPeriod, DailyPoint } from "@/lib/campaigns/types";
import { cronAuthorized } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// long-running fan-out across users
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = await listConnectedUserIds();
  const results: { userId: string; projectId?: string; ok: boolean; alerted?: number; anomalies?: number; error?: string }[] = [];

  // Per-project tenancy: sync each of the user's projects into its own tenant.
  // (A connected account currently mirrors into every project of that user;
  //  mapping a specific Ads account to a single project via adsCustomerId is a
  //  follow-up — reads and writes are consistent per project either way.)
  for (const userId of userIds) {
    const projects = await listProjects(userId);
    // Fall back to the per-user tenant when a user has no projects yet.
    const targets = projects.length ? projects : [null];
    for (const project of targets) {
    try {
      const { connector, tenant } = await resolveCampaignContext(userId, project?.id, project?.type);
      const meta = await getSyncMeta(tenant);
      const period: CampaignPeriod = meta?.period ?? "30d";

      const campaigns = await connector.fetchCampaigns(period);
      await upsertCampaigns(tenant, campaigns, { source: connector.source, period });

      // Best-effort daily series (never fail the sync over a series hiccup).
      let series: DailyPoint[] = [];
      try {
        series = await connector.fetchSeries(period);
      } catch (err) {
        console.error(`[cron] series sync failed for ${userId}:`, err);
      }
      await saveSeries(tenant, series, { period });

      const alerted = await evaluateAndAlert(tenant, userId, campaigns);

      // Surface dashboard anomalies through the same inbox/email/webhook pipeline.
      // Best-effort: a series/detection hiccup must never fail the sync.
      let anomalies = 0;
      try {
        anomalies = await evaluateAnomalyAlerts(tenant, userId, series);
      } catch (err) {
        console.error(`[cron] anomaly alerting failed for ${userId}:`, err);
      }

      await recordActivity(tenant, {
        kind: "sync",
        title: `Synchronizace · ${campaigns.length} kampaní`,
        detail:
          alerted + anomalies > 0
            ? `Načteno z Google Ads. ${alerted} nových kritických kampaní, ${anomalies} anomálií.`
            : "Načteno z Google Ads. Bez nových upozornění.",
        actor: "Automatická synchronizace",
      });

      results.push({ userId, projectId: project?.id, ok: true, alerted, anomalies });
    } catch (err) {
      console.error(`[cron] sync failed for ${userId}/${project?.id}:`, err);
      results.push({ userId, projectId: project?.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    }
  }

  return Response.json({
    synced: results.length,
    alerted: results.reduce((n, r) => n + (r.alerted ?? 0), 0),
    anomalies: results.reduce((n, r) => n + (r.anomalies ?? 0), 0),
    results,
  });
}
