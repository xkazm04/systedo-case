/** Apply a recommendation back to the live ad account — closing the observe →
 *  decide → act loop. Human-triggered only (never automatic), live-account only, and
 *  every applied change is written to an audit log (`tenants/{tenant}/mutations`).
 *
 *  WP S1 made this module PLATFORM-BLIND. It used to speak Google Ads directly (an
 *  OAuth token, a customerId, budget micros, budget resource names); it now resolves
 *  an {@link AdsMutator} for the tenant and dispatches through it, so the same four
 *  functions drive Google Ads and Sklik. What did NOT change is the Google path's
 *  observable behaviour: the same API calls in the same order with the same
 *  arguments, the same audit `action` names and doc fields (no `platform` key), the
 *  same activity strings and the same refusal messages — pinned by the untouched
 *  control-plane local-store suite plus a deep-equal audit pin.
 *
 *  Sklik writes ride the three rails documented on ./mutator.ts (isolated method
 *  constants that degrade, a settled money-unit verdict, and the default-off
 *  `SKLIK_WRITES_ENABLED` switch). A refusal from any of them returns
 *  `{ ok: false, error }` here — it never mutates and never writes an audit doc, so
 *  the change-set settles `failed` with the refusal as its message.
 *
 *  The audit + activity are written under the SAME project-scoped `tenant` as the
 *  campaigns and change-sets they act on (the caller passes the tenant it already
 *  resolved via `resolveTenant`/`resolveCampaignContext`), so a pause/budget-shift
 *  is auditable next to the data it mutated — not stranded in a project-agnostic
 *  `u_{userId}_{customerId}` bucket the campaign surfaces never read. Legacy audit
 *  docs written under that old key stay readable via `listMutationAudit`'s
 *  dual-read; history is never rewritten. Server-only. */
import { tenantDocs } from "@/lib/tenant-docs/backend";
import { getAdsConnection } from "./connection";
import { getSyncMeta } from "./store";
import { recordActivity } from "./activity";
import { buildTenantKey, mutationAuditReadTenants } from "./store-keys";
import { CAMPAIGN_PERIOD_DAYS } from "./types";
import { fmtCZK } from "@/lib/format";
import { mutatorForTenant, type AdsMutator, type PlatformBudget } from "./mutator";
import {
  computeDailyMicros,
  czkToMicros,
  dedupeSklikSnapshots,
  dedupeSnapshots,
  planBudgetMove,
  type BudgetMovePlan,
} from "./budget-math";
import { partitionBudgetSnapshots, type BudgetSnapshot } from "./control-plane-types";

/** The immutable audit sub-collection under `tenants/{tenant}` — unchanged;
 *  addressed through the generic per-tenant document seam ({@link tenantDocs},
 *  ADR-0001) so a mutation attempted under LOCAL_DB is audited to the sqlite twin
 *  instead of throwing. The Firestore backend of that seam issues the same `.add`
 *  and the same `orderBy("at","desc").limit(n)` read this module issued before. */
const MUTATIONS = "mutations";

export interface MutationResult {
  ok: boolean;
  error?: string;
  /** prior budget values touched by this mutation, for an exact revert. */
  snapshots?: BudgetSnapshot[];
  /** WP S1 — which network the write was dispatched to, so the control-plane loop
   *  can tag the stored result/status-snapshot. Present only for Sklik: a Google
   *  result must stay byte-identical to the ones already in the ledger. */
  platform?: "sklik";
}

/** The shape `applyBudgetShift` needs from a recommended `BudgetMove`. */
export interface BudgetShiftInput {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  /** total CZK to reallocate over the synced period (a `BudgetMove.amount`) */
  amount: number;
}

/** The Sklik-only tag spread onto a MutationResult (absent for Google — see
 *  {@link MutationResult.platform}). */
function platformTag(mutator: AdsMutator): { platform: "sklik" } | Record<string, never> {
  return mutator.source === "sklik" ? { platform: "sklik" } : {};
}

/** Pause a campaign in the user's active (live) ad account, and audit it. Requires
 *  a connected account (and, on Sklik, all three write rails); on sample/anonymous
 *  it returns a clear, non-destructive error. */
export async function applyPause(
  userId: string,
  /** the project-scoped tenant the campaigns live under (resolveTenant/…Context) */
  tenant: string,
  campaignId: string,
  campaignName: string
): Promise<MutationResult> {
  const resolved = await mutatorForTenant(userId, tenant);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { mutator } = resolved;

  try {
    await mutator.pause(campaignId);
    await (await tenantDocs()).addDoc(tenant, MUTATIONS, {
      action: "pause",
      campaignId,
      campaignName,
      ...mutator.auditFields,
      userId,
      at: new Date().toISOString(),
    });
    await recordActivity(tenant, {
      kind: "pause",
      title: `Pozastavena kampaň ${campaignName}`,
      detail: `Kampaň byla pozastavena v ${mutator.networkLabel}.`,
      actor: "Vy",
    });
    return { ok: true, ...platformTag(mutator) };
  } catch (err) {
    console.error("[mutations] pause failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Úprava se nezdařila." };
  }
}

/** Resume (re-enable) a campaign a governed change-set previously paused — the
 *  inverse of {@link applyPause}, used only by the control-plane revert path. Same
 *  connected-account guard + audit contract as every other live mutation. */
export async function applyResume(
  userId: string,
  /** the project-scoped tenant the campaigns live under (resolveTenant/…Context) */
  tenant: string,
  campaignId: string,
  campaignName: string
): Promise<MutationResult> {
  const resolved = await mutatorForTenant(userId, tenant);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { mutator } = resolved;

  try {
    await mutator.resume(campaignId);
    await (await tenantDocs()).addDoc(tenant, MUTATIONS, {
      action: "resume",
      campaignId,
      campaignName,
      ...mutator.auditFields,
      userId,
      at: new Date().toISOString(),
    });
    await recordActivity(tenant, {
      kind: "pause",
      title: `Obnovena kampaň ${campaignName}`,
      detail: `Kampaň byla znovu spuštěna v ${mutator.networkLabel} (vrácení změnového balíčku).`,
      actor: "Vy",
    });
    return { ok: true, ...platformTag(mutator) };
  } catch (err) {
    console.error("[mutations] resume failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Úprava se nezdařila." };
  }
}

/** A donor→recipient budget move expressed in ONE platform's own unit: what to
 *  write, what to snapshot, and what the audit doc should say. See {@link planShift}. */
interface ShiftWrites {
  /** the donor's new daily budget, in the donor's native unit */
  fromAmount: number;
  /** the recipient's new daily budget, in its native unit */
  toAmount: number;
  /** the donor's PRIOR value — what a failed recipient write rolls back to */
  fromPrevAmount: number;
  /** exact-revert snapshots for both ends */
  snapshots: BudgetSnapshot[];
  /** amount fields for the successful `budget_shift` audit doc */
  auditAmounts: Record<string, number>;
  /** amount fields for the `budget_shift_failed` audit doc */
  failedAmounts: Record<string, number>;
  /** daily CZK actually moved — the number the activity feed states */
  movedCzk: number;
}

/** Turn a micros-denominated {@link BudgetMovePlan} into the writes ONE platform
 *  actually takes.
 *
 *  Both networks plan in micros on purpose: `planBudgetMove` — and with it the
 *  MIN_DAILY_CZK donor floor — is the single piece of budget arithmetic in the
 *  codebase, so Sklik's native-CZK budgets are lifted into micros, planned, and
 *  brought back down rather than getting a second floor that could drift.
 *
 *  Coming back down is where Sklik needs care: `dayBudget` is a whole-koruna cap, so
 *  rounding the donor's and the recipient's new budgets INDEPENDENTLY could move a
 *  koruna that never left the donor. The recipient is therefore funded with exactly
 *  what the (rounded) donor gave up, so the two ends always net to zero. Google
 *  keeps its exact micros untouched — no rounding, no round-trip. */
function planShift(
  from: PlatformBudget,
  to: PlatformBudget,
  plan: BudgetMovePlan
): ShiftWrites | { error: "at_min" } {
  if (from.platform === "google-ads" && to.platform === "google-ads") {
    return {
      fromAmount: plan.fromNew,
      toAmount: plan.toNew,
      fromPrevAmount: from.amountMicros,
      snapshots: [
        { budgetResourceName: from.budgetResourceName, prevMicros: from.amountMicros },
        { budgetResourceName: to.budgetResourceName, prevMicros: to.amountMicros },
      ],
      auditAmounts: { dailyMovedMicros: plan.movedMicros },
      failedAmounts: { fromPrevMicros: from.amountMicros, fromAttemptedMicros: plan.fromNew },
      movedCzk: plan.movedMicros / 1_000_000,
    };
  }
  if (from.platform === "sklik" && to.platform === "sklik") {
    const fromNewCzk = Math.round(plan.fromNew / 1_000_000);
    const movedCzk = from.dayBudgetCzk - fromNewCzk;
    // Rounding to whole koruny can swallow a sub-koruna move entirely; that is the
    // same "nothing can actually move" state the micros planner calls `at_min`, and
    // it must refuse rather than write two no-op updates to a real account.
    if (movedCzk <= 0) return { error: "at_min" };
    return {
      fromAmount: fromNewCzk,
      toAmount: to.dayBudgetCzk + movedCzk,
      fromPrevAmount: from.dayBudgetCzk,
      snapshots: [
        { platform: "sklik", campaignId: from.campaignId, prevDayBudgetCzk: from.dayBudgetCzk },
        { platform: "sklik", campaignId: to.campaignId, prevDayBudgetCzk: to.dayBudgetCzk },
      ],
      auditAmounts: { dailyMovedCzk: movedCzk },
      failedAmounts: { fromPrevDayBudgetCzk: from.dayBudgetCzk, fromAttemptedDayBudgetCzk: fromNewCzk },
      movedCzk,
    };
  }
  // Unreachable as of S1 (a change-set is single-tenant, so both ends come from the
  // same mutator's readBudgets) and refused rather than half-written if it ever is.
  return { error: "at_min" };
}

/** The donor's / recipient's current budget in its own unit — the planner's input. */
function nativeAmount(b: PlatformBudget): number {
  return b.platform === "sklik" ? czkToMicros(b.dayBudgetCzk) : b.amountMicros;
}

/** Apply a recommended budget reallocation: lower the donor's daily budget and
 *  raise the recipient's by the same amount, then audit both. The recommendation's
 *  `amount` is a period total, so it's converted to a daily delta via the synced
 *  period length. The donor is floored at a small daily budget so it keeps
 *  serving, and the actual (floored) reduction is what's moved to the recipient. */
export async function applyBudgetShift(
  userId: string,
  /** the project-scoped tenant the campaigns live under (resolveTenant/…Context) */
  tenant: string,
  move: BudgetShiftInput
): Promise<MutationResult> {
  const resolved = await mutatorForTenant(userId, tenant);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { mutator } = resolved;

  const meta = await getSyncMeta(tenant);
  const days = meta ? CAMPAIGN_PERIOD_DAYS[meta.period] : 30;
  const dailyMicros = computeDailyMicros(move.amount, days);
  if (dailyMicros <= 0) return { ok: false, error: "Přesun je příliš malý na úpravu rozpočtu." };

  try {
    const budgets = await mutator.readBudgets([move.fromId, move.toId]);
    const from = budgets.get(move.fromId);
    const to = budgets.get(move.toId);
    if (!from || !to) {
      return { ok: false, error: "Nepodařilo se načíst rozpočty kampaní." };
    }
    // Google campaigns can SHARE one CampaignBudget resource, in which case a
    // donor→recipient shift is two writes to the same object and nets to nothing.
    // Sklik has no such object (the cap lives on the campaign), so the check is
    // Google's alone.
    if (
      from.platform === "google-ads" &&
      to.platform === "google-ads" &&
      from.budgetResourceName === to.budgetResourceName
    ) {
      return { ok: false, error: "Kampaně sdílejí jeden rozpočet. Přesun nelze provést." };
    }

    // Keep the donor serving with a small floor; move only what we actually took.
    const moved = planBudgetMove({
      dailyMicros,
      fromMicros: nativeAmount(from),
      toMicros: nativeAmount(to),
    });
    if ("error" in moved) {
      return { ok: false, error: "Zdrojová kampaň už má minimální rozpočet." };
    }
    const writes = planShift(from, to, moved);
    if ("error" in writes) {
      return { ok: false, error: "Zdrojová kampaň už má minimální rozpočet." };
    }

    // Two independent live writes with no cross-account transaction. Reduce the donor
    // first, then fund the recipient; if the recipient write fails, the donor has
    // already been throttled — roll it back to its captured prior value so a real
    // client campaign isn't silently starved, and record the failed attempt so the
    // shift is never a zero-trace event.
    await mutator.setBudget(from, writes.fromAmount);
    try {
      await mutator.setBudget(to, writes.toAmount);
    } catch (recipErr) {
      console.error("[mutations] recipient budget write failed; rolling back donor:", recipErr);
      let rolledBack = false;
      try {
        await mutator.setBudget(from, writes.fromPrevAmount);
        rolledBack = true;
      } catch (rbErr) {
        console.error("[mutations] donor rollback ALSO failed — donor left throttled:", rbErr);
      }
      // Best-effort audit of the failed attempt (never let logging mask the failure).
      try {
        await (await tenantDocs()).addDoc(tenant, MUTATIONS, {
          action: "budget_shift_failed",
          fromId: move.fromId,
          fromName: move.fromName,
          toId: move.toId,
          toName: move.toName,
          ...writes.failedAmounts,
          donorRolledBack: rolledBack,
          ...mutator.auditFields,
          userId,
          at: new Date().toISOString(),
        });
      } catch (logErr) {
        console.error("[mutations] failed-shift audit write failed:", logErr);
      }
      const detail = rolledBack
        ? "přesun se nezdařil, zdrojový rozpočet byl vrácen na původní hodnotu"
        : "přesun se nezdařil a vrácení zdrojového rozpočtu selhalo, zkontrolujte rozpočet ručně";
      return {
        ok: false,
        error: `${recipErr instanceof Error ? recipErr.message : "Úprava se nezdařila"} (${detail}).`,
      };
    }

    await (await tenantDocs()).addDoc(tenant, MUTATIONS, {
      action: "budget_shift",
      fromId: move.fromId,
      fromName: move.fromName,
      toId: move.toId,
      toName: move.toName,
      ...writes.auditAmounts,
      ...mutator.auditFields,
      userId,
      at: new Date().toISOString(),
    });
    await recordActivity(tenant, {
      kind: "budget_shift",
      title: `Přesun rozpočtu ${move.fromName} → ${move.toName}`,
      detail: `Denní rozpočet snížen o ${fmtCZK(writes.movedCzk)} a přesunut na výkonnější kampaň.`,
      actor: "Vy",
    });
    // Capture the budgets' prior values so a revert can restore them exactly.
    return { ok: true, snapshots: writes.snapshots, ...platformTag(mutator) };
  } catch (err) {
    console.error("[mutations] budget shift failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Úprava se nezdařila." };
  }
}

/** Restore campaign budgets to exact prior values from a change-set's snapshots
 *  — the precise inverse of a `budget_shift` apply (no re-flooring drift). When a
 *  budget appears in several snapshots, the earliest (prior-most) value wins.
 *  Audited like any other mutation. Live-account only.
 *
 *  WP S1: snapshots are a per-platform union, so they are partitioned first and the
 *  group belonging to THIS tenant's network is restored. A set carrying the other
 *  network's snapshots is refused outright rather than half-restored — the only way
 *  to produce one is a union change-set, which does not exist yet, or a rollback of
 *  this WP, where refusing is exactly the right answer. */
export async function restoreBudgets(
  userId: string,
  /** the project-scoped tenant the campaigns live under (resolveTenant/…Context) */
  tenant: string,
  snapshots: BudgetSnapshot[]
): Promise<MutationResult> {
  const resolved = await mutatorForTenant(userId, tenant);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const { mutator } = resolved;

  const groups = partitionBudgetSnapshots(snapshots);
  const isSklik = mutator.source === "sklik";
  const foreign = isSklik ? groups.google.length : groups.sklik.length;
  // De-dupe within the tenant's own network, keeping the first (prior-most) value.
  // Google keys on the budget RESOURCE (campaigns can share one); Sklik on the
  // campaign id (there is no shared budget object).
  const byKey = isSklik ? dedupeSklikSnapshots(groups.sklik) : dedupeSnapshots(groups.google);
  // Checked before the "no snapshots" message, so a set whose snapshots ALL belong
  // to the other network is told the truth rather than "nothing to restore".
  if (foreign > 0) {
    return {
      ok: false,
      error: "Balíček obsahuje snímky rozpočtů z jiné reklamní sítě — vraťte ho v síti, ve které vznikl.",
    };
  }
  if (byKey.size === 0) return { ok: false, error: "Chybí snímek původních rozpočtů." };

  try {
    for (const [key, amount] of byKey) {
      const target: PlatformBudget = isSklik
        ? { platform: "sklik", campaignId: key, dayBudgetCzk: amount }
        : { platform: "google-ads", budgetResourceName: key, amountMicros: amount };
      await mutator.setBudget(target, amount);
    }
    await (await tenantDocs()).addDoc(tenant, MUTATIONS, {
      action: "budget_restore",
      budgets: [...byKey.keys()],
      ...mutator.auditFields,
      userId,
      at: new Date().toISOString(),
    });
    return { ok: true, ...platformTag(mutator) };
  } catch (err) {
    console.error("[mutations] budget restore failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Obnovení se nezdařilo." };
  }
}

/** One audited mutation as stored (the exact doc shape varies by action; `action`
 *  and `at` are always present). */
export interface MutationAuditEntry {
  id: string;
  action: string;
  at: string;
  [key: string]: unknown;
}

/** The user's per-mutation audit history for a project, newest first. Dual-reads
 *  the current project-scoped audit tenant AND the legacy project-agnostic one
 *  (`u_{userId}_{customerId}`) so pauses/budget shifts recorded before the audit
 *  was co-located with the campaigns are never lost — old docs are unioned in on
 *  read, never migrated or rewritten. Best-effort: a failed tenant read is
 *  skipped rather than failing the whole history. */
export async function listMutationAudit(
  userId: string,
  projectId: string | null | undefined,
  limit = 50
): Promise<MutationAuditEntry[]> {
  const connection = await getAdsConnection(userId);
  const customerId = connection?.customerId ?? null;
  const tenant = buildTenantKey(userId, projectId, customerId);
  const tenants = mutationAuditReadTenants(tenant, userId, customerId);

  const entries: MutationAuditEntry[] = [];
  for (const t of tenants) {
    try {
      const rows = await (await tenantDocs()).listDocs(t, MUTATIONS, {
        orderBy: { field: "at", dir: "desc" },
        limit,
      });
      for (const d of rows) {
        const data = d.data as Record<string, unknown>;
        entries.push({
          ...data,
          id: d.id,
          action: typeof data.action === "string" ? data.action : "",
          at: typeof data.at === "string" ? data.at : "",
        });
      }
    } catch (err) {
      console.error(`[mutations] audit read failed for ${t} (non-fatal):`, err);
    }
  }
  // Merge the two tenants' histories into one newest-first stream.
  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, limit);
}
