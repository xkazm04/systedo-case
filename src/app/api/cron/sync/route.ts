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
import { listSklikConnectedUserIds } from "@/lib/campaigns/sklik-connection";
import { unionConnectedUserIds } from "@/lib/campaigns/provider-precedence";
import { resolveCampaignContext, resolveCampaignContextForSource } from "@/lib/campaigns/connector";
import { listProjects } from "@/lib/projects/store";
import { getSyncMeta } from "@/lib/campaigns/store";
import { runTenantSync } from "@/lib/campaigns/sync";
import type { CampaignPeriod } from "@/lib/campaigns/types";
import { cronAuthorized } from "@/lib/cron-auth";
import { getReportMetrics, getReportSection } from "@/lib/report-metrics/store";
import {
  syncReportMetricsFromAds,
  syncReportMetricsFromSklik,
  syncReportMetricsShared,
  type SyncResult,
} from "@/lib/report-metrics/sync";
import type { DailySeriesBundle } from "@/lib/google/ads";
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
  // Fan out over Google-connected AND per-user-Sklik-connected users, deduped: a
  // Sklik-only user (no Google adsConnections) used to be invisible to the cron and
  // so NEVER synced daily. Now they are enumerated too; planSyncTargets returns their
  // per-project null-account targets, and resolveCampaignContext picks the Sklik
  // provider into the stable `sklik` tenant — the same tenant a manual sync / read
  // uses, so the daily refresh and the on-screen data agree. A user with BOTH keeps
  // Google-first (Sklik provider never fires while Google is connected), and the
  // per-tenant idempotent upsert keeps the double-run guards intact.
  const [googleUserIds, sklikUserIds] = await Promise.all([
    listConnectedUserIds(),
    listSklikConnectedUserIds(),
  ]);
  const userIds = unionConnectedUserIds(googleUserIds, sklikUserIds);
  // Membership probe for the ADR-0010 Sklik report section below: "does this user
  // have a per-user Sklik connection at all". Derived from the listing we already
  // did, so the extra section costs no extra connection read per user.
  const sklikUsers = new Set(sklikUserIds);
  const results: { userId: string; projectId?: string; customerId?: string; reason?: string; ok: boolean; alerted?: number; anomalies?: number; error?: string }[] = [];
  // Direction 1: the report's live series re-synced alongside the campaign sync. The
  // report had NO cron — refresh was manual-only, so syncedAt silently drifted and
  // the recap served month-old numbers. This cron is the right home (vs. the daily
  // report/digest crons): it ALREADY fans out over the exact per-(account,project)
  // linked targets a report sync needs and runs hourly, so a per-project due-gate
  // (~20h) turns it into an effectively-daily, quota-safe refresh. One
  // syncReportMetricsFromAds call per linked project per run, bounded by that gate.
  const reportResults: { userId: string; projectId: string; source?: string; ok: boolean; skipped?: boolean; error?: string }[] = [];

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
    // ADR-0010: a user with BOTH connections gets an ADDITIONAL Sklik target per
    // `sklikLinked` project, so both networks sync in the same run into their own
    // per-account tenants. Single-source users get the identical plan as before.
    const hasSklik = sklikUsers.has(userId);
    const targets = planSyncTargets({ accounts, projects, hasSklik });
    for (const target of targets) {
    // Report-metrics refresh for the LINKED project behind this target. Only a
    // project that carries its own adsCustomerId can sync a report (the sync resolves
    // the account from the project, never from the active connection), so the unmapped
    // single-project fallback is skipped here. Resolve the due-gate UP FRONT so a due
    // report can share ONE date-segmented Ads read with the campaigns series below
    // (Direction 3). The due-gate keeps a report refresh to ~once/day/project.
    // `!target.source` — an ADR-0010 Sklik target must never trigger the GOOGLE
    // report sync: the same project can now carry both targets, and the Google
    // section belongs to the Google one (running it on both would double the
    // 400-day Ads read every run).
    const linked = target.projectId && !target.source
      ? projects.find((p) => p.id === target.projectId && p.adsCustomerId)
      : undefined;
    let reportDue = false;
    if (linked) {
      try {
        const existing = await getReportMetrics(linked.id);
        reportDue = isResyncDue(existing?.meta.syncedAt, new Date());
      } catch {
        reportDue = false; // a read hiccup → treat as not-due; the next run retries
      }
    }
    // The shared report sync — fetch 400d ONCE, persist the report, and return the
    // campaigns period series sliced from the SAME rows. Populated inside the
    // campaigns try (it needs the resolved campaign `period` for the slice).
    let reportSync: { result: SyncResult; bundle: DailySeriesBundle | null } | null = null;

    try {
      // A Sklik target resolves that ONE provider into its own `…_sklik` tenant —
      // the registry's first-wins walk would hand a dual user Google here and sync
      // Google's data twice. Every other target keeps the unchanged walk.
      const { connector, tenant } = target.source
        ? await resolveCampaignContextForSource(userId, target.projectId, target.projectType, target.source)
        : await resolveCampaignContext(userId, target.projectId, target.projectType, target.customerId);
      const meta = await getSyncMeta(tenant);
      const period: CampaignPeriod = meta?.period ?? "30d";

      // Direction 3: when the report is due, the shared 400d read persists the report
      // AND yields the campaigns period series — one query instead of two. Injected
      // into runTenantSync so it doesn't issue its own date-segmented query. A
      // credential-gated / degraded shared fetch returns a null bundle → runTenantSync
      // fetches its own series, byte-identical to before. syncReportMetricsShared never
      // throws (classified result), so a report-sync failure can't disturb the sync.
      if (linked && reportDue) {
        reportSync = await syncReportMetricsShared(linked, userId, period);
      }

      // The shared pipeline (fetch → persist with truthful degradation labeling
      // → change-aware + anomaly alerts → activity timeline). It also carries
      // the only-overwrite-on-success series guard the manual route had and this
      // cron lacked — a failed fetch no longer wipes the stored trend series.
      const { alerted, anomalies } = await runTenantSync(connector, tenant, {
        userId,
        period,
        actor: "Automatická synchronizace",
        ...(reportSync?.bundle ? { seriesBundle: reportSync.bundle } : {}),
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

    // Report-metrics bookkeeping. The fetch/persist already ran above (shared) when
    // due and the campaign context resolved; if the campaigns try threw BEFORE that,
    // sync the report STANDALONE (its own 400d read) so its refresh stays independent
    // of the campaigns fetch — the pre-Direction-3 behaviour.
    if (linked) {
      if (!reportDue) {
        reportResults.push({ userId, projectId: linked.id, ok: true, skipped: true });
      } else {
        let result = reportSync?.result;
        if (!result) {
          try {
            result = await syncReportMetricsFromAds(linked, userId);
          } catch (err) {
            console.error(`[cron] report-metrics sync failed for ${userId}/${linked.id}:`, err);
            result = { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        }
        reportResults.push({ userId, projectId: linked.id, ok: result.ok, ...(result.error ? { error: result.error } : {}) });
      }
    }

    // ADR-0010 — the SKLIK section of this project's report, refreshed beside the
    // Google one and gated independently. Two things must both be true: the project
    // carries the explicit `sklikLinked` flag (Sklik has no account id to link on),
    // and the owner actually has a per-user Sklik connection. The due-gate reads the
    // SKLIK SECTION's own syncedAt — reading the blob's top-level meta would answer
    // with Google's age and either skip a stale Sklik section forever or re-pull it
    // every run. Never throws: syncReportMetricsFromSklik returns a classified
    // result, and the section read is wrapped so a store hiccup just defers to the
    // next run rather than failing the whole cron.
    // Exactly ONE target per project may own the Sklik section: the explicit Sklik
    // target when the user also has Google (a dual project has two targets), else the
    // project's own account-less target (a Sklik-only user has just that one).
    const ownsSklikSection = target.source === "sklik" || !target.customerId;
    const sklikProject = target.projectId && ownsSklikSection
      ? projects.find((p) => p.id === target.projectId && p.sklikLinked)
      : undefined;
    if (sklikProject && hasSklik) {
      try {
        const section = await getReportSection(sklikProject.id, "sklik");
        if (!isResyncDue(section?.meta.syncedAt, new Date())) {
          reportResults.push({ userId, projectId: sklikProject.id, source: "sklik", ok: true, skipped: true });
        } else {
          const result = await syncReportMetricsFromSklik(sklikProject, userId);
          reportResults.push({
            userId,
            projectId: sklikProject.id,
            source: "sklik",
            ok: result.ok,
            ...(result.error ? { error: result.error } : {}),
          });
        }
      } catch (err) {
        console.error(`[cron] Sklik report sync failed for ${userId}/${sklikProject.id}:`, err);
        reportResults.push({
          userId,
          projectId: sklikProject.id,
          source: "sklik",
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
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
