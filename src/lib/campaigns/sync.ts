/** One shared sync pipeline for the manual POST /api/campaigns sync and the
 *  scheduled /api/cron/sync fan-out. The two routes had drifted into
 *  half-pipelines: the cron ran anomaly alerts + the activity feed but wiped the
 *  stored series on a failed fetch (the only-overwrite-on-success guard was only
 *  ever added to the manual route), while manual syncs produced no anomaly
 *  alerts and were invisible in the agency-facing timeline. Both routes now
 *  shrink to auth/quota + one call, and every step lives here exactly once.
 *  Server-only. */
import "server-only";
import type { AdsConnector } from "./connector";
import { getLatestChanges, saveCampaignSeries, saveSeries, upsertCampaigns } from "./store";
import { evaluateAndAlert } from "./alerts";
import { evaluateAnomalyAlerts } from "./anomaly-alerts";
import { recordActivity } from "./activity";
import {
  indexChanges,
  type Campaign,
  type CampaignPeriod,
  type DailyPoint,
} from "./types";

export interface TenantSyncResult {
  campaigns: Campaign[];
  series: DailyPoint[];
  /** the series fetch succeeded and the stored series was overwritten */
  seriesOk: boolean;
  /** newly-critical campaigns alerted on (0 for anonymous tenants) */
  alerted: number;
  /** newly-anomalous days alerted on (0 for anonymous tenants / failed series) */
  anomalies: number;
}

/**
 * Sync one tenant from its connector: fetch → persist (with truthful
 * degradation labeling) → alert → record in the activity timeline.
 *
 * A campaign-fetch failure throws (the manual route maps it to a 502, the cron
 * to a per-target error result); everything downstream of the fetches is
 * best-effort in the same way the two routes already were. The stored series is
 * only overwritten when its fetch succeeded — a transient hiccup must not blank
 * the trend chart the last good sync produced.
 */
export async function runTenantSync(
  connector: AdsConnector,
  tenant: string,
  opts: { userId: string | null; period: CampaignPeriod; actor: string }
): Promise<TenantSyncResult> {
  const { userId, period, actor } = opts;

  const campaigns = await connector.fetchCampaigns(period);

  // Daily trend series — best-effort: a failed series must not fail the sync.
  // Fetched before the upsert so the persisted sync meta can reflect the
  // degradation outcome of BOTH fetches.
  let series: DailyPoint[] = [];
  let seriesOk = false;
  try {
    series = await connector.fetchSeries(period);
    seriesOk = true;
  } catch (err) {
    console.error(`[campaigns] series sync failed for ${tenant}:`, err);
  }

  // Per-campaign daily series (table sparklines) — same best-effort +
  // only-overwrite-on-success contract as the portfolio series.
  let campaignSeries: Record<string, DailyPoint[]> | null = null;
  try {
    campaignSeries = await connector.fetchCampaignSeries(period);
  } catch (err) {
    console.error(`[campaigns] campaign series sync failed for ${tenant}:`, err);
  }

  // Truth-in-labeling: when a live fetch silently fell back to the sample
  // provider, say so. A campaign fallback means the numbers on screen ARE
  // sample data → the persisted source flips to "sample"; a series-only
  // fallback keeps the source but still flags the sync as degraded.
  const degradation = connector.degradation;
  await upsertCampaigns(tenant, campaigns, {
    source: degradation.campaigns ? "sample" : connector.source,
    period,
    degraded: degradation.campaigns || degradation.series,
    degradedReason: degradation.reason,
    // A degraded campaign fetch means `campaigns` are sample data with different
    // ids/costs than the account's real set. Keeping it out of the snapshot
    // history stops getLatestChanges from diffing sample-vs-live and reporting
    // fabricated add/remove churn (which triage would escalate to critical alerts).
    appendSnapshot: !degradation.campaigns,
  });
  if (seriesOk) await saveSeries(tenant, series, { period });
  if (campaignSeries) await saveCampaignSeries(tenant, campaignSeries, { period });

  // Alerts (signed-in tenants): newly-critical campaigns — change-aware, the
  // upsert above appended this sync's snapshot so the diff includes it — plus
  // performance anomalies on the fresh series. Both best-effort.
  let alerted = 0;
  let anomalies = 0;
  if (userId) {
    // Skip campaign alerting on a degraded sync: `campaigns` are sample data, so
    // both the criticality check and the (now sample-free) change diff would fire
    // false critical alerts on numbers that aren't the account's.
    if (!degradation.campaigns) {
      try {
        alerted = await evaluateAndAlert(
          tenant,
          userId,
          campaigns,
          indexChanges(await getLatestChanges(tenant))
        );
      } catch (err) {
        console.error(`[campaigns] alert evaluation failed for ${tenant}:`, err);
      }
    }
    // Only on a genuinely live series: a fetch that silently fell back to sample
    // (seriesOk but degradation.series) would raise anomaly alerts on demo numbers;
    // an empty/failed one would clear the de-dupe memory and cause re-alerts.
    if (seriesOk && !degradation.series) {
      try {
        anomalies = await evaluateAnomalyAlerts(tenant, userId, series);
      } catch (err) {
        console.error(`[campaigns] anomaly alerting failed for ${tenant}:`, err);
      }
    }
  }

  // Activity timeline — the durable "what happened" record; manual syncs used
  // to be invisible here. recordActivity is itself best-effort (never throws).
  await recordActivity(tenant, {
    kind: "sync",
    title: `Synchronizace · ${campaigns.length} kampaní`,
    detail:
      `Zdroj: ${connector.label}. ` +
      (alerted + anomalies > 0
        ? `${alerted} nových kritických kampaní, ${anomalies} anomálií.`
        : "Bez nových upozornění."),
    actor,
  });

  return { campaigns, series, seriesOk, alerted, anomalies };
}
