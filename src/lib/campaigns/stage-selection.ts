/** Campaign table → ONE scoped change-set: which ticked rows an action receives,
 *  which network they belong to, and whether they may be previewed and staged.
 *
 *  Pure and client-safe (types-only imports): the table's SelectionBar reads it on
 *  every render, and the rules below are the ones an operator acts on, so they are
 *  assertable without React (test-unit/campaigns-stage-selection.test.mjs).
 *
 *  - The raw selection is record-keyed and never pruned by a filter. The plan
 *    intersects it with the rows the filter shows, so the count beside the button
 *    names every row the action receives, and the ticks behind the filter are
 *    reported as `hiddenCount` rather than silently sent or silently dropped.
 *  - One change-set is one network (ADR-0010: a union read is not a union write),
 *    so a selection spanning networks cannot even preview.
 *  - Sklik rows preview, which is a read, but never stage: the Sklik write path is
 *    gated by `SKLIK_WRITES_ENABLED` and this surface does not stage toward it.
 *  - Sample rows never stage: a change-set built from demo rows is not a proposal. */
import type { ChangeSet } from "./control-plane-types";
import type { AdsSource } from "./types";

/** A row as the plan needs it — the table's campaigns satisfy this structurally. */
export interface StageRow {
  id: string;
  source?: AdsSource;
}

/** Why a selection cannot be previewed or staged; `null` when it can be staged. */
export type StageBlockReason = "empty" | "mixed-network" | "sample" | "read-only-network";

export interface StagePlan {
  /** the selected rows the active filter shows, in table order: what the action receives */
  payloadIds: string[];
  /** selected rows that exist but sit behind the active filter (counted, not sent) */
  hiddenCount: number;
  /** the payload's single network; `null` when mixed, empty or unstamped */
  network: AdsSource | null;
  canPreview: boolean;
  canStage: boolean;
  reason: StageBlockReason | null;
}

type IdSet = ReadonlySet<string> | readonly string[];
const asSet = (ids: IdSet): ReadonlySet<string> => (ids instanceof Set ? ids : new Set(ids as readonly string[]));

const ADS_SOURCES: readonly string[] = ["sample", "google-ads", "sklik"] satisfies AdsSource[];

/** Plan the action a selection triggers. `fallbackSource` is the tenant's own
 *  `SyncMeta.source` (a free string on the wire; anything unrecognised reads as
 *  absent), applied to rows that carry no row-level stamp. */
export function planStageSelection(
  rows: readonly StageRow[],
  selected: IdSet,
  visibleIds: IdSet,
  opts: { fallbackSource?: string } = {}
): StagePlan {
  const fallback = ADS_SOURCES.includes(opts.fallbackSource ?? "") ? (opts.fallbackSource as AdsSource) : undefined;
  const sel = asSet(selected);
  const visible = asSet(visibleIds);
  const payload: StageRow[] = [];
  let hiddenCount = 0;
  for (const r of rows) {
    if (!sel.has(r.id)) continue;
    if (visible.has(r.id)) payload.push(r);
    else hiddenCount++;
  }
  const payloadIds = payload.map((r) => r.id);
  const block = (reason: StageBlockReason, network: AdsSource | null, canPreview: boolean): StagePlan => ({
    payloadIds,
    hiddenCount,
    network,
    canPreview,
    canStage: false,
    reason,
  });
  if (payload.length === 0) return block("empty", null, false);

  const networks = new Set(payload.map((r) => r.source ?? fallback));
  if (networks.size > 1) return block("mixed-network", null, false);
  const network = [...networks][0] ?? null;
  if (network === "sample") return block("sample", network, true);
  if (network === "sklik") return block("read-only-network", network, true);
  return { payloadIds, hiddenCount, network, canPreview: true, canStage: true, reason: null };
}

/** What a preview returns: the change-set that WOULD be staged, minus its ledger
 *  fields, plus the `basis` (the `SyncMeta.syncedAt` it was built on) a stage must
 *  present so a sync landing in between is refused rather than staged over. */
export type ChangeSetPreview = Pick<
  ChangeSet,
  "moves" | "simulation" | "policy" | "violations" | "marginPct" | "calibration"
> & { basis: string | null };

export interface StageRequestContext {
  projectId?: string;
  /** campaign id → a stageable critical alert naming it (CampaignsClient derives it) */
  alertByCampaign: ReadonlyMap<string, string>;
  /** the previewed basis; sent on `create` only */
  basis?: string | null;
}

/** The control-plane POST body for a plan. Preview and stage build it from the SAME
 *  plan, so they ask for the same scope and the staged set is the previewed one.
 *
 *  A one-row selection whose campaign has its own alert keeps the alert-scoped path
 *  the per-row button used, so applying the set still resolves that alert. A Sklik
 *  preview names its network so it reads the Sklik tenant; every other request
 *  omits `source`, which resolves the tenant exactly as the per-row stage did. */
export function stageRequestBody(
  plan: StagePlan,
  action: "preview" | "create",
  ctx: StageRequestContext
): Record<string, unknown> {
  const alertId = plan.payloadIds.length === 1 ? ctx.alertByCampaign.get(plan.payloadIds[0]!) : undefined;
  return {
    action,
    ...(alertId ? { alertId } : { scopeCampaignIds: plan.payloadIds }),
    projectId: ctx.projectId,
    ...(plan.network === "sklik" ? { source: "sklik" } : {}),
    ...(action === "create" && ctx.basis !== undefined ? { basis: ctx.basis } : {}),
  };
}
