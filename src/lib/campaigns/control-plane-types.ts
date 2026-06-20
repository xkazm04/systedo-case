/** Ad-ops control plane — pure model + policy (no React, no I/O), shared by the
 *  server lifecycle and the client console. A change-set bundles recommended
 *  budget moves into one reviewable, simulated, human-approved unit with a
 *  reversible ledger entry — the governance envelope that lets software touch
 *  real ad spend safely. */
import type { BudgetMove, SimulationResult } from "./simulate";

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

export type ChangeSetStatus = "pending" | "applied" | "reverted";

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
  /** true if applied despite guardrail violations via an explicit override */
  overridden?: boolean;
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
        `Přesun ${m.fromName} → ${m.toName} (${Math.round(m.amount)} Kč) překračuje limit ${policy.maxMoveAmountCzk} Kč.`
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
  }));
}

/** Projected extra conversion value if the change-set is applied (CZK). */
export function projectedValueGain(sim: SimulationResult): number {
  return sim.after.conversionValue - sim.before.conversionValue;
}
