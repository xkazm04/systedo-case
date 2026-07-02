/** Campaigns API: list the synced state (GET) and sync from the Ads connector
 *  (POST), per-tenant in Firestore. Each signed-in user reads/writes their own
 *  tenant; anonymous visitors share a `sample` tenant. Node runtime. */
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { resolveCampaignContext, resolveTenant } from "@/lib/campaigns/connector";
import { getProject } from "@/lib/projects/store";
import {
  getLatestChanges,
  getReportHistories,
  getReportsForPeriodWithHashes,
  getSeries,
  getSyncMeta,
  hashEvalInputs,
  listCampaigns,
  saveSeries,
  upsertCampaigns,
} from "@/lib/campaigns/store";
import { evaluateAndAlert } from "@/lib/campaigns/alerts";
import type { DailyPoint } from "@/lib/campaigns/types";
import { isCampaignPeriod, type CampaignPeriod } from "@/lib/campaigns/types";
import { consume } from "@/lib/usage";
import {
  RATE_RULES,
  clientIp,
  payloadTooLarge,
  rateLimit,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function userIdOf(session: Session | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

/** Everything the page needs in one payload: campaigns, sync metadata, the latest
 *  stored reports for the synced period (plus which of them are stale), the
 *  per-scope score history, and the sync-over-sync change diff — all scoped to
 *  the tenant. */
async function loadState(tenant: string) {
  const meta = await getSyncMeta(tenant);
  const campaigns = await listCampaigns(tenant);
  const { reports, inputHashes } = meta
    ? await getReportsForPeriodWithHashes(tenant, meta.period)
    : { reports: {}, inputHashes: {} as Record<string, string | null> };

  // A report is stale when its stored input fingerprint no longer matches the
  // data on screen — i.e. a later sync changed the metrics it was based on, so
  // its score/recommendations may mislead. Reports predating input hashing
  // (null hash) can't be compared and are not flagged (no false alarms).
  const staleKeys = meta
    ? Object.keys(reports).filter((key) => {
        const stored = inputHashes[key];
        if (!stored) return false;
        const current =
          key === "overall"
            ? hashEvalInputs("overall", null, meta.period, campaigns)
            : hashEvalInputs("campaign", key, meta.period, campaigns);
        return stored !== current;
      })
    : [];

  return {
    campaigns,
    meta,
    reports,
    staleKeys,
    histories: await getReportHistories(tenant),
    changes: await getLatestChanges(tenant),
    series: await getSeries(tenant),
  };
}

export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
    const tenant = await resolveTenant(userIdOf(await auth()), projectId);
    return Response.json(await loadState(tenant));
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
  const limited = rateLimit(clientIp(request), [RATE_RULES.syncPerMin()]);
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

  const userId = userIdOf(await auth());

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

  let campaigns;
  try {
    campaigns = await connector.fetchCampaigns(period);
  } catch (err) {
    console.error("[campaigns] sync failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Synchronizace se nezdařila." },
      { status: 502 }
    );
  }

  // Daily trend series — best-effort: a failed series (e.g. live GAQL hiccup)
  // must not fail the whole sync. Fetched before the upsert so the persisted
  // sync meta can reflect the degradation outcome of BOTH fetches.
  let series: DailyPoint[] = [];
  let seriesOk = false;
  try {
    series = await connector.fetchSeries(period);
    seriesOk = true;
  } catch (err) {
    console.error("[campaigns] series sync failed:", err);
  }

  // Truth-in-labeling: when a live fetch silently fell back to the sample
  // provider, say so. A campaign fallback means the numbers on screen ARE sample
  // data → the persisted source flips to "sample"; a series-only fallback keeps
  // the source but still flags the sync as degraded.
  const degradation = connector.degradation;
  await upsertCampaigns(tenant, campaigns, {
    source: degradation.campaigns ? "sample" : connector.source,
    period,
    degraded: degradation.campaigns || degradation.series,
    degradedReason: degradation.reason,
  });

  // Only persist when the fetch succeeded — a transient failure must not overwrite
  // the last good series with an empty array, which would blank the trend chart
  // even though the campaign upsert (and the prior series) were fine.
  if (seriesOk) await saveSeries(tenant, series, { period });

  // Alert on newly-critical campaigns (in-app inbox + best-effort email/webhook,
  // deduped) so a manual sync surfaces problems just like the scheduled cron does.
  if (userId) {
    try {
      await evaluateAndAlert(tenant, userId, campaigns);
    } catch (err) {
      console.error("[campaigns] alert evaluation failed:", err);
    }
  }

  return Response.json(await loadState(tenant));
}
