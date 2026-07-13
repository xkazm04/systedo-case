/** Change-set executor for live Google Ads mutations (pause / budget shift).
 *  Retained as the audited executor beneath the governed control-plane flow; the
 *  UI proposes through change-sets, not this route. EVERY live mutation path —
 *  including this one — runs the same guardrail policy (checkPolicy): a move that
 *  breaches a guardrail is rejected unless the caller passes an explicit override.
 *  Requires a signed-in user with a connected live account; audited server-side. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import { applyBudgetShift, applyPause } from "@/lib/campaigns/mutations";
import { checkPolicy, DEFAULT_POLICY } from "@/lib/campaigns/control-plane-types";
import type { BudgetMove } from "@/lib/campaigns/simulate";


const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Run the shared guardrail policy over a single move; returns a 422 body when it
 *  breaches and no override was given, else null (proceed). */
function guardrail(move: BudgetMove, override: boolean): { error: string; violations: string[] } | null {
  const violations = checkPolicy([move], DEFAULT_POLICY);
  if (violations.length > 0 && !override) {
    return { error: "Úprava porušuje pojistky a vyžaduje výslovný souhlas.", violations };
  }
  return null;
}

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
    projectId?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }

  const action = body.action ?? "pause";
// Audit + activity land in the SAME project-scoped tenant the campaigns live
  // under, so a pause/shift is auditable next to the data it changed. Resolved
  // here (not inside the mutation) exactly like every other campaign read/write.
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);
  const override = (body as { override?: unknown }).override === true;

  if (action === "pause") {
    const campaignId = str(body.campaignId);
    if (!campaignId) return Response.json({ error: "Chybí ID kampaně." }, { status: 422 });
    const campaignName = str(body.campaignName) || campaignId;
// A pause's blast radius is the campaign's spend; guard it when supplied.
    const spend = Number((body as { amount?: unknown }).amount);
    const breach = guardrail(
      { kind: "pause", fromId: campaignId, fromName: campaignName, toId: "", toName: "", amount: Number.isFinite(spend) ? spend : 0, fromRoas: 0, toRoas: 0, estValueGain: 0 },
      override
    );
    if (breach) return Response.json({ ...breach, requiresOverride: true }, { status: 422 });
    const result = await applyPause(userId, tenant, campaignId, campaignName);
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
const fromName = str(body.fromName) || fromId;
    const toName = str(body.toName) || toId;
    const breach = guardrail(
      { kind: "shift", fromId, fromName, toId, toName, amount, fromRoas: 0, toRoas: 0, estValueGain: 0 },
      override
    );
    if (breach) return Response.json({ ...breach, requiresOverride: true }, { status: 422 });
    const result = await applyBudgetShift(userId, tenant, { fromId, fromName, toId, toName, amount });
    return Response.json(result, { status: result.ok ? 200 : 400 });
  }

  return Response.json({ error: "Nepodporovaná akce." }, { status: 400 });
}
