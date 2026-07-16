/** Ad-ops control plane lifecycle: bundle recommended budget moves into a
 *  change-set, simulate the impact, hold for human approval, then apply each move
 *  through the existing audited mutation path — with a one-click revert that
 *  applies the inverse moves. Change-sets live in tenants/{tenant}/changeSets and
 *  form the governance ledger on top of the immutable per-mutation audit
 *  (tenants/{tenant}/mutations). Server-only — pure model lives in
 *  ./control-plane-types. */
import { firestore } from "@/lib/firebase";
import { listCampaigns } from "./store";
import { withMetrics } from "./types";
import { recommendBudgetMoves } from "./budget-moves";
import { simulateBudgetShift } from "./simulate";
import { applyBudgetShift, applyPause, applyResume, restoreBudgets } from "./mutations";
import { recordActivity } from "./activity";
import { resolveAlert } from "./alerts";
import { fmtCZK } from "@/lib/format";
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

function changeSetsCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("changeSets");
}

/** Thrown inside the approve/revert claim transaction when the set can't be claimed
 *  (missing, or not in the required source status) — carries the current change-set
 *  so the caller returns it unchanged instead of a hard error (idempotent no-op). */
class NotClaimable extends Error {
  constructor(readonly cs: ChangeSet | null) {
    super("change-set not claimable");
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

  const simulation = simulateBudgetShift(campaigns, moves);
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
  };
  const ref = await changeSetsCol(tenant).add(doc);
  return { id: ref.id, ...doc };
}

export async function listChangeSets(tenant: string): Promise<ChangeSet[]> {
  try {
    const snap = await changeSetsCol(tenant).orderBy("createdAt", "desc").limit(20).get();
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChangeSet, "id">) }));
  } catch (err) {
    console.error(`[control-plane] list failed for ${tenant}:`, err);
    return [];
  }
}

async function getChangeSet(tenant: string, id: string): Promise<ChangeSet | null> {
  const snap = await changeSetsCol(tenant).doc(id).get();
  return snap.exists ? { id, ...(snap.data() as Omit<ChangeSet, "id">) } : null;
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
  // Only the caller that wins the transaction proceeds; the loser sees a non-pending
  // status and returns it unchanged (idempotent). Guardrail violations are checked
  // inside the txn so a claim is never taken for a set that would be rejected.
  //
  // Recovery: a set stuck in "applying" past the claim TTL (the previous actor
  // crashed mid-loop) is settled to a terminal "failed" here — NOT re-run, since
  // the forward apply performs relative budget shifts we can't safely repeat. The
  // stamp (`claimedAt`) written at claim time makes that distinction time-bounded.
  const ref = changeSetsCol(tenant).doc(id);
  const now = Date.now();
  let claim: { recovered: true; cs: ChangeSet } | { recovered: false; cs: ChangeSet };
  try {
    claim = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotClaimable(null);
      const cur = { id, ...(snap.data() as Omit<ChangeSet, "id">) };
      const action = planApproveClaim(cur, now);
      if (action.kind === "proceed") {
        if (cur.violations.length > 0 && !opts.override) throw new GuardrailError(cur.violations);
        tx.set(
          ref,
          { status: "applying" satisfies ChangeSetStatus, claimedAt: new Date(now).toISOString() },
          { merge: true }
        );
        return { recovered: false as const, cs: cur };
      }
      if (action.kind === "recover") {
        tx.set(ref, { status: action.status satisfies ChangeSetStatus }, { merge: true });
        return { recovered: true as const, cs: { ...cur, status: action.status } };
      }
      throw new NotClaimable(cur); // not claimable → idempotent no-op
    });
  } catch (err) {
    if (err instanceof NotClaimable) return err.cs;
    throw err; // GuardrailError (and any real error) propagates unchanged
  }

  if (claim.recovered) {
    // Stranded claim reclaimed to a terminal state; no live mutation to run.
    await recordActivity(tenant, {
      kind: "budget_shift",
      title: `Uvíznutý balíček obnoven jako selhaný (${claim.cs.moves.length} přesunů)`,
      detail: "Předchozí aplikace se nedokončila v časovém limitu; balíček označen jako selhaný k prověření.",
      actor: "Systém",
      changeSetId: id,
    });
    return claim.cs;
  }

  const cs = claim.cs;
  const results: MoveResult[] = [];
  const budgetSnapshots: BudgetSnapshot[] = [];
  const statusSnapshots: StatusSnapshot[] = [];
  for (const m of cs.moves) {
if (m.kind === "pause") {
      // Pause the zero-return donor; on success snapshot its prior status so the
      // revert resumes exactly what we paused. (Donors are enabled by construction
      // — recommendBudgetMoves only pauses enabled campaigns.)
      const r = await applyPause(userId, tenant, m.fromId, m.fromName);
      results.push({ fromName: m.fromName, toName: m.fromName, ok: r.ok, error: r.error });
      if (r.ok) statusSnapshots.push({ campaignId: m.fromId, campaignName: m.fromName, prevStatus: "enabled" });
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
  await changeSetsCol(tenant).doc(id).set(updated, { merge: true });

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
  const ref = changeSetsCol(tenant).doc(id);
  const now = Date.now();
  let cs: ChangeSet;
  try {
    cs = await firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new NotClaimable(null);
      const cur = { id, ...(snap.data() as Omit<ChangeSet, "id">) };
      const action = planRevertClaim(cur, now);
      if (action.kind === "proceed" || action.kind === "reclaim") {
        tx.set(
          ref,
          { status: "reverting" satisfies ChangeSetStatus, claimedAt: new Date(now).toISOString() },
          { merge: true }
        );
        return cur;
      }
      if (action.kind === "refuse") throw new NoSnapshotsError();
      throw new NotClaimable(cur);
    });
  } catch (err) {
    if (err instanceof NotClaimable) return err.cs;
    throw err; // NoSnapshotsError (and any real error) propagates unchanged
  }

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
  await changeSetsCol(tenant).doc(id).set(updated, { merge: true });

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
