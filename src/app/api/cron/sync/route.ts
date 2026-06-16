/** Scheduled sync: re-sync every connected user's active Google Ads account and
 *  alert them about newly-critical campaigns. Turns the dashboard from "open it
 *  to check" into "we tell you when something breaks".
 *
 *  Guarded by CRON_SECRET (Vercel Cron sends it as a Bearer token when the env var
 *  is set). Schedule lives in vercel.json. */
import { listConnectedUserIds } from "@/lib/campaigns/connection";
import { resolveCampaignContext } from "@/lib/campaigns/connector";
import { getSyncMeta, upsertCampaigns } from "@/lib/campaigns/store";
import { evaluateAndAlert } from "@/lib/campaigns/alerts";
import type { CampaignPeriod } from "@/lib/campaigns/types";

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
  const results: { userId: string; ok: boolean; alerted?: number; error?: string }[] = [];

  for (const userId of userIds) {
    try {
      const { connector, tenant } = await resolveCampaignContext(userId);
      const meta = await getSyncMeta(tenant);
      const period: CampaignPeriod = meta?.period ?? "30d";

      const campaigns = await connector.fetchCampaigns(period);
      await upsertCampaigns(tenant, campaigns, { source: connector.source, period });

      const alerted = await evaluateAndAlert(tenant, userId, campaigns);
      results.push({ userId, ok: true, alerted });
    } catch (err) {
      console.error(`[cron] sync failed for ${userId}:`, err);
      results.push({ userId, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ synced: results.length, alerted: results.reduce((n, r) => n + (r.alerted ?? 0), 0), results });
}
