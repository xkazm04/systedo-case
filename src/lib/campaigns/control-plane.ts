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
import { applyBudgetShift, restoreBudgets } from "./mutations";
import { recordActivity } from "./activity";
import { fmtCZK } from "@/lib/format";
import {
  checkPolicy,
  inverseMoves,
  DEFAULT_POLICY,
  GuardrailError,
  type BudgetSnapshot,
  type ChangeSet,
  type ControlPolicy,
  type MoveResult,
} from "./control-plane-types";

function changeSetsCol(tenant: string) {
  return firestore.collection("tenants").doc(tenant).collection("changeSets");
}

/** Build a pending change-set from the current campaigns + recommendation engine,
 *  simulate it, and flag any guardrail breaches. Returns null when there's
 *  nothing worth moving. */
export async function createChangeSet(
  tenant: string,
  policy: ControlPolicy = DEFAULT_POLICY
): Promise<ChangeSet | null> {
  const campaigns = await listCampaigns(tenant);
  if (campaigns.length === 0) return null;
  const rows = campaigns.map(withMetrics);
  const { moves } = recommendBudgetMoves(rows, { maxMoves: policy.maxMoves });
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
  const cs = await getChangeSet(tenant, id);
  if (!cs || cs.status !== "pending") return cs;

  if (cs.violations.length > 0 && !opts.override) {
    throw new GuardrailError(cs.violations);
  }

  const results: MoveResult[] = [];
  const budgetSnapshots: BudgetSnapshot[] = [];
  for (const m of cs.moves) {
    const r = await applyBudgetShift(userId, {
      fromId: m.fromId,
      fromName: m.fromName,
      toId: m.toId,
      toName: m.toName,
      amount: m.amount,
    });
    results.push({ fromName: m.fromName, toName: m.toName, ok: r.ok, error: r.error });
    if (r.ok && r.snapshots) budgetSnapshots.push(...r.snapshots);
  }

  const updated: Partial<ChangeSet> = {
    status: "applied",
    approvedAt: new Date().toISOString(),
    results,
    budgetSnapshots,
    overridden: cs.violations.length > 0,
  };
  await changeSetsCol(tenant).doc(id).set(updated, { merge: true });

  const okCount = results.filter((r) => r.ok).length;
  await recordActivity(tenant, {
    kind: "budget_shift",
    title: `Schválen změnový balíček (${cs.moves.length} přesunů)${
      updated.overridden ? " — přes pojistky" : ""
    }`,
    detail: `Aplikováno ${okCount}/${cs.moves.length}. Projektovaný dopad ${fmtCZK(
      cs.simulation.after.conversionValue - cs.simulation.before.conversionValue
    )} hodnoty konverzí.`,
    actor: "Vy",
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
  const cs = await getChangeSet(tenant, id);
  if (!cs || cs.status !== "applied") return cs;

  const hasSnapshots = (cs.budgetSnapshots?.length ?? 0) > 0;
  let results: MoveResult[];
  let detail: string;

  if (hasSnapshots) {
    const r = await restoreBudgets(userId, cs.budgetSnapshots!);
    results = cs.moves.map((m) => ({ fromName: m.fromName, toName: m.toName, ok: r.ok, error: r.error }));
    detail = r.ok
      ? "Rozpočty obnoveny na přesné hodnoty před aplikací (ze snímku)."
      : `Obnovení selhalo: ${r.error ?? "neznámá chyba"}.`;
  } else {
    results = [];
    for (const m of inverseMoves(cs.moves)) {
      const r = await applyBudgetShift(userId, {
        fromId: m.fromId,
        fromName: m.fromName,
        toId: m.toId,
        toName: m.toName,
        amount: m.amount,
      });
      results.push({ fromName: m.fromName, toName: m.toName, ok: r.ok, error: r.error });
    }
    detail = "Přesuny vráceny inverzně (přibližná obnova — bez snímku původních rozpočtů).";
  }

  const updated: Partial<ChangeSet> = { status: "reverted", revertedAt: new Date().toISOString(), results };
  await changeSetsCol(tenant).doc(id).set(updated, { merge: true });

  await recordActivity(tenant, {
    kind: "budget_shift",
    title: `Vrácen změnový balíček (${cs.moves.length} přesunů)`,
    detail,
    actor: "Vy",
  });

  return { ...cs, ...updated } as ChangeSet;
}
