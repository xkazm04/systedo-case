/** Ad-ops control plane for the signed-in user's tenant:
 *   GET  → recent change-sets (the governance ledger)
 *   POST → {action:"create"}  build + simulate a pending change-set
 *          {action:"approve", id}  apply it through the audited mutation path
 *          {action:"revert", id}   apply the inverse moves, restoring budgets
 *  Live budget mutations require a connected account; on sample data each move
 *  returns a clear non-destructive error but the governance trail is still kept.
 *  Node runtime. */
import { currentUserId } from "@/lib/session";
import {
  resolveTenant,
  resolveCampaignContextForSource,
  resolveProjectTenants,
} from "@/lib/campaigns/connector";
import type { AdsSource } from "@/lib/campaigns/types";
import {
  createChangeSet,
  listChangeSets,
  approveChangeSet,
  revertChangeSet,
} from "@/lib/campaigns/control-plane";
import { GuardrailError, NoSnapshotsError } from "@/lib/campaigns/control-plane-types";
import { getSearchTerms } from "@/lib/campaigns/store";
import { getAlert } from "@/lib/campaigns/alerts";
import { alertCampaignIds } from "@/lib/campaigns/alert-suppression";
import { getCostModel } from "@/lib/cost-model/store";
import { rejectUnknownProject } from "@/lib/projects/api-guard";

/** WP S1 — the WRITABLE networks a change-set may target. `sample` is deliberately
 *  absent: you cannot approve a change-set against demo data. */
const WRITABLE_SOURCES = ["google-ads", "sklik"] as const;

/** Read an optional `source` off the wire. Anything unrecognised (including
 *  "sample") reads as ABSENT, so the request falls back to today's `resolveTenant`
 *  and behaves byte-identically to a request that never mentioned a source — an
 *  unknown source must never silently retarget a write. */
function parseSource(raw: unknown): AdsSource | undefined {
  return typeof raw === "string" && (WRITABLE_SOURCES as readonly string[]).includes(raw)
    ? (raw as AdsSource)
    : undefined;
}

/** ADR-0010 — resolve the tenant a request acts on. With no `source` this is
 *  exactly the call the route always made. With one, it is that network's OWN
 *  tenant ({@link resolveCampaignContextForSource}), which is the same key the sync
 *  writes for it — a union READ is not a union WRITE: a change-set is still created,
 *  approved and reverted against exactly ONE tenant. ADR-0002 holds either way, the
 *  userId comes from the session and never from the body. */
async function tenantFor(
  userId: string,
  projectId: string | undefined,
  source: AdsSource | undefined
): Promise<string> {
  if (!source) return resolveTenant(userId, projectId);
  return (await resolveCampaignContextForSource(userId, projectId, undefined, source)).tenant;
}

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ changeSets: [] });
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId") ?? undefined;
  // Prove the wire projectId before it composes a tenant key — an unverified id
  // mints a fresh empty tenant, which for a governance ledger means an EMPTY
  // ledger, which is exactly the answer you must not give about ad-ops changes.
  const unknown = await rejectUnknownProject(userId, projectId);
  if (unknown) return unknown;
  const source = parseSource(params.get("source"));
  const tenant = await tenantFor(userId, projectId, source);
  // The networks this project could target, so the console can offer a switch
  // instead of guessing. Only emitted when there is a real choice (>1 writable
  // network), so a single-network response is byte-identical to before.
  const writable = (await resolveProjectTenants(userId, projectId))
    .map((t) => t.source)
    .filter((s): s is "google-ads" | "sklik" => s === "google-ads" || s === "sklik");
  // WP S1b — the search-terms panel asks for the stored terms with `?terms=1`. Opt-in
  // rather than always-on: the ledger GET runs on every console render and every
  // network switch, and it must not pay for a document the panel below it may never
  // show. Without the flag the payload is byte-identical to before.
  const terms = params.get("terms") === "1" ? await getSearchTerms(tenant) : null;
  return Response.json({
    changeSets: await listChangeSets(tenant),
    ...(writable.length > 1 ? { sources: writable, source: source ?? writable[0] } : {}),
    ...(terms ? { searchTerms: terms } : {}),
  });
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
    source?: unknown;
    moveSource?: unknown;
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
  const tenant = await tenantFor(userId, projectId, parseSource(body.source));

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
    // WP S1b — which recommender fills the set. Only the literal "terms" switches it;
    // anything else (absent, a typo, a future value) reads as the budget recommender,
    // so an unrecognised value can never silently propose account-changing keyword
    // writes in place of the budget moves the caller asked for.
    if (body.moveSource === "terms") {
      const changeSet = await createChangeSet(tenant, { moveSource: "terms", marginPct });
      if (!changeSet) {
        return Response.json(
          {
            error:
              "Žádné vyhledávací dotazy k řešení — buď účet ještě nebyl synchronizován, nebo žádný dotaz nesplňuje prahy.",
          },
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
