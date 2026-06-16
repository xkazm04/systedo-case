/** Apply a recommendation to Google Ads (human-triggered). Currently supports
 *  pausing a campaign. Requires a signed-in user with a connected live account;
 *  the mutation is audited server-side. */
import { auth } from "@/auth";
import { applyPause } from "@/lib/campaigns/mutations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const userId = (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: { action?: unknown; campaignId?: unknown; campaignName?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const action = body.action ?? "pause";
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  if (!campaignId) return Response.json({ error: "Chybí ID kampaně." }, { status: 422 });
  const campaignName = typeof body.campaignName === "string" ? body.campaignName : campaignId;

  if (action !== "pause") {
    return Response.json({ error: "Nepodporovaná akce." }, { status: 400 });
  }

  const result = await applyPause(userId, campaignId, campaignName);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
