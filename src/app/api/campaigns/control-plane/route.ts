/** Ad-ops control plane for the signed-in user's tenant:
 *   GET  → recent change-sets (the governance ledger)
 *   POST → {action:"create"}  build + simulate a pending change-set
 *          {action:"approve", id}  apply it through the audited mutation path
 *          {action:"revert", id}   apply the inverse moves, restoring budgets
 *  Live budget mutations require a connected account; on sample data each move
 *  returns a clear non-destructive error but the governance trail is still kept.
 *  Node runtime. */
import { auth } from "@/auth";
import { resolveTenant } from "@/lib/campaigns/connector";
import {
  createChangeSet,
  listChangeSets,
  approveChangeSet,
  revertChangeSet,
} from "@/lib/campaigns/control-plane";
import { GuardrailError } from "@/lib/campaigns/control-plane-types";


async function requireUserId(): Promise<string | null> {
  return (((await auth())?.user as { id?: string } | undefined)?.id) ?? null;
}

export async function GET(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ changeSets: [] });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  const tenant = await resolveTenant(userId, projectId);
  return Response.json({ changeSets: await listChangeSets(tenant) });
}

export async function POST(request: Request) {
  const userId = await requireUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: { action?: unknown; id?: unknown; override?: unknown; projectId?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const action = body.action;
  const id = typeof body.id === "string" ? body.id : "";
  const override = body.override === true;
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const tenant = await resolveTenant(userId, projectId);

  if (action === "create") {
    const changeSet = await createChangeSet(tenant);
    if (!changeSet) {
      return Response.json({ error: "Žádné doporučené přesuny — portfolio je vyvážené." }, { status: 422 });
    }
    return Response.json({ changeSet });
  }

  if (action === "approve") {
    if (!id) return Response.json({ error: "Chybí ID balíčku." }, { status: 422 });
    try {
      const changeSet = await approveChangeSet(tenant, userId, id, { override });
      if (!changeSet) return Response.json({ error: "Balíček nenalezen." }, { status: 404 });
      return Response.json({ changeSet });
    } catch (err) {
      if (err instanceof GuardrailError) {
        return Response.json(
          { error: err.message, violations: err.violations, requiresOverride: true },
          { status: 422 }
        );
      }
      throw err;
    }
  }

  if (action === "revert") {
    if (!id) return Response.json({ error: "Chybí ID balíčku." }, { status: 422 });
    const changeSet = await revertChangeSet(tenant, userId, id);
    if (!changeSet) return Response.json({ error: "Balíček nenalezen." }, { status: 404 });
    return Response.json({ changeSet });
  }

  return Response.json({ error: "Nepodporovaná akce." }, { status: 400 });
}
