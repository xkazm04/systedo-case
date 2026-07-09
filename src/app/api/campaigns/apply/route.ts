/** Apply a recommendation to Google Ads (human-triggered). Supports pausing a
 *  campaign and applying a recommended budget shift between two campaigns.
 *  Requires a signed-in user with a connected live account; the mutation is
 *  audited server-side. */
import { currentUserId } from "@/lib/session";
import { applyBudgetShift, applyPause } from "@/lib/campaigns/mutations";


const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: {
    action?: unknown;
    campaignId?: unknown;
    campaignName?: unknown;
    fromId?: unknown;
    fromName?: unknown;
    toId?: unknown;
    toName?: unknown;
    amount?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const action = body.action ?? "pause";

  if (action === "pause") {
    const campaignId = str(body.campaignId);
    if (!campaignId) return Response.json({ error: "Chybí ID kampaně." }, { status: 422 });
    const campaignName = str(body.campaignName) || campaignId;
    const result = await applyPause(userId, campaignId, campaignName);
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  if (action === "budget_shift") {
    const fromId = str(body.fromId);
    const toId = str(body.toId);
    const amount = Number(body.amount);
    if (!fromId || !toId) return Response.json({ error: "Chybí ID kampaní." }, { status: 422 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: "Neplatná částka přesunu." }, { status: 422 });
    }
    const result = await applyBudgetShift(userId, {
      fromId,
      fromName: str(body.fromName) || fromId,
      toId,
      toName: str(body.toName) || toId,
      amount,
    });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  return Response.json({ error: "Nepodporovaná akce." }, { status: 400 });
}
