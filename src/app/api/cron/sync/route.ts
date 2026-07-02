/** Scheduled sync: re-sync EVERY connected Google Ads account of every connected
 *  user (not just the active one) and alert about newly-critical campaigns. Turns
 *  the dashboard from "open it to check" into "we tell you when something breaks",
 *  and makes account switching land on warm data — each account already gets its
 *  own tenant via the connector's tenant key, so alerts cover the whole agency
 *  portfolio and de-dupe per tenant exactly as before.
 *
 *  Guarded by CRON_SECRET (Vercel Cron sends it as a Bearer token when the env var
 *  is set). Schedule lives in vercel.json. */
import { listConnectedAccounts, listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveCampaignContext } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { getLatestChanges, getSyncMeta, saveSeries, upsertCampaigns } from "@/lib/campaigns/store";
import { evaluateAndAlert } from "@/lib/campaigns/alerts";
import { evaluateAnomalyAlerts } from "@/lib/campaigns/anomaly-alerts";
import { recordActivity } from "@/lib/campaigns/activity";
import { indexChanges, type CampaignPeriod, type DailyPoint } from "@/lib/campaigns/types";

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
  const results: { userId: string; projectId?: string; customerId?: string; ok: boolean; alerted?: number; anomalies?: number; error?: string }[] = [];

  // Per-project tenancy: sync each of the user's projects into its own tenant.
  // (A connected account currently mirrors into every project of that user;
  //  mapping a specific Ads account to a single project via adsCustomerId is a
  //  follow-up — reads and writes are consistent per project either way.)
  for (const userId of userIds) {
    const [{ accounts }, projects] = await Promise.all([
      listConnectedAccounts(userId),
      listProjects(userId),
    ]);
    // Fall back to the per-user tenant when a user has no projects yet.
    const targets = projects.length ? projects : [null];
    // Fan out over every connected account (an agency's MCC list), not just the
    // active one — each lands in its own account-keyed tenant. listConnectedUserIds
    // pre-filters to ≥1 account, but keep a null fallback for safety.
    const accountIds = accounts.length ? accounts.map((a) => a.customerId) : [null];
    for (const accountId of accountIds) {
    for (const project of targets) {
    try {
      const { connector, tenant } = await resolveCampaignContext(
        userId,
        project?.id,
        project?.type,
        accountId
      );
      const meta = await getSyncMeta(tenant);
      const period: CampaignPeriod = meta?.period ?? "30d";

      const campaigns = await connector.fetchCampaigns(period);

      // Best-effort daily series (never fail the sync over a series hiccup) —
      // fetched before the upsert so the sync meta reflects both fetch outcomes.
      let series: DailyPoint[] = [];
      try {
        series = await connector.fetchSeries(period);
      } catch (err) {
        console.error(`[cron] series sync failed for ${userId}:`, err);
      }

      // Truth-in-labeling (mirrors the manual sync route): a live fetch that fell
      // back to sample data must be persisted as such, never as "živá data".
      const degradation = connector.degradation;
      await upsertCampaigns(tenant, campaigns, {
        source: degradation.campaigns ? "sample" : connector.source,
        period,
        degraded: degradation.campaigns || degradation.series,
        degradedReason: degradation.reason,
      });
      await saveSeries(tenant, series, { period });

      // The upsert appended this sync's snapshot, so the diff includes it — the
      // change-aware triage rules (ROAS crater, spend spike) alert here too.
      const alerted = await evaluateAndAlert(
        tenant,
        userId,
        campaigns,
        indexChanges(await getLatestChanges(tenant))
      );

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

      results.push({ userId, projectId: project?.id, customerId: accountId ?? undefined, ok: true, alerted, anomalies });
    } catch (err) {
      console.error(`[cron] sync failed for ${userId}/${project?.id}/${accountId}:`, err);
      results.push({
        userId,
        projectId: project?.id,
        customerId: accountId ?? undefined,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
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
