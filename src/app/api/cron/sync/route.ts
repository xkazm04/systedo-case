/** Scheduled sync: re-sync every connected user's active Google Ads account and
 *  alert them about newly-critical campaigns. Turns the dashboard from "open it
 *  to check" into "we tell you when something breaks".
 *
 *  Guarded by CRON_SECRET (Vercel Cron sends it as a Bearer token when the env var
 *  is set). Schedule lives in vercel.json. */
import { listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveCampaignContext } from "@/lib/campaigns/connector";
import { getSyncMeta, saveSeries, upsertCampaigns } from "@/lib/campaigns/store";
import { evaluateAndAlert } from "@/lib/campaigns/alerts";
import { evaluateAnomalyAlerts } from "@/lib/campaigns/anomaly-alerts";
import { recordActivity } from "@/lib/campaigns/activity";
import type { CampaignPeriod, DailyPoint } from "@/lib/campaigns/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// long-running fan-out across users
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // disabled until a secret is configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userIds = await listConnectedUserIds();
  const results: { userId: string; ok: boolean; alerted?: number; anomalies?: number; error?: string }[] = [];

  for (const userId of userIds) {
    try {
      const { connector, tenant } = await resolveCampaignContext(userId);
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

      results.push({ userId, ok: true, alerted, anomalies });
    } catch (err) {
      console.error(`[cron] sync failed for ${userId}:`, err);
      results.push({ userId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({
    synced: results.length,
    alerted: results.reduce((n, r) => n + (r.alerted ?? 0), 0),
    anomalies: results.reduce((n, r) => n + (r.anomalies ?? 0), 0),
    results,
  });
}
