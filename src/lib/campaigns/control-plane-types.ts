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
// "applied"/"reverted" when the loop finishes.
export type ChangeSetStatus = "pending" | "applying" | "applied" | "reverting" | "reverted";

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

/** Projected extra NET PROFIT if the change-set is applied (CZK) = gross profit on
 *  the projected value gain under the tenant's blended margin. Derived from the
 *  unchanged value simulation (not a re-modelled profit run), so it reconciles with
 *  the value line by construction. Undefined when the set carried no margin. */
export function projectedProfitGain(sim: SimulationResult, marginPct?: number): number | undefined {
  return marginPct === undefined ? undefined : grossProfit(projectedValueGain(sim), marginPct);
}
