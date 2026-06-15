/** Campaigns API: list the synced state (GET) and sync from the Ads connector
 *  into SQLite (POST). Node runtime + dynamic because it talks to node:sqlite. */
import { getConnector } from "@/lib/campaigns/connector";
import {
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

/** Everything the page needs in one payload: campaigns, sync metadata, the
 *  latest stored reports for the synced period, and the full score history per
 *  scope/campaign (across periods) that drives the trend timelines. */
function loadState() {
  const meta = getSyncMeta();
  return {
    campaigns: listCampaigns(),
    meta,
    reports: meta ? getReportsForPeriod(meta.period) : {},
    histories: getReportHistories(),
  };
}

export function GET() {
  return Response.json(loadState());
}

export async function POST(request: Request) {
  // Throttle syncs per IP — this hits the connector (and, once live credentials
  // are wired, the Google Ads API) so it shouldn't be hammerable by anyone.
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

  const connector = getConnector();
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

  upsertCampaigns(campaigns, { source: connector.source, period });
  return Response.json(loadState());
}
