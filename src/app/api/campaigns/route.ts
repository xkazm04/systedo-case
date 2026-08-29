/** Campaigns API: list the synced state (GET) and sync from the Ads connector
 *  (POST), per-tenant in Firestore. Each signed-in user reads/writes their own
 *  tenant; anonymous visitors share a `sample` tenant. Node runtime. */
import { currentUserId } from "@/lib/session";
import {
  resolveCampaignContext,
  resolveProjectTenants,
  resolveTenant,
} from "@/lib/campaigns/connector";
import { getProject } from "@/lib/projects/store";
import { rejectUnknownProject } from "@/lib/projects/api-guard";
import {
  getCampaignSeries,
  getLatestChanges,
  getReportHistories,
  getReportsForPeriodWithHashes,
  getSeries,
  getSyncMeta,
  listCampaigns,
  listCampaignsForTenants,
  listSnapshotSummaries,
  readTenantRoot,
  setActivePeriod,
  type TenantRoot,
} from "@/lib/campaigns/store";
import { assembleProjectCampaignsState, type CampaignsStateInputs } from "./state";
import { runTenantSync } from "@/lib/campaigns/sync";
import { isCampaignPeriod, type Campaign, type CampaignPeriod } from "@/lib/campaigns/types";
import { consume, refund } from "@/lib/usage";
import {
  RATE_RULES,
  clientIp,
  payloadTooLarge,
  tooLarge,
  tooManyRequests,
} from "@/lib/ai/rate-limit";
import { durableGuard } from "@/lib/ai/durable-limit";
import { describeRefusal } from "@/lib/ai/paid-guard";


/** Everything the page needs in one payload: campaigns, sync metadata, the latest
 *  stored reports for the period (plus which of them are stale), the per-scope
 *  score history, and the sync-over-sync change diff — all scoped to the tenant.
 *  `requestedPeriod` reads a specific period's stored state (the store keeps
 *  every synced period now); omitted, it serves the active one. */
async function loadTenantInputs(
  tenant: string,
  requestedPeriod?: CampaignPeriod,
  // Pre-read by the project-level loader so a union costs exactly ONE root read
  // and ONE campaigns listing per tenant — no more than the single-tenant path.
  preRoot?: TenantRoot,
  // A promise, so the per-tenant campaign listings run alongside (not before) the
  // rest of each tenant's parallel read batch.
  preCampaigns?: Promise<Campaign[]>
): Promise<CampaignsStateInputs> {
  // ONE tenant-root read per request: the root carries the sync meta AND the
  // active-period pointer that listCampaigns/getSeries/getCampaignSeries/
  // listSnapshotSummaries/getLatestChanges each used to re-read (5+ root reads per
  // load). We read it once and pass it down. Everything below is independent of
  // everything else, so the reads run in parallel instead of ~9 sequential
  // round-trips. activePeriod semantics are unchanged — `root.activePeriod` is
  // exactly what `activePeriod(tenant)` returned before.
  const root = preRoot ?? (await readTenantRoot(tenant));
  const meta = await getSyncMeta(tenant, root);
  const period = requestedPeriod ?? meta?.period;

  const [campaigns, changes, reportsBundle, histories, series, campaignSeries, snapshotSummaries] =
    await Promise.all([
      // Already listed (and source-tagged) by listCampaignsForTenants when the
      // project-level loader threaded it in; `period` resolves identically there,
      // because root.activePeriod IS meta.period.
      preCampaigns ?? listCampaigns(tenant, period, root),
      getLatestChanges(tenant, period, root),
      meta && period
        ? getReportsForPeriodWithHashes(tenant, period)
        : Promise.resolve({ reports: {}, inputHashes: {} as Record<string, string | null> }),
      getReportHistories(tenant),
      getSeries(tenant, period, root),
      getCampaignSeries(tenant, period, root),
      // Rule-based health per stored sync — the deterministic timeline next to the
      // AI score history (which only grows when evaluations are paid for).
      listSnapshotSummaries(tenant, 12, period, root),
    ]);

  return {
    meta,
    period,
    campaigns,
    changes,
    reports: reportsBundle.reports,
    inputHashes: reportsBundle.inputHashes,
    histories,
    series,
    campaignSeries,
    snapshotSummaries,
  };
}

/** ADR-0010 — the PROJECT's state: the union of its per-account tenants, in
 *  precedence order (Google first, then Sklik), assembled into ONE payload.
 *
 *  A single-source project resolves to exactly one tenant, so the response is
 *  byte-identical to the pre-union one — `assembleProjectCampaignsState` of one
 *  part IS `assembleCampaignsState` of its inputs, adding no key.
 *
 *  This is a READ. Every write surface (change-sets, alerts, analyze, the sync
 *  below) stays on `resolveTenant`'s single tenant: "a union read must not be
 *  mistaken for a union write" (ADR-0010 "Consequences"). Every tenant here is
 *  built by `buildTenantKey` from the SESSION's user id, so a union widens what
 *  one user's project reads across THEIR OWN accounts and can never span users.
 *
 *  Exported so `test-unit/campaigns-route-union.test.mjs` can drive it against a
 *  LOCAL_DB temp database without a Next request. */
export async function loadProjectState(
  userId: string | null,
  projectId?: string,
  requestedPeriod?: CampaignPeriod
) {
  const tenants = await resolveProjectTenants(userId, projectId);
  // ONE root read per tenant, then EVERYTHING else concurrently: the source-tagged
  // campaign listings (root-threaded, so they issue no second root read) and each
  // tenant's own parallel batch. A two-tenant union therefore costs exactly twice
  // the single-tenant path's reads, and no extra round-trip depth.
  const roots = await Promise.all(tenants.map(({ tenant }) => readTenantRoot(tenant)));
  const tagged = listCampaignsForTenants(tenants, requestedPeriod, roots);
  const parts = await Promise.all(
    tenants.map(async ({ tenant, source }, i) => ({
      source,
      inputs: await loadTenantInputs(
        tenant,
        requestedPeriod,
        roots[i],
        tagged.then((lists) => lists[i] ?? [])
      ),
    }))
  );
  // Pure assembly (stale-report detection, the non-active-period meta rewrite and
  // the union merge rules) lives in ./state so the exact response shape is
  // unit-tested without Firestore.
  return assembleProjectCampaignsState(parts);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    // ?period= serves that period's stored state read-only (empty campaigns
    // when it was never synced — the client then falls back to a real sync).
    const rawPeriod = url.searchParams.get("period");
    const period = isCampaignPeriod(rawPeriod) ? rawPeriod : undefined;
    const userId = await currentUserId();
    // Prove the wire projectId before it composes a tenant key — an unverified id
    // mints a fresh empty tenant, so a typo answers "no campaigns synced yet"
    // (indistinguishable from a real cold project) and leaves an orphan behind.
    const unknown = await rejectUnknownProject(userId, projectId);
    if (unknown) return unknown;
    return Response.json(await loadProjectState(userId, projectId, period));
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
  const ip = clientIp(request);
  const syncRules = [RATE_RULES.syncPerMin()];
  const limited = await durableGuard(ip, syncRules);
  if (!limited.ok) {
    return tooManyRequests(
      limited.retryAfter,
      `Příliš mnoho synchronizací. Zkuste to prosím znovu za ${limited.retryAfter} s.`,
      await describeRefusal(ip, syncRules, limited)
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

  const userId = await currentUserId();
  const unknownProject = await rejectUnknownProject(userId, projectId);
  if (unknownProject) return unknownProject;

  // Period toggle fast path: when the requested period's stored state is warm
  // (it has been synced before), flip the tenant's active pointer and serve it
  // — instant, no connector round-trip, no sync quota burned. The active
  // pointer moves so the (gate-locked) analyze route evaluates exactly the
  // period on screen. Falls through to a real sync when the period is cold.
  if (preferStored) {
    // The pointer flip is a WRITE, so it stays on the single resolveTenant tenant;
    // what comes back is the project's union read for that period.
    const tenant = await resolveTenant(userId, projectId);
    const flipped = await setActivePeriod(tenant, period);
    if (flipped) return Response.json(await loadProjectState(userId, projectId, period));
  }

  // Per-user daily sync quota (signed-in users).
  if (userId) {
    const quota = await consume(userId, "sync");
    if (!quota.ok) {
      return Response.json(
        {
          error: `Denní limit synchronizací vyčerpán (${quota.status.used.sync}/${quota.status.limits.sync}). Zkuste to zítra nebo přejděte na vyšší plán (ceník na /cena).`,
          upgradeUrl: "/cena",
          // Additive machine half of the same sentence: which layer refused (the
          // per-user PLAN quota, not one of the per-IP throttles above), the rule
          // it enforced, and the standing. The prose already said it in Czech; a
          // client should not have to parse Czech to branch on it.
          code: "quota",
          layer: "plan-quota",
          limit: quota.status.limits.sync,
          windowSeconds: 86_400,
          used: quota.status.used.sync,
          remaining: Math.max(0, quota.status.limits.sync - quota.status.used.sync),
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
    // The sync threw (true failure — runTenantSync degrades live→sample internally
    // rather than throwing for provider hiccups), so reclaim the daily sync unit:
    // a transient failure must not burn the user's sync quota for nothing.
    if (userId) await refund(userId, "sync");
    return Response.json(
      { error: err instanceof Error ? err.message : "Synchronizace se nezdařila." },
      { status: 502 }
    );
  }

  // The sync wrote ONE tenant (single-tenant write); the response is the project's
  // union read, so a dual-network console shows both networks after either sync.
  return Response.json(await loadProjectState(userId, projectId, period));
}
