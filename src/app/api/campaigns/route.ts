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
  const changes = await getLatestChanges(tenant);
  const { reports, inputHashes } = meta
    ? await getReportsForPeriodWithHashes(tenant, meta.period)
    : { reports: {}, inputHashes: {} as Record<string, string | null> };

  // A report is stale when its stored input fingerprint no longer matches the
  // data on screen — i.e. a later sync changed the metrics it was based on, so
  // its score/recommendations may mislead. Reports predating input hashing
  // (null hash) can't be compared and are not flagged (no false alarms).
  // The current hash folds in the sync diff exactly like the analyze route, so
  // a fresh report is never flagged stale by hash-recipe mismatch.
  const staleKeys = meta
    ? Object.keys(reports).filter((key) => {
        const stored = inputHashes[key];
        if (!stored) return false;
        const current =
          key === "overall"
            ? hashEvalInputs("overall", null, meta.period, campaigns, changes?.current ?? null)
            : hashEvalInputs("campaign", key, meta.period, campaigns, changes?.current ?? null);
        return stored !== current;
      })
    : [];

  return {
    campaigns,
    meta,
    reports,
    staleKeys,
    histories: await getReportHistories(tenant),
    changes,
    series: await getSeries(tenant),
    campaignSeries: await getCampaignSeries(tenant),
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

  return Response.json(await loadState(tenant));
}
