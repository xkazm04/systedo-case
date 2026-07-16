/** Ad-ops control plane — pure model + policy (no React, no I/O), shared by the
 *  server lifecycle and the client console. A change-set bundles recommended
 *  budget moves into one reviewable, simulated, human-approved unit with a
 *  reversible ledger entry — the governance envelope that lets software touch
 *  real ad spend safely. */
import type { BudgetMove, SimulationResult } from "./simulate";
import { grossProfit } from "@/lib/profit/core";

/** Guardrails applied to a change-set. Enforced at approval: a change-set that
 *  breaches a guardrail cannot be applied without an explicit human override
 *  (see {@link GuardrailError}). Surfaced before approval too. */
export interface ControlPolicy {
  /** max CZK a single move may shift over the synced period */
  maxMoveAmountCzk: number;
  /** max number of moves in one change-set (blast-radius cap) */
  maxMoves: number;
}

export const DEFAULT_POLICY: ControlPolicy = { maxMoveAmountCzk: 50_000, maxMoves: 3 };

/** Thrown when a change-set with guardrail violations is approved without an
 *  explicit override — this is what makes the guardrails blocking, not merely
 *  advisory. The route turns it into a 422 carrying the violations. */
export class GuardrailError extends Error {
  readonly violations: string[];
  constructor(violations: string[]) {
    super("Změnový balíček porušuje pojistky a vyžaduje výslovný souhlas.");
    this.name = "GuardrailError";
    this.violations = violations;
  }
}

/** Thrown when a revert is requested for a change-set that carries NO restore
 *  snapshots — i.e. one whose forward apply never landed a move (all-failed, or a
 *  set recovered from a stranded claim). Reverting such a set used to fall back to
 *  applying REAL inverse budget shifts for moves that never happened; that is now
 *  refused outright. The route turns it into a 422. */
export class NoSnapshotsError extends Error {
  constructor() {
    super("Balíček nemá co vrátit — žádný přesun se neaplikoval, takže neexistuje snímek k obnovení.");
    this.name = "NoSnapshotsError";
  }
}

/** Snapshot of a campaign budget's value *before* a change-set was applied, so a
 *  revert can restore the EXACT prior micros rather than an approximate inverse
 *  shift (which re-reads current budgets and re-floors the donor). */
export interface BudgetSnapshot {
  budgetResourceName: string;
  prevMicros: number;
}

/** Snapshot of a campaign's status *before* a change-set paused it, so a revert
 *  can resume it to exactly its prior state. Captured at approval for every pause
 *  move that actually landed on the live account. */
export interface StatusSnapshot {
  campaignId: string;
  campaignName: string;
  /** the status the campaign held before the change-set paused it (always
   *  "enabled" today — pause moves only target enabled donors) */
  prevStatus: "enabled" | "paused";
}

// "applying"/"reverting" are transient claim states: approveChangeSet/revertChangeSet
// flip into them atomically before running the live mutation loop, so a concurrent
// Approve/Revert (double-click, retry) can't run the loop twice. They settle to
// "applied"/"reverted" when the loop finishes. "failed" is a terminal honest state:
// an apply whose every move failed lands here (never a snapshot-less "applied"), and
// a stale/stranded "applying" set is recovered here by the next actor ONLY when it
// carries no restore snapshots — the apply loop persists snapshots incrementally, so
// a stranded set WITH snapshots demonstrably landed moves and recovers to "applied"
// (revertable) instead. "failed" therefore means "no move left evidence of landing",
// not a hard guarantee the account was untouched — the mutation audit is the ledger
// to double-check.
export type ChangeSetStatus = "pending" | "applying" | "applied" | "reverting" | "reverted" | "failed";

/** How long a transient claim ("applying"/"reverting") may sit before the next
 *  actor may treat it as stranded (the claimer crashed mid-loop) and recover it.
 *  Stamped as `claimedAt` when the claim is taken, so recovery is time-bounded
 *  rather than "forever stuck". 10 minutes — comfortably longer than any real
 *  mutation loop, short enough that an operator isn't blocked for long. */
export const CLAIM_TTL_MS = 10 * 60 * 1000;

/** Outcome of applying one move to the live account (best-effort per move). */
export interface MoveResult {
  fromName: string;
  toName: string;
  ok: boolean;
  error?: string;
}

export interface ChangeSet {
  id: string;
  createdAt: string;
  status: ChangeSetStatus;
  moves: BudgetMove[];
  simulation: SimulationResult;
  policy: ControlPolicy;
  /** advisory guardrail breaches at creation time */
  violations: string[];
  approvedAt: string | null;
  revertedAt: string | null;
  /** per-move apply results once approved */
  results: MoveResult[] | null;
  /** prior budget values captured at approval, for an exact revert (live only) */
  budgetSnapshots?: BudgetSnapshot[];
  /** prior campaign statuses captured at approval for every pause move that
   *  landed, so a revert resumes exactly what it paused (live only) */
  statusSnapshots?: StatusSnapshot[];
  /** true if applied despite guardrail violations via an explicit override */
  overridden?: boolean;
  /** ISO timestamp the current transient claim ("applying"/"reverting") was taken,
   *  stamped inside the claim transaction. Lets the next actor tell a genuinely
   *  in-progress loop from a stranded one (claimer crashed) via {@link isStaleClaim}.
   *  Absent on sets that were never claimed, or claimed before this field existed
   *  (a legacy transient with no stamp is treated as stale → recoverable). */
  claimedAt?: string;
  /** the inbox alert this change-set was staged from (one-click "close the loop"
   *  action). Set at creation when the set is pre-scoped to an alert's campaigns;
   *  on apply the alert is marked resolved with this set's id as its back-reference,
   *  so the activity thread reads alert → change-set → apply. Absent for change-sets
   *  proposed straight from the console. */
  alertId?: string;
  /** the tenant's blended gross margin (0..1) the recommender scored against, when
   *  a persisted cost model was threaded in. Drives the projected-PROFIT line on the
   *  proposal (alongside the projected value). Absent → margin-blind set, value only. */
  marginPct?: number;
}

/** Guardrail check — returns human-readable breaches, never throws. Enforced by
 *  the approval lifecycle (a non-empty result blocks apply unless overridden). */
export function checkPolicy(moves: BudgetMove[], policy: ControlPolicy): string[] {
  const v: string[] = [];
  if (moves.length > policy.maxMoves) {
    v.push(`Počet přesunů (${moves.length}) překračuje limit ${policy.maxMoves}.`);
  }
  for (const m of moves) {
    if (m.amount > policy.maxMoveAmountCzk) {
      v.push(
        m.kind === "pause"
          ? `Pozastavení ${m.fromName} (${Math.round(m.amount)} Kč útraty) překračuje limit ${policy.maxMoveAmountCzk} Kč.`
          : `Přesun ${m.fromName} → ${m.toName} (${Math.round(m.amount)} Kč) překračuje limit ${policy.maxMoveAmountCzk} Kč.`
      );
    }
  }
  return v;
}

/** The reverse of each move (recipient → donor), for one-click revert. */
export function inverseMoves(moves: BudgetMove[]): BudgetMove[] {
  return moves.map((m) => ({
    fromId: m.toId,
    fromName: m.toName,
    toId: m.fromId,
    toName: m.fromName,
    amount: m.amount,
    fromRoas: m.toRoas,
    toRoas: m.fromRoas,
    estValueGain: -m.estValueGain,
    // Mirror the profit delta's sign only when the forward move carried one, so a
    // margin-blind set's inverse stays byte-identical (no estProfitGain field).
    ...(m.estProfitGain !== undefined ? { estProfitGain: -m.estProfitGain } : {}),
  }));
}

/** Whether a change-set's forward projection is still a LIVE prediction. The
 *  simulation is a "what would happen IF this is applied" forward projection — it
 *  is meaningful only before the set settles. Once it is applied the number is
 *  history; once it is REVERTED it describes a future that was undone and never
 *  happened, so surfacing it as a current projection would mislead. Surfaces gate
 *  the projection on this, and restate it as historical (or drop it) otherwise —
 *  a reverted change-set must never show its stale forward projection. */
export function forwardProjectionApplies(status: ChangeSetStatus): boolean {
  return status === "pending" || status === "applying";
}

/** Projected extra conversion value if the change-set is applied (CZK). */
export function projectedValueGain(sim: SimulationResult): number {
  return sim.after.conversionValue - sim.before.conversionValue;
}

// --- transient-claim recovery + settle policy (pure, fixture-tested) ----------

/** Whether a transient claim taken at `claimedAt` is old enough to be treated as
 *  STRANDED (the actor that claimed it crashed before settling it). A missing or
 *  unparseable stamp counts as stale — a claim we can't date is one we must be
 *  able to recover, never one that blocks forever. */
export function isStaleClaim(claimedAt: string | undefined, now: number, ttlMs = CLAIM_TTL_MS): boolean {
  if (!claimedAt) return true;
  const at = Date.parse(claimedAt);
  if (Number.isNaN(at)) return true;
  return now - at >= ttlMs;
}

/** The honest terminal status for an apply that has finished its move loop: a set
 *  where EVERY move failed lands `failed` (no snapshots were captured, so it must
 *  never masquerade as `applied` and offer a bogus revert); any move landing → the
 *  set is `applied`. An empty result list (never happens — a set always has ≥1
 *  move) settles `applied` for safety. */
export function settledApplyStatus(results: MoveResult[]): "applied" | "failed" {
  return results.length > 0 && results.every((r) => !r.ok) ? "failed" : "applied";
}

/** The honest terminal status for a revert that has finished its restore loop:
 *  it settles `reverted` ONLY when the whole restore landed (the budget snapshot
 *  write succeeded and every paused campaign resumed). Any failure keeps the set
 *  `applied`, so {@link planRevertClaim} lets the operator RETRY — the restore is
 *  an ABSOLUTE snapshot write (idempotent), so the one state where a retry is
 *  needed is exactly the one where it is safe. Mirrors {@link settledApplyStatus}
 *  on the apply side: never write a terminal status the live account contradicts. */
export function settledRevertStatus(budgetOk: boolean, resumeOk: boolean): "reverted" | "applied" {
  return budgetOk && resumeOk ? "reverted" : "applied";
}

/** Whether a change-set carries at least one restore snapshot (budget or status) —
 *  i.e. at least one forward move actually landed, so a revert has something exact
 *  to restore. The sole gate for allowing a revert. */
export function hasRestoreSnapshots(cs: Pick<ChangeSet, "budgetSnapshots" | "statusSnapshots">): boolean {
  return (cs.budgetSnapshots?.length ?? 0) > 0 || (cs.statusSnapshots?.length ?? 0) > 0;
}

/** What an actor should do with a change-set when trying to claim it:
 *   - `proceed`  — claim the source state → transient, then run the live loop;
 *   - `recover`  — a stranded transient: write the given terminal status, no loop;
 *   - `reclaim`  — re-claim a stranded transient and re-run the (idempotent) loop;
 *   - `refuse`   — a revert with nothing to restore (no snapshots) → reject;
 *   - `noop`     — nothing to do, return the set unchanged (idempotent). */
export type ClaimAction =
  | { kind: "proceed" }
  | { kind: "recover"; status: ChangeSetStatus }
  | { kind: "reclaim" }
  | { kind: "refuse" }
  | { kind: "noop" };

/** Decide how to claim a set for APPROVE. Only a `pending` set proceeds to the
 *  apply loop. A stranded `applying` set (claim older than the TTL) is recovered
 *  to a terminal state — we deliberately do NOT re-run the loop, because the
 *  forward apply performs RELATIVE budget shifts (not idempotent). WHICH terminal
 *  state depends on the evidence the crashed loop left behind: the apply loop
 *  persists each move's result + snapshots incrementally, so a stranded set that
 *  CARRIES restore snapshots demonstrably landed moves on the live account — it
 *  recovers to `applied` (revertable through those snapshots), never to a
 *  `failed` that denies money actually moved. Only a snapshot-less stranded set
 *  recovers to `failed` (no evidence any move landed; the mutation audit is the
 *  place to double-check). Everything else is a no-op. */
export function planApproveClaim(
  cs: Pick<ChangeSet, "status" | "claimedAt" | "budgetSnapshots" | "statusSnapshots">,
  now: number,
  ttlMs = CLAIM_TTL_MS
): ClaimAction {
  if (cs.status === "pending") return { kind: "proceed" };
  if (cs.status === "applying" && isStaleClaim(cs.claimedAt, now, ttlMs)) {
    return { kind: "recover", status: hasRestoreSnapshots(cs) ? "applied" : "failed" };
  }
  return { kind: "noop" };
}

/** Decide how to claim a set for REVERT. An `applied` set proceeds only when it
 *  has restore snapshots, otherwise the revert is refused (never legacy-inverse a
 *  set whose forward apply didn't land). A stranded `reverting` set is re-claimed
 *  and its loop re-run — safe because the restore is an ABSOLUTE snapshot write
 *  (set exact micros / resume), which is idempotent. Everything else is a no-op. */
export function planRevertClaim(
  cs: Pick<ChangeSet, "status" | "claimedAt" | "budgetSnapshots" | "statusSnapshots">,
  now: number,
  ttlMs = CLAIM_TTL_MS
): ClaimAction {
  if (cs.status === "applied") {
    return hasRestoreSnapshots(cs) ? { kind: "proceed" } : { kind: "refuse" };
  }
  if (cs.status === "reverting" && isStaleClaim(cs.claimedAt, now, ttlMs)) {
    return { kind: "reclaim" };
  }
  return { kind: "noop" };
}

/** Projected extra NET PROFIT if the change-set is applied (CZK) = gross profit on
 *  the projected value gain under the tenant's blended margin. Derived from the
 *  unchanged value simulation (not a re-modelled profit run), so it reconciles with
 *  the value line by construction. Undefined when the set carried no margin. */
export function projectedProfitGain(sim: SimulationResult, marginPct?: number): number | undefined {
  return marginPct === undefined ? undefined : grossProfit(projectedValueGain(sim), marginPct);
}
