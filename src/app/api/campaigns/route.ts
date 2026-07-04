/** Campaigns API: list the synced state (GET) and sync from the Ads connector
 *  (POST), per-tenant in Firestore. Each signed-in user reads/writes their own
 *  tenant; anonymous visitors share a `sample` tenant. Node runtime. */
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { resolveCampaignContext, resolveTenant } from "@/lib/campaigns/connector";
import { getProject } from "@/lib/projects/store";
import {
  getCampaignSeries,
  getLatestChanges,
  getReportHistories,
  getReportsForPeriodWithHashes,
  getSeries,
  getSyncMeta,
  hashEvalInputs,
  listCampaigns,
  listSnapshotSummaries,
  setActivePeriod,
} from "@/lib/campaigns/store";
import { runTenantSync } from "@/lib/campaigns/sync";
import { isCampaignPeriod, type CampaignPeriod } from "@/lib/campaigns/types";
import { consume } from "@/lib/usage";
import {
  RATE_RULES,
  clientIp,
  payloadTooLarge,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";


function userIdOf(session: Session | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/** Everything the page needs in one payload: campaigns, sync metadata, the latest
 *  stored reports for the period (plus which of them are stale), the per-scope
 *  score history, and the sync-over-sync change diff — all scoped to the tenant.
 *  `requestedPeriod` reads a specific period's stored state (the store keeps
 *  every synced period now); omitted, it serves the active one. */
async function loadState(tenant: string, requestedPeriod?: CampaignPeriod) {
  const meta = await getSyncMeta(tenant);
  const period = requestedPeriod ?? meta?.period;
  const campaigns = await listCampaigns(tenant, period);
  const changes = await getLatestChanges(tenant, period);
  const { reports, inputHashes } =
    meta && period
      ? await getReportsForPeriodWithHashes(tenant, period)
      : { reports: {}, inputHashes: {} as Record<string, string | null> };

  // A report is stale when its stored input fingerprint no longer matches the
  // data on screen — i.e. a later sync changed the metrics it was based on, so
  // its score/recommendations may mislead. Reports predating input hashing
  // (null hash) can't be compared and are not flagged (no false alarms).
  // The current hash folds in the sync diff exactly like the analyze route, so
  // a fresh report is never flagged stale by hash-recipe mismatch.
  const staleKeys =
    meta && period
      ? Object.keys(reports).filter((key) => {
          const stored = inputHashes[key];
          if (!stored) return false;
          const current =
            key === "overall"
              ? hashEvalInputs("overall", null, period, campaigns, changes?.current ?? null)
              : hashEvalInputs("campaign", key, period, campaigns, changes?.current ?? null);
          return stored !== current;
        })
      : [];

  // When serving a non-active period's stored state, the meta the client sees
  // must describe THAT period (and its own sync age), not the active pointer.
  const metaOut =
    meta && period && period !== meta.period
      ? { ...meta, period, syncedAt: meta.syncedByPeriod?.[period] ?? meta.syncedAt }
      : meta;

  return {
    campaigns,
    meta: metaOut,
    reports,
    staleKeys,
    histories: await getReportHistories(tenant),
    changes,
    series: await getSeries(tenant, period),
    campaignSeries: await getCampaignSeries(tenant, period),
    // Rule-based health per stored sync — the deterministic timeline next to
    // the AI score history (which only grows when evaluations are paid for).
    snapshotSummaries: await listSnapshotSummaries(tenant, 12, period),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    // ?period= serves that period's stored state read-only (empty campaigns
    // when it was never synced — the client then falls back to a real sync).
    const rawPeriod = url.searchParams.get("period");
    const period = isCampaignPeriod(rawPeriod) ? rawPeriod : undefined;
    const tenant = await resolveTenant(userIdOf(await auth()), projectId);
    return Response.json(await loadState(tenant, period));
  } catch (err) {
    console.error("[campaigns] loadState failed:", err);
    return Response.json({ error: "Nepodařilo se načíst stav kampaní." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Throttle syncs per IP — this hits the connector (and, for live accounts, the
  // Google Ads API) so it shouldn't be hammerable.
  if (tooLarge(request)) {
    return payloadTooLarge("Požadavek je příliš velký.");
  }
  const limited = await durableGuard(clientIp(request), [RATE_RULES.syncPerMin()]);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho synchronizací. Zkuste to prosím znovu za ${limited.retryAfter} s.`
    );
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine — default the period */
  }
  const raw = (body as { period?: unknown } | null)?.period;
  const period: CampaignPeriod = isCampaignPeriod(raw) ? raw : "30d";
  const rawProjectId = (body as { projectId?: unknown } | null)?.projectId;
  const projectId = typeof rawProjectId === "string" ? rawProjectId : undefined;
  const preferStored = Boolean((body as { preferStored?: unknown } | null)?.preferStored);

  const userId = userIdOf(await auth());

  // Period toggle fast path: when the requested period's stored state is warm
  // (it has been synced before), flip the tenant's active pointer and serve it
  // — instant, no connector round-trip, no sync quota burned. The active
  // pointer moves so the (gate-locked) analyze route evaluates exactly the
  // period on screen. Falls through to a real sync when the period is cold.
  if (preferStored) {
    const tenant = await resolveTenant(userId, projectId);
    const flipped = await setActivePeriod(tenant, period);
    if (flipped) return Response.json(await loadState(tenant, period));
  }

  // Per-user daily sync quota (signed-in users).
  if (userId) {
    const quota = await consume(userId, "sync");
    if (!quota.ok) {
      return Response.json(
        {
          error: `Denní limit synchronizací vyčerpán (${quota.status.used.sync}/${quota.status.limits.sync}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
          upgradeUrl: "/cena",
        },
        { status: 429 }
      );
    }
  }

  // Live Google Ads for a connected user, sample data otherwise — into the active
  // project's tenant when one is supplied. Load the project's type so the sample
  // provider can produce domain-appropriate data.
  const project = userId && projectId ? await getProject(userId, projectId) : null;
  const { connector, tenant } = await resolveCampaignContext(userId, projectId, project?.type);

  // The shared pipeline (fetch → persist with truthful degradation labeling →
  // change-aware + anomaly alerts → activity timeline) — identical to the
  // scheduled cron's, so a manual sync surfaces problems and shows up in the
  // agency-facing timeline just like an automatic one.
  try {
    await runTenantSync(connector, tenant, { userId, period, actor: "Vy" });
  } catch (err) {
    console.error("[campaigns] sync failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Synchronizace se nezdařila." },
      { status: 502 }
    );
  }

  return Response.json(await loadState(tenant, period));
}
