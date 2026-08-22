/** Ad-ops control plane for the signed-in user's tenant:
 *   GET  → recent change-sets (the governance ledger)
 *   POST → {action:"create"}  build + simulate a pending change-set
 *          {action:"approve", id}  apply it through the audited mutation path
 *          {action:"revert", id}   apply the inverse moves, restoring budgets
 *  Live budget mutations require a connected account; on sample data each move
 *  returns a clear non-destructive error but the governance trail is still kept.
 *  Node runtime. */
import { currentUserId } from "@/lib/session";
import { resolveTenant } from "@/lib/campaigns/connector";
import {
  createChangeSet,
  listChangeSets,
  approveChangeSet,
  revertChangeSet,
} from "@/lib/campaigns/control-plane";
import { GuardrailError, NoSnapshotsError } from "@/lib/campaigns/control-plane-types";
import { getAlert } from "@/lib/campaigns/alerts";
import { alertCampaignIds } from "@/lib/campaigns/alert-suppression";
import { getCostModel } from "@/lib/cost-model/store";
import { rejectUnknownProject } from "@/lib/projects/api-guard";


export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ changeSets: [] });
  const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
  // Prove the wire projectId before it composes a tenant key — an unverified id
  // mints a fresh empty tenant, which for a governance ledger means an EMPTY
  // ledger, which is exactly the answer you must not give about ad-ops changes.
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId);
  return Response.json({ changeSets: await listChangeSets(tenant) });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Nepřihlášeno." }, { status: 401 });

  let body: {
    action?: unknown;
    id?: unknown;
    override?: unknown;
    projectId?: unknown;
    alertId?: unknown;
    scopeCampaignIds?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Neplatný JSON." }, { status: 400 });
  }
  const action = body.action;
  const id = typeof body.id === "string" ? body.id : "";
  const override = body.override === true;
  const projectId = typeof body.projectId === "string" ? body.projectId : undefined;
  const alertId = typeof body.alertId === "string" ? body.alertId : "";
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const tenant = await resolveTenant(userId, projectId);

  if (action === "create") {
    // Direction 1 — profit-aware money-mover: resolve the project's persisted blended
    // margin here (the route already holds the projectId; createChangeSet takes a
    // tenant) and thread it into every create path. Absent model → margin undefined →
    // the recommender's original revenue-ROAS scoring, unchanged. A store hiccup
    // degrades to margin-blind rather than failing the proposal.
    let marginPct: number | undefined;
    if (projectId) {
      try {
        const costModel = await getCostModel(projectId);
        if (costModel && costModel.grossMarginPct > 0 && costModel.grossMarginPct <= 1) {
          marginPct = costModel.grossMarginPct;
        }
      } catch {
        marginPct = undefined;
      }
    }
    // Close-the-loop path: when an alertId is supplied, pre-scope the change-set to
    // exactly the alerted campaigns and link it back to the alert. Otherwise the
    // usual portfolio-wide proposal.
    if (alertId) {
      const alert = await getAlert(tenant, alertId);
      if (!alert) return Response.json({ error: "Upozornění nenalezeno." }, { status: 404 });
      const scopeCampaignIds = alertCampaignIds(alert);
      if (scopeCampaignIds.length === 0) {
        return Response.json(
          { error: "Upozornění neodkazuje na žádnou kampaň." },
          { status: 422 }
        );
      }
      const changeSet = await createChangeSet(tenant, { scopeCampaignIds, alertId, marginPct });
      if (!changeSet) {
        return Response.json(
          { error: "Pro upozorněné kampaně není žádný smysluplný přesun." },
          { status: 422 }
        );
      }
      return Response.json({ changeSet });
    }
    // Direct campaign scoping (a critical table row without an alert): the body may
    // name the campaigns to act on — createChangeSet already supports the scope, the
    // route just has to read it. Absent/empty → the usual portfolio-wide proposal.
    const scopeCampaignIds = Array.isArray(body.scopeCampaignIds)
      ? (body.scopeCampaignIds as unknown[])
          .filter((v): v is string => typeof v === "string" && v.length > 0)
          .slice(0, 50)
      : [];
    const changeSet = await createChangeSet(
      tenant,
      scopeCampaignIds.length > 0 ? { scopeCampaignIds, marginPct } : { marginPct }
    );
    if (!changeSet) {
      return Response.json(
        scopeCampaignIds.length > 0
          ? { error: "Pro vybrané kampaně není žádný smysluplný přesun." }
          : { error: "Žádné doporučené přesuny — portfolio je vyvážené." },
        { status: 422 }
      );
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
    try {
      const changeSet = await revertChangeSet(tenant, userId, id);
      if (!changeSet) return Response.json({ error: "Balíček nenalezen." }, { status: 404 });
      return Response.json({ changeSet });
    } catch (err) {
      // A set whose forward apply never landed has no snapshot to restore — the
      // revert is refused rather than legacy-inversing moves that never happened.
      if (err instanceof NoSnapshotsError) {
        return Response.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }
  }

  return Response.json({ error: "Nepodporovaná akce." }, { status: 400 });
}
