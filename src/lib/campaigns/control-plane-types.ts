/** Ad-ops control plane — pure model + policy (no React, no I/O), shared by the
 *  server lifecycle and the client console. A change-set bundles recommended
 *  budget moves into one reviewable, simulated, human-approved unit with a
 *  reversible ledger entry — the governance envelope that lets software touch
 *  real ad spend safely. */
import type { BudgetMove, SimulationResult } from "./simulate";
import type { AdsSource } from "./types";
import { grossProfit } from "@/lib/profit/core";

/** Guardrails applied to a change-set. Enforced at approval: a change-set that
 *  breaches a guardrail cannot be applied without an explicit human override
 *  (see {@link GuardrailError}). Surfaced before approval too. */
export interface ControlPolicy {
  /** max CZK a single move may shift over the synced period */
  maxMoveAmountCzk: number;
  /** max number of moves in one change-set (blast-radius cap) */
  maxMoves: number;
  /** WP S1 — allow a move whose donor and recipient sit on DIFFERENT ad networks
   *  (Google ↔ Sklik). Off by default (absent = off): money taken out of one
   *  network's account cannot land in another's, so a cross-network "shift" is two
   *  unrelated writes wearing one move's clothes — the donor is throttled for a
   *  recipient that never receives. Future-proofing only: `createChangeSet` is
   *  single-tenant (one network per set), so as of S1 no recommender can EMIT such a
   *  move; the guardrail exists so it is refused by construction the day union
   *  (project-level) change-sets arrive, rather than being remembered then. */
  crossSource?: boolean;
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

/** Snapshot of a GOOGLE ADS campaign budget's value *before* a change-set was
 *  applied, so a revert can restore the EXACT prior micros rather than an
 *  approximate inverse shift (which re-reads current budgets and re-floors the
 *  donor).
 *
 *  `platform` is OPTIONAL and, for Google, is never written: every blob this app
 *  has ever persisted for Google omits it, and continuing to omit it is what makes
 *  a WP S1 rollback safe — an older `restoreBudgets` reads these back unchanged.
 *  Absent therefore MEANS Google (see {@link normalizeBudgetSnapshot}). */
export interface GoogleBudgetSnapshot {
  platform?: "google-ads";
  budgetResourceName: string;
  prevMicros: number;
}

/** WP S1 — the same snapshot for a SKLIK campaign. Sklik has no budget resource
 *  (the daily cap lives on the campaign itself) and no micros (`dayBudget` is
 *  native CZK), so the shape genuinely differs rather than pretending to be
 *  Google's. Always carries `platform: "sklik"` — that tag is the discriminant AND
 *  the reason a rolled-back deploy can tell "I cannot restore this" from "this is
 *  one of mine". */
export interface SklikBudgetSnapshot {
  platform: "sklik";
  campaignId: string;
  prevDayBudgetCzk: number;
}

export type BudgetSnapshot = GoogleBudgetSnapshot | SklikBudgetSnapshot;

/** Read a persisted snapshot blob back into the union, tolerantly: anything
 *  without an explicit `platform: "sklik"` is a Google snapshot, because that is
 *  what every blob written before WP S1 is. Pure; the store is schemaless, so this
 *  is the whole "migration". */
export function normalizeBudgetSnapshot(raw: BudgetSnapshot): BudgetSnapshot {
  return isSklikSnapshot(raw) ? raw : (raw as GoogleBudgetSnapshot);
}

/** Type guard for the Sklik member — the ONE place the discriminant is read. */
export function isSklikSnapshot(s: BudgetSnapshot): s is SklikBudgetSnapshot {
  return (s as SklikBudgetSnapshot).platform === "sklik";
}

/** Split a change-set's snapshots by platform, so the restore loop hands each
 *  group to the mutator that can actually write it. A single-tenant change-set
 *  (all of them, as of S1) yields exactly one non-empty group; the split exists so
 *  a future union set cannot silently restore half of itself. */
export function partitionBudgetSnapshots(snapshots: BudgetSnapshot[]): {
  google: GoogleBudgetSnapshot[];
  sklik: SklikBudgetSnapshot[];
} {
  const google: GoogleBudgetSnapshot[] = [];
  const sklik: SklikBudgetSnapshot[] = [];
  for (const raw of snapshots) {
    const s = normalizeBudgetSnapshot(raw);
    if (isSklikSnapshot(s)) sklik.push(s);
    else google.push(s);
  }
  return { google, sklik };
}

/** Snapshot of a campaign's status *before* a change-set paused it, so a revert
 *  can resume it to exactly its prior state. Captured at approval for every pause
 *  move that actually landed on the live account. Already platform-agnostic (a
 *  campaign id and a serving state exist on both networks), so WP S1 only adds the
 *  optional tag — written for Sklik, never for Google, same rollback contract as
 *  {@link GoogleBudgetSnapshot}. */
export interface StatusSnapshot {
  campaignId: string;
  campaignName: string;
  /** the status the campaign held before the change-set paused it (always
   *  "enabled" today — pause moves only target enabled donors) */
  prevStatus: "enabled" | "paused";
  /** WP S1: present only on a Sklik set; absent means Google (legacy shape). */
  platform?: "sklik";
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
  /** WP S1 — which network the move was dispatched to. Stamped ONLY for Sklik, for
   *  the same reason the snapshot blobs are: a Google result written before S1 has
   *  no such key, and keeping it absent means a Google set's stored `results` array
   *  stays byte-identical to every one already in the ledger. */
  platform?: "sklik";
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
  /** what the touched campaigns ACTUALLY did in the 7 days after this set was
   *  applied, versus the 7 before — the honest complement to the forward
   *  projection {@link forwardProjectionApplies} stops showing once a set settles.
   *  Written once, by the post-sync realization pass, and only for `applied` sets
   *  on a genuinely live sync. Absent → not applied, not due yet, or written
   *  before this field existed. */
  realized?: RealizedImpact;
  /** the calibration the projection on THIS set was scored under, stamped at
   *  creation so the number the operator approved can be read back with the
   *  assumption it carried. Absent → the set was projected uncalibrated
   *  (multiplier 1), which is every set created before enough history existed. */
  calibration?: AppliedCalibration;
}

// --- realized impact (WP W2-E) -----------------------------------------------

/** Whether a realization produced a usable measurement. `insufficient` is the
 *  honest outcome when the stored series does not cover enough of either window
 *  — the per-campaign series doc holds only the account's ACTIVE period and is
 *  overwritten wholesale on every sync, so a late realization can find the
 *  before-window already rolled out of the stored range. */
export type RealizedStatus = "measured" | "insufficient";

/** What actually happened to the campaigns a change-set touched, measured from
 *  the already-persisted per-campaign daily series (never a fresh provider read).
 *  Rides the change-set document additively — `TenantDocs` is schemaless, so a
 *  merge-set is the whole migration. */
export interface RealizedImpact {
  status: RealizedStatus;
  /** ISO timestamp the measurement was taken */
  computedAt: string;
  /** the comparison window on each side, in days (fixed at 7) */
  windowDays: 7;
  /** how many distinct days of each window the stored series actually covers —
   *  the input to the `insufficient` verdict, kept so the UI can explain it */
  daysCovered: { before: number; after: number };
  /** the touched campaigns only (donors + recipients), 7-day sums per side */
  campaigns: Array<{
    id: string;
    costBefore: number;
    costAfter: number;
    valueBefore: number;
    valueAfter: number;
  }>;
  /** Σ valueAfter − Σ valueBefore over the touched set (CZK) */
  realizedValueDelta: number;
  /** snapshot of {@link projectedValueGain} for this set, so the comparison is
   *  self-contained even if the stored simulation is later reinterpreted */
  projectedValueGain: number;
  /** realizedValueDelta / projectedValueGain — null when the projection was ≤ 0
   *  (nothing to divide by, and a ratio against a non-gain is meaningless) or
   *  when the measurement is `insufficient` */
  ratio: number | null;
}

/** The calibration a change-set's projection was built under, stamped on the set
 *  itself. DISCLOSURE is the point: a silently calibrated projection would be
 *  worse than an uncalibrated one, so the multiplier travels with the number. */
export interface AppliedCalibration {
  multiplier: number;
  n: number;
}

/** Guardrail check — returns human-readable breaches, never throws. Enforced by
 *  the approval lifecycle (a non-empty result blocks apply unless overridden). */
export function checkPolicy(moves: BudgetMove[], policy: ControlPolicy): string[] {
  const v: string[] = [];
  if (moves.length > policy.maxMoves) {
    v.push(`Počet přesunů (${moves.length}) překračuje limit ${policy.maxMoves}.`);
  }
  for (const m of moves) {
    // WP S1 — a shift whose donor and recipient sit on different networks. Refused
    // unless explicitly allowed: the donor's budget would be cut in one account and
    // the recipient funded in another, which is not one move and cannot be reverted
    // as one. A pause has no recipient, so it can never breach this. Unreachable
    // today (single-tenant sets) and deliberately in place before it is reachable.
    if (
      !policy.crossSource &&
      m.kind !== "pause" &&
      m.fromSource &&
      m.toSource &&
      m.fromSource !== m.toSource
    ) {
      v.push("Přesun mezi sítěmi (Google ↔ Sklik) není povolený.");
    }
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

/** WP S1 — which ad network a change-set acted on, for the console's pill and its
 *  "this really writes to Sklik" confirm copy. Read in evidence order: the moves'
 *  own stamped sources first (present from S1 on), then the platform tag the apply
 *  loop wrote onto results / snapshots. Undefined for every set created before any
 *  of those existed — a legacy set is Google by construction, but this returns
 *  undefined rather than asserting it, and the UI simply shows no pill. */
export function changeSetSource(
  cs: Pick<ChangeSet, "moves" | "results" | "budgetSnapshots" | "statusSnapshots">
): AdsSource | undefined {
  // `?? []` because this reads persisted, schemaless documents: a set stored before
  // a field existed is exactly the case this function is for.
  for (const m of cs.moves ?? []) {
    if (m.fromSource) return m.fromSource;
    if (m.toSource) return m.toSource;
  }
  if (cs.results?.some((r) => r.platform === "sklik")) return "sklik";
  if (cs.budgetSnapshots?.some(isSklikSnapshot)) return "sklik";
  if (cs.statusSnapshots?.some((s) => s.platform === "sklik")) return "sklik";
  return undefined;
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
    // WP S1: the networks swap with the campaigns they describe, so an inverse move
    // is checkPolicy-equivalent to its forward. Same spread-only-when-present rule —
    // a source-less (pre-S1) move inverts byte-identically.
    ...(m.toSource !== undefined ? { fromSource: m.toSource } : {}),
    ...(m.fromSource !== undefined ? { toSource: m.fromSource } : {}),
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
