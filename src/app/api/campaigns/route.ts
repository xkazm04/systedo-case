/** Campaigns API: list the synced state (GET) and sync from the Ads connector
 *  (POST), per-tenant in Firestore. Each signed-in user reads/writes their own
 *  tenant; anonymous visitors share a `sample` tenant. Node runtime. */
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { resolveCampaignContext, resolveTenant } from "@/lib/campaigns/connector";
import {
  getLatestChanges,
  getReportHistories,
  getReportsForPeriod,
  getSyncMeta,
  listCampaigns,
  upsertCampaigns,
} from "@/lib/campaigns/store";
import { isCampaignPeriod, type CampaignPeriod } from "@/lib/campaigns/types";
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
 *  stored reports for the synced period, the per-scope score history, and the
 *  sync-over-sync change diff — all scoped to the tenant. */
async function loadState(tenant: string) {
  const meta = await getSyncMeta(tenant);
  return {
    campaigns: await listCampaigns(tenant),
    meta,
    reports: meta ? await getReportsForPeriod(tenant, meta.period) : {},
    histories: await getReportHistories(tenant),
    changes: await getLatestChanges(tenant),
  };
}

export async function GET() {
  try {
    const tenant = await resolveTenant(userIdOf(await auth()));
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

  // Live Google Ads for a connected user, sample data otherwise — always into the
  // user's own tenant.
  const { connector, tenant } = await resolveCampaignContext(userIdOf(await auth()));

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

  await upsertCampaigns(tenant, campaigns, { source: connector.source, period });
  return Response.json(await loadState(tenant));
}
