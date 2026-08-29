/** Ad-ops control plane lifecycle: bundle recommended budget moves into a
 *  change-set, simulate the impact, hold for human approval, then apply each move
 *  through the existing audited mutation path — with a one-click revert that
 *  applies the inverse moves. Change-sets live in tenants/{tenant}/changeSets and
 *  form the governance ledger on top of the immutable per-mutation audit
 *  (tenants/{tenant}/mutations). Server-only — pure model lives in
 *  ./control-plane-types. */
import { tenantDocs } from "@/lib/tenant-docs/backend";
import { listCampaigns } from "./store";
import { withMetrics } from "./types";
import { recommendBudgetMoves } from "./budget-moves";
import { simulateBudgetShift } from "./simulate";
import { applyBudgetShift, applyPause, applyResume, restoreBudgets } from "./mutations";
import { recordActivity } from "./activity";
import { resolveAlert } from "./alerts";
import { fmtCZK } from "@/lib/format";
import {
  parseCalibration,
  CALIBRATION_COLLECTION,
  CALIBRATION_DOC_ID,
  CALIBRATION_MIN_SETS,
  type Calibration,
} from "./calibration";
import {
  checkPolicy,
  planApproveClaim,
  planRevertClaim,
  settledApplyStatus,
  settledRevertStatus,
  DEFAULT_POLICY,
  GuardrailError,
  NoSnapshotsError,
  type BudgetSnapshot,
  type ChangeSet,
  type ChangeSetStatus,
  type ControlPolicy,
  type MoveResult,
  type StatusSnapshot,
} from "./control-plane-types";

/** The sub-collection under `tenants/{tenant}` these sets live in — unchanged;
 *  it is now addressed through the generic per-tenant document seam
 *  ({@link tenantDocs}, ADR-0001) instead of `firestore` directly, so the whole
 *  lifecycle also runs on the node:sqlite twin under LOCAL_DB. The Firestore
 *  backend of that seam issues the same paths/queries this module issued before
 *  (`tenants/{tenant}/changeSets`, `orderBy("createdAt","desc").limit(20)`,
 *  `.add`, merge-set), so the production path is unchanged. */
const CHANGE_SETS = "changeSets";

/** The tenant's projection calibration, as persisted by the post-sync realization
 *  pass (./realize-run). Read best-effort at proposal time: a missing doc, an
 *  unreachable store or a malformed payload all read as "no calibration", and the
 *  projection stays exactly the uncalibrated one it has always been. */
async function readCalibration(tenant: string): Promise<Calibration | null> {
  try {
    const data = await (await tenantDocs()).getDoc(tenant, CALIBRATION_COLLECTION, CALIBRATION_DOC_ID);
    return parseCalibration(data);
  } catch (err) {
    console.error(`[control-plane] calibration read failed for ${tenant}:`, err);
    return null;
  }
}

/** Options for building a change-set. */
export interface CreateChangeSetOptions {
  policy?: ControlPolicy;
  /** restrict the moves to act on exactly these campaigns as donors — the
   *  "close the loop" path pre-scopes a change-set to an alert's campaigns so the
   *  operator acts on precisely what was flagged, not the whole portfolio.
   *  Recipients are still drawn from the full portfolio's over-performers. Empty/
   *  omitted → the usual portfolio-wide recommendation. */
  scopeCampaignIds?: string[];
  /** the inbox alert this set is staged from — persisted on the set so applying it
   *  resolves the alert with this set as the back-reference. */
  alertId?: string;
  /** the tenant's blended gross margin (0..1) from its persisted cost model, resolved
   *  by the route (which already holds the projectId) so the recommender chases profit
   *  and the proposal shows the projected-profit line. Absent → margin-blind set. */
  marginPct?: number;
}

/** Build a pending change-set from the current campaigns + recommendation engine,
 *  simulate it, and flag any guardrail breaches. Returns null when there's
 *  nothing worth moving — including a scoped request whose alerted campaigns yield
 *  no sensible move (surfaced honestly rather than inventing one). */
export async function createChangeSet(
  tenant: string,
  opts: CreateChangeSetOptions = {}
): Promise<ChangeSet | null> {
  const policy = opts.policy ?? DEFAULT_POLICY;
  const campaigns = await listCampaigns(tenant);
  if (campaigns.length === 0) return null;
  const rows = campaigns.map(withMetrics);
  // includePauses: zero-return burners enter the SAME governed envelope as budget
  // shifts (simulate → guardrail → approve → revert), instead of only being
  // pausable through the ungoverned BudgetMoves panel. A pause carries its own
  // exact revert via the status snapshot captured at approval.
  // donorScopeIds: when staged from an alert, only the alerted campaigns may be
  // acted on as donors — the recommendation stays honest to what was flagged.
  // marginPct: when the route resolved the tenant's persisted blended margin, the
  // recommender ranks donors by profit destruction (not revenue waste) and every
  // move carries an estProfitGain. Absent → the original margin-blind scoring.
  const { moves } = recommendBudgetMoves(rows, {
    maxMoves: policy.maxMoves,
    includePauses: true,
    donorScopeIds: opts.scopeCampaignIds,
    marginPct: opts.marginPct,
  });
  if (moves.length === 0) return null;

  // WP W2-E: temper the projection with what this tenant's applied change-sets
  // ACTUALLY delivered (median realized/projected, clamped). Below the minimum
  // history the multiplier is exactly 1, so a tenant with no measured sets gets
  // the byte-identical projection it always got. The multiplier is stamped on the
  // doc — never applied silently — so the console can disclose what the number the
  // operator is approving assumed.
  const calibration = await readCalibration(tenant);
  const calibrated = calibration !== null && calibration.n >= CALIBRATION_MIN_SETS;
  const simulation = simulateBudgetShift(
    campaigns,
    moves,
    calibrated ? { gainMultiplier: calibration.multiplier } : {}
  );
  const doc: Omit<ChangeSet, "id"> = {
    createdAt: new Date().toISOString(),
    status: "pending",
    moves,
    simulation,
    policy,
    violations: checkPolicy(moves, policy),
    approvedAt: null,
    revertedAt: null,
    results: null,
    // only persist alertId when set — keep console-proposed sets free of the field.
    ...(opts.alertId ? { alertId: opts.alertId } : {}),
    // persist the scored margin only when profit-aware, so margin-blind sets keep
    // their exact prior shape in Firestore.
    ...(opts.marginPct !== undefined ? { marginPct: opts.marginPct } : {}),
    // Only persisted when it actually shaped the projection, so an uncalibrated
    // set keeps its exact prior shape in the store (and the UI shows no pill).
    ...(calibrated ? { calibration: { multiplier: calibration.multiplier, n: calibration.n } } : {}),
  };
  const id = await (await tenantDocs()).addDoc(tenant, CHANGE_SETS, doc);
  return { id, ...doc };
}

export async function listChangeSets(tenant: string): Promise<ChangeSet[]> {
  try {
    const rows = await (await tenantDocs()).listDocs(tenant, CHANGE_SETS, {
      orderBy: { field: "createdAt", dir: "desc" },
      limit: 20,
    });
    return rows.map((d) => ({ id: d.id, ...(d.data as Omit<ChangeSet, "id">) }));
  } catch (err) {
    console.error(`[control-plane] list failed for ${tenant}:`, err);
    return [];
  }
}

async function getChangeSet(tenant: string, id: string): Promise<ChangeSet | null> {
  const data = await (await tenantDocs()).getDoc(tenant, CHANGE_SETS, id);
  return data ? { id, ...(data as Omit<ChangeSet, "id">) } : null;
}

/** Approve a pending change-set: apply every move through the audited mutation
 *  path (best-effort per move), record the outcome, and log the governance event.
 *  On a sample/non-live tenant the live mutation returns a clear error per move,
 *  but the approval + ledger entry are still recorded.
 *
 *  Guardrails are ENFORCED here: if the change-set has violations and the caller
 *  did not pass `override: true`, it throws {@link GuardrailError} and nothing is
 *  applied. On a successful apply we capture each touched budget's prior value so
 *  a later revert can restore it exactly. */
export async function approveChangeSet(
  tenant: string,
  userId: string,
  id: string,
  opts: { override?: boolean } = {}
): Promise<ChangeSet | null> {
  // Claim the change-set atomically (pending → applying) BEFORE any live mutation,
  // so a concurrent Approve (double-click / retried POST) can't both pass a
  // check-then-act guard and each run the whole apply loop → double-shifting budgets.
  // Only the caller that wins the claim proceeds; the loser sees a non-pending
  // status and returns it unchanged (idempotent). Guardrail violations are checked
  // before the claim is taken, so a claim is never held by a set that would be
  // rejected.
  //
  // Recovery: a set stuck in "applying" past the claim TTL (the previous actor
  // crashed mid-loop) is settled to a terminal state here — NOT re-run, since
  // the forward apply performs relative budget shifts we can't safely repeat.
  // Which terminal state is evidence-based (planApproveClaim): the loop persists
  // snapshots incrementally, so a stranded set carrying snapshots recovers to
  // "applied" (revertable), a snapshot-less one to "failed". The stamp
  // (`claimedAt`) written at claim time makes that distinction time-bounded.
  //
  // Read-then-compare-and-set on the seam: `getDoc` supplies the decision inputs
  // (status, claim stamp, persisted snapshots) and `compareAndSet` takes the claim
  // ONLY while the status is still the one the decision was made on. That is the
  // same one-winner guarantee the read-check-write transaction gave — the Firestore
  // backend of compareAndSet IS a runTransaction guarded on that field — and it is
  // the only shape the sqlite twin can honour too.
  const store = await tenantDocs();
  const now = Date.now();
  const raw = await store.getDoc(tenant, CHANGE_SETS, id);
  if (!raw) return null; // missing → idempotent no-op (was: NotClaimable(null))
  const cur = { id, ...(raw as Omit<ChangeSet, "id">) };
  const action = planApproveClaim(cur, now);
  if (action.kind !== "proceed" && action.kind !== "recover") return cur; // no-op
  if (action.kind === "proceed" && cur.violations.length > 0 && !opts.override) {
    // Guardrails are checked before the claim is taken, so a set that would be
    // rejected never leaves a "applying" stamp behind.
    throw new GuardrailError(cur.violations);
  }
  const won = await store.compareAndSet(
    tenant,
    CHANGE_SETS,
    id,
    { field: "status", equals: cur.status },
    action.kind === "proceed"
      ? { status: "applying" satisfies ChangeSetStatus, claimedAt: new Date(now).toISOString() }
      : { status: action.status satisfies ChangeSetStatus }
  );
  // Lost the claim to a concurrent actor → return the set as it now stands,
  // unchanged (the same idempotent no-op the losing transaction produced).
  if (!won) return await getChangeSet(tenant, id);
  const claim: { recovered: true; cs: ChangeSet } | { recovered: false; cs: ChangeSet } =
    action.kind === "proceed"
      ? { recovered: false as const, cs: cur }
      : { recovered: true as const, cs: { ...cur, status: action.status } };

  if (claim.recovered) {
    // Stranded claim reclaimed to a terminal state; no live mutation to run.
    // The terminal state is evidence-based (planApproveClaim): the crashed loop
    // persisted results + snapshots incrementally, so a set carrying snapshots
    // recovers to "applied" (its landed moves stay revertable), one without
    // recovers to "failed" — with wording that sends the reviewer to the
    // mutation audit rather than asserting the account was never touched.
    const recoveredApplied = claim.cs.status === "applied";
    await recordActivity(tenant, {
      kind: "budget_shift",
      title: recoveredApplied
        ? `Uvíznutý balíček obnoven jako aplikovaný (${claim.cs.moves.length} přesunů)`
        : `Uvíznutý balíček obnoven jako selhaný (${claim.cs.moves.length} přesunů)`,
      detail: recoveredApplied
        ? "Předchozí aplikace se nedokončila v časovém limitu, ale část přesunů prokazatelně proběhla (snímky rozpočtů jsou uloženy). Balíček označen jako aplikovaný a lze jej vrátit."
        : "Předchozí aplikace se nedokončila v časovém limitu a žádný přesun nezanechal snímek. Balíček označen jako selhaný k prověření — skutečný stav účtu ověřte v auditu mutací.",
      actor: "Systém",
      changeSetId: id,
    });
    return claim.cs;
  }

  const cs = claim.cs;
  const results: MoveResult[] = [];
  const budgetSnapshots: BudgetSnapshot[] = [];
  const statusSnapshots: StatusSnapshot[] = [];
  // Persist the per-move evidence INCREMENTALLY (best-effort): a crash later in
  // the loop must not lose the snapshots of moves that already landed on the
  // live account. Recovery (planApproveClaim) reads exactly this evidence to
  // settle a stranded set honestly — "applied" with revertable snapshots when
  // moves landed, "failed" only when nothing left a snapshot. A failed evidence
  // write must not abort the loop; the final settle below re-writes everything.
  const persistEvidence = async () => {
    try {
      await store.setDoc(
        tenant,
        CHANGE_SETS,
        id,
        { results, budgetSnapshots, statusSnapshots },
        { merge: true }
      );
    } catch (err) {
      console.error(`[control-plane] incremental evidence write failed for ${id}:`, err);
    }
  };
  for (const m of cs.moves) {
if (m.kind === "pause") {
      // Pause the zero-return donor; on success snapshot its prior status so the
      // revert resumes exactly what we paused. (Donors are enabled by construction
      // — recommendBudgetMoves only pauses enabled campaigns.)
      const r = await applyPause(userId, tenant, m.fromId, m.fromName);
      results.push({ fromName: m.fromName, toName: m.fromName, ok: r.ok, error: r.error });
      if (r.ok) statusSnapshots.push({ campaignId: m.fromId, campaignName: m.fromName, prevStatus: "enabled" });
      await persistEvidence();
      continue;
    }
    // Audit the move under the same project-scoped tenant this change-set (and its
    // campaigns) live under — control-plane already resolved it.
    const r = await applyBudgetShift(userId, tenant, {
      fromId: m.fromId,
      fromName: m.fromName,
      toId: m.toId,
      toName: m.toName,
      amount: m.amount,
    });
    results.push({ fromName: m.fromName, toName: m.toName, ok: r.ok, error: r.error });
    if (r.ok && r.snapshots) budgetSnapshots.push(...r.snapshots);
    await persistEvidence();
  }

  // Honest terminal status: if EVERY move failed, this set never touched the live
  // account and captured no snapshots — it lands "failed", not a bogus "applied"
  // whose revert would have legacy-inversed moves that never happened. Any move
  // landing → "applied".
  const status = settledApplyStatus(results);
  const applied = status === "applied";
  const updated: Partial<ChangeSet> = {
    status,
    approvedAt: new Date().toISOString(),
    results,
    budgetSnapshots,
    statusSnapshots,
    overridden: cs.violations.length > 0,
  };
  await store.setDoc(tenant, CHANGE_SETS, id, updated, { merge: true });

  // Close the loop: if this set was staged off an alert, mark that alert resolved
  // with this set as the back-reference — but ONLY when the apply actually landed.
  // A fully-failed apply must not report the alerted problem as actioned. Best-
  // effort: a resolution write failing must not undo the budget mutations.
  if (applied && cs.alertId) {
    try {
      await resolveAlert(tenant, cs.alertId, id);
    } catch (err) {
      console.error(`[control-plane] resolve alert ${cs.alertId} failed:`, err);
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  await recordActivity(tenant, {
    kind: "budget_shift",
    title: applied
      ? `Schválen změnový balíček (${cs.moves.length} přesunů)${updated.overridden ? " — přes pojistky" : ""}`
      : `Změnový balíček selhal (${cs.moves.length} přesunů)`,
    detail: applied
      ? `Aplikováno ${okCount}/${cs.moves.length}. Projektovaný dopad ${fmtCZK(
          cs.simulation.after.conversionValue - cs.simulation.before.conversionValue
        )} hodnoty konverzí.${cs.alertId ? " Upozornění uzavřeno." : ""}`
      : `Žádný z ${cs.moves.length} přesunů se neaplikoval — balíček označen jako selhaný, není co vracet.`,
    actor: "Vy",
    changeSetId: id,
    // thread this apply back to the originating alert when there is one.
    ...(cs.alertId ? { alertId: cs.alertId } : {}),
  });

  return { ...cs, ...updated } as ChangeSet;
}

/** Revert an applied change-set. Preferred path: restore each touched budget to
 *  the EXACT prior micros captured at approval (`budgetSnapshots`). Legacy
 *  fallback (change-sets approved before snapshots existed): apply the inverse
 *  moves, which is only an *approximate* restore — and the ledger says so, rather
 *  than overclaiming an exact restoration. */
export async function revertChangeSet(
  tenant: string,
  userId: string,
  id: string
): Promise<ChangeSet | null> {
  // Claim (applied → reverting) atomically so a concurrent Revert can't run the
  // restore twice, mirroring approveChangeSet's claim. A revert with NO restore
  // snapshots is refused (NoSnapshotsError) — never legacy-inverse a set whose
  // forward apply didn't land. A set stranded in "reverting" past the TTL is
  // re-claimed and re-run: the restore is an ABSOLUTE snapshot write (set exact
  // micros / resume), which is idempotent, so repeating it is safe.
  // Same read-then-compare-and-set claim as approveChangeSet — see the comment
  // there for why the guarded write is equivalent to the prior transaction.
  const store = await tenantDocs();
  const now = Date.now();
  const raw = await store.getDoc(tenant, CHANGE_SETS, id);
  if (!raw) return null; // missing → idempotent no-op
  const cs = { id, ...(raw as Omit<ChangeSet, "id">) };
  const action = planRevertClaim(cs, now);
  if (action.kind === "refuse") throw new NoSnapshotsError();
  if (action.kind !== "proceed" && action.kind !== "reclaim") return cs; // no-op
  const won = await store.compareAndSet(
    tenant,
    CHANGE_SETS,
    id,
    { field: "status", equals: cs.status },
    { status: "reverting" satisfies ChangeSetStatus, claimedAt: new Date(now).toISOString() }
  );
  if (!won) return await getChangeSet(tenant, id);

  // Exact revert from snapshots (guaranteed present — the claim refused otherwise):
  // restore every touched budget in one call, and resume every paused campaign.
  // Per-move results map each move to the outcome of the operation that undoes it.
  const hasBudgetSnaps = (cs.budgetSnapshots?.length ?? 0) > 0;
  const budgetResult = hasBudgetSnaps ? await restoreBudgets(userId, tenant, cs.budgetSnapshots!) : null;
  const resumeById = new Map<string, { ok: boolean; error?: string }>();
  for (const s of cs.statusSnapshots ?? []) {
    resumeById.set(s.campaignId, await applyResume(userId, tenant, s.campaignId, s.campaignName));
  }
  const results: MoveResult[] = cs.moves.map((m) => {
    if (m.kind === "pause") {
      const r = resumeById.get(m.fromId);
      return { fromName: m.fromName, toName: m.fromName, ok: r?.ok ?? false, error: r?.error };
    }
    return { fromName: m.fromName, toName: m.toName, ok: budgetResult?.ok ?? true, error: budgetResult?.error };
  });
  const budgetOk = !hasBudgetSnaps || (budgetResult?.ok ?? false);
  const resumeOk = [...resumeById.values()].every((r) => r.ok);
  // Honest settle, mirroring the apply side: "reverted" is written ONLY when the
  // whole restore landed. A (partial) failure returns the set to "applied" so
  // planRevertClaim lets the operator retry — the restore is an idempotent
  // absolute snapshot write, so re-running it is safe, whereas settling
  // "reverted" here would be terminal (planRevertClaim no-ops it) while the live
  // budgets still hold the applied values.
  const status = settledRevertStatus(budgetOk, resumeOk);
  const reverted = status === "reverted";
  const detail = reverted
    ? "Rozpočty obnoveny na přesné hodnoty a pozastavené kampaně znovu spuštěny (ze snímku)."
    : `Obnovení selhalo: ${budgetResult && !budgetResult.ok ? budgetResult.error : "resume kampaně se nezdařilo"}. Balíček zůstává aplikovaný — vrácení lze bezpečně opakovat.`;

  const updated: Partial<ChangeSet> = {
    status,
    results,
    // Stamp revertedAt only when the revert actually landed — a failed restore
    // must not carry a timestamp claiming it happened.
    ...(reverted ? { revertedAt: new Date().toISOString() } : {}),
  };
  await store.setDoc(tenant, CHANGE_SETS, id, updated, { merge: true });

  await recordActivity(tenant, {
    kind: "budget_shift",
    title: reverted
      ? `Vrácen změnový balíček (${cs.moves.length} přesunů)`
      : `Vrácení změnového balíčku selhalo (${cs.moves.length} přesunů)`,
    detail,
    actor: "Vy",
  });

  return { ...cs, ...updated } as ChangeSet;
}
