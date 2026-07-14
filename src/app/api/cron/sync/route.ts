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
import { getSyncMeta } from "@/lib/campaigns/store";
import { runTenantSync } from "@/lib/campaigns/sync";
import type { CampaignPeriod } from "@/lib/campaigns/types";
import { cronAuthorized } from "@/lib/cron-auth";
import { getReportMetrics } from "@/lib/report-metrics/store";
import { syncReportMetricsFromAds } from "@/lib/report-metrics/sync";
import { isResyncDue } from "@/lib/report-metrics/freshness";
import { recordCronRun } from "@/lib/cron/run";
import { planSyncTargets } from "./plan";

// long-running fan-out across users
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = new Date();
  const userIds = await listConnectedUserIds();
  const results: { userId: string; projectId?: string; customerId?: string; reason?: string; ok: boolean; alerted?: number; anomalies?: number; error?: string }[] = [];
  // Direction 1: the report's live series re-synced alongside the campaign sync. The
  // report had NO cron — refresh was manual-only, so syncedAt silently drifted and
  // the recap served month-old numbers. This cron is the right home (vs. the daily
  // report/digest crons): it ALREADY fans out over the exact per-(account,project)
  // linked targets a report sync needs and runs hourly, so a per-project due-gate
  // (~20h) turns it into an effectively-daily, quota-safe refresh. One
  // syncReportMetricsFromAds call per linked project per run, bounded by that gate.
  const reportResults: { userId: string; projectId: string; ok: boolean; skipped?: boolean; error?: string }[] = [];

  // Per-project tenancy with account→project mapping: an Ads account is synced
  // ONLY into the project(s) explicitly linked to it via project.adsCustomerId
  // (digits-normalised, matching the monthly-report path in report-metrics/sync.ts).
  // The old cron mirrored every account into every project (N×M), multiplying API
  // calls and writing one client's spend under another client's project. A
  // conservative fallback keeps pre-existing single-account/single-project users
  // (who never set the link) syncing — see planSyncTargets for the exact rule.
  for (const userId of userIds) {
    const [{ accounts }, projects] = await Promise.all([
      listConnectedAccounts(userId),
      listProjects(userId),
    ]);
    const targets = planSyncTargets({ accounts, projects });
    for (const target of targets) {
    try {
      const { connector, tenant } = await resolveCampaignContext(
        userId,
        target.projectId,
        target.projectType,
        target.customerId
      );
      const meta = await getSyncMeta(tenant);
      const period: CampaignPeriod = meta?.period ?? "30d";

      // The shared pipeline (fetch → persist with truthful degradation labeling
      // → change-aware + anomaly alerts → activity timeline). It also carries
      // the only-overwrite-on-success series guard the manual route had and this
      // cron lacked — a failed fetch no longer wipes the stored trend series.
      const { alerted, anomalies } = await runTenantSync(connector, tenant, {
        userId,
        period,
        actor: "Automatická synchronizace",
      });

      results.push({ userId, projectId: target.projectId, customerId: target.customerId ?? undefined, reason: target.reason, ok: true, alerted, anomalies });
    } catch (err) {
      console.error(`[cron] sync failed for ${userId}/${target.projectId}/${target.customerId}:`, err);
      results.push({
        userId,
        projectId: target.projectId,
        customerId: target.customerId ?? undefined,
        reason: target.reason,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Report-metrics refresh for the LINKED project behind this target. Only a
    // project that carries its own adsCustomerId can sync a report (the sync
    // resolves the account from the project, never from the active connection), so
    // the unmapped single-project fallback is skipped here. The due-gate keeps this
    // to ~once/day/project; syncReportMetricsFromAds does the rest of the gating
    // (save-only-on-success, classified errors, never throws), so a report-sync
    // failure never disturbs the campaign sync above.
    const linked = target.projectId
      ? projects.find((p) => p.id === target.projectId && p.adsCustomerId)
      : undefined;
    if (linked) {
      try {
        const existing = await getReportMetrics(linked.id);
        if (!isResyncDue(existing?.meta.syncedAt, new Date())) {
          reportResults.push({ userId, projectId: linked.id, ok: true, skipped: true });
        } else {
          const r = await syncReportMetricsFromAds(linked, userId);
          reportResults.push({ userId, projectId: linked.id, ok: r.ok, ...(r.error ? { error: r.error } : {}) });
        }
      } catch (err) {
        console.error(`[cron] report-metrics sync failed for ${userId}/${linked.id}:`, err);
        reportResults.push({ userId, projectId: linked.id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    }
  }

  const failed = results.filter((r) => !r.ok);
  const reportSynced = reportResults.filter((r) => r.ok && !r.skipped).length;
  const reportSkipped = reportResults.filter((r) => r.skipped).length;

  // Durable run record: one row per invocation, so the last sync's outcome is
  // answerable via /api/health without digging through Vercel logs.
  await recordCronRun("sync", startedAt, {
    ok: failed.length === 0 && reportResults.every((r) => r.ok),
    counts: {
      synced: results.filter((r) => r.ok).length,
      failed: failed.length,
      alerted: results.reduce((n, r) => n + (r.alerted ?? 0), 0),
      anomalies: results.reduce((n, r) => n + (r.anomalies ?? 0), 0),
      reportSynced,
      reportSkipped,
      reportFailed: reportResults.filter((r) => !r.ok).length,
    },
    results,
    errors: [...failed, ...reportResults.filter((r) => !r.ok)],
  });

  return Response.json({
    synced: results.length,
    alerted: results.reduce((n, r) => n + (r.alerted ?? 0), 0),
    anomalies: results.reduce((n, r) => n + (r.anomalies ?? 0), 0),
    results,
    // Direction 1: report-metrics refreshes this run (one per linked project, minus
    // the due-gate skips).
    reportSynced,
    reportSkipped,
    reportResults,
  });
}
