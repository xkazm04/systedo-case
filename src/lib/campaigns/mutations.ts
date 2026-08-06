/** Apply a recommendation back to Google Ads — closing the observe → decide → act
 *  loop. Human-triggered only (never automatic), live-account only, and every
 *  applied change is written to an audit log (`tenants/{tenant}/mutations`).
 *
 *  The audit + activity are written under the SAME project-scoped `tenant` as the
 *  campaigns and change-sets they act on (the caller passes the tenant it already
 *  resolved via `resolveTenant`/`resolveCampaignContext`), so a pause/budget-shift
 *  is auditable next to the data it mutated — not stranded in a project-agnostic
 *  `u_{userId}_{customerId}` bucket the campaign surfaces never read. Legacy audit
 *  docs written under that old key stay readable via `listMutationAudit`'s
 *  dual-read; history is never rewritten. Server-only. */
import { firestore } from "@/lib/firebase";
import { getAdsConnection } from "./connection";
import { getSyncMeta } from "./store";
import { recordActivity } from "./activity";
import { buildTenantKey, mutationAuditReadTenants } from "./store-keys";
import { CAMPAIGN_PERIOD_DAYS } from "./types";
import { fmtCZK } from "@/lib/format";
import { getUserAccessToken } from "@/lib/google/token";
import {
  adsConfigured,
  fetchCampaignBudgets,
  pauseCampaign,
  resumeCampaign,
  setCampaignBudgetMicros,
} from "@/lib/google/ads";
import { computeDailyMicros, planBudgetMove, dedupeSnapshots } from "./budget-math";
import type { BudgetSnapshot } from "./control-plane-types";

export interface MutationResult {
  ok: boolean;
  error?: string;
  /** prior budget values touched by this mutation, for an exact revert. */
  snapshots?: BudgetSnapshot[];
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

interface AdsActor {
  connection: { customerId: string };
  token: string;
}

/** Shared guard for every live mutation: source is mutable + configured +
 *  connected + authorized. Returns the actor, or a ready-to-return error result.
 *
 *  Mutations are Google-only. A Sklik-sourced tenant (data-in only) must refuse
 *  cleanly with a clear Czech message rather than hitting the Google guard with a
 *  misleading "connect Google" error — so the source is checked first, off the
 *  tenant's persisted sync meta. */
async function resolveActor(
  userId: string,
  tenant: string
): Promise<{ actor: AdsActor } | { error: MutationResult }> {
  const meta = await getSyncMeta(tenant);
  if (meta?.source === "sklik") {
    return {
      error: {
        ok: false,
        error: "Úpravy kampaní pro Sklik zatím nejsou podporované. Dostupné jsou jen pro Google Ads.",
      },
    };
  }
  if (!adsConfigured()) {
    return { error: { ok: false, error: "Živé úpravy vyžadují Google Ads developer token." } };
  }
  const connection = await getAdsConnection(userId);
  if (!connection) {
    return { error: { ok: false, error: "Nejdřív připojte živý Google Ads účet." } };
  }
  const token = await getUserAccessToken(userId);
  if (!token) {
    return { error: { ok: false, error: "Chybí Google autorizace (přihlaste se znovu)." } };
  }
  return { actor: { connection: { customerId: connection.customerId }, token } };
}

/** Pause a campaign in the user's active (live) Google Ads account, and audit it.
 *  Requires a connected account + developer token; on sample/anonymous it returns
 *  a clear, non-destructive error. */
export async function applyPause(
  userId: string,
  /** the project-scoped tenant the campaigns live under (resolveTenant/…Context) */
  tenant: string,
  campaignId: string,
  campaignName: string
): Promise<MutationResult> {
  const resolved = await resolveActor(userId, tenant);
  if ("error" in resolved) return resolved.error;
  const { connection, token } = resolved.actor;

  try {
    await pauseCampaign(token, connection.customerId, campaignId);
    await firestore.collection("tenants").doc(tenant).collection("mutations").add({
      action: "pause",
      campaignId,
      campaignName,
      customerId: connection.customerId,
      userId,
      at: new Date().toISOString(),
    });
    await recordActivity(tenant, {
      kind: "pause",
      title: `Pozastavena kampaň ${campaignName}`,
      detail: "Kampaň byla pozastavena v Google Ads.",
      actor: "Vy",
    });
    return { ok: true };
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
  const resolved = await resolveActor(userId, tenant);
  if ("error" in resolved) return resolved.error;
  const { connection, token } = resolved.actor;

  try {
    await resumeCampaign(token, connection.customerId, campaignId);
    await firestore.collection("tenants").doc(tenant).collection("mutations").add({
      action: "resume",
      campaignId,
      campaignName,
      customerId: connection.customerId,
      userId,
      at: new Date().toISOString(),
    });
    await recordActivity(tenant, {
      kind: "pause",
      title: `Obnovena kampaň ${campaignName}`,
      detail: "Kampaň byla znovu spuštěna v Google Ads (vrácení změnového balíčku).",
      actor: "Vy",
    });
    return { ok: true };
  } catch (err) {
    console.error("[mutations] resume failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Úprava se nezdařila." };
  }
}

/** Apply a recommended budget reallocation: lower the donor's daily budget and
 *  raise the recipient's by the same micros, then audit both. The recommendation's
 *  `amount` is a period total, so it's converted to a daily delta via the synced
 *  period length. The donor is floored at a small daily budget so it keeps
 *  serving, and the actual (floored) reduction is what's moved to the recipient. */
export async function applyBudgetShift(
  userId: string,
  /** the project-scoped tenant the campaigns live under (resolveTenant/…Context) */
  tenant: string,
  move: BudgetShiftInput
): Promise<MutationResult> {
  const resolved = await resolveActor(userId, tenant);
  if ("error" in resolved) return resolved.error;
  const { connection, token } = resolved.actor;
  const customerId = connection.customerId;

  const meta = await getSyncMeta(tenant);
  const days = meta ? CAMPAIGN_PERIOD_DAYS[meta.period] : 30;
  const dailyMicros = computeDailyMicros(move.amount, days);
  if (dailyMicros <= 0) return { ok: false, error: "Přesun je příliš malý na úpravu rozpočtu." };

  try {
    const budgets = await fetchCampaignBudgets(token, customerId, [move.fromId, move.toId]);
    const from = budgets.get(move.fromId);
    const to = budgets.get(move.toId);
    if (!from || !to) {
      return { ok: false, error: "Nepodařilo se načíst rozpočty kampaní." };
    }
    if (from.budgetResourceName === to.budgetResourceName) {
      return { ok: false, error: "Kampaně sdílejí jeden rozpočet. Přesun nelze provést." };
    }

    // Keep the donor serving with a small floor; move only what we actually took.
    const moved = planBudgetMove({
      dailyMicros,
      fromMicros: from.amountMicros,
      toMicros: to.amountMicros,
    });
    if ("error" in moved) {
      return { ok: false, error: "Zdrojová kampaň už má minimální rozpočet." };
    }
    const { fromNew, toNew, movedMicros } = moved;

    // Two independent live writes with no cross-account transaction. Reduce the donor
    // first, then fund the recipient; if the recipient write fails, the donor has
    // already been throttled — roll it back to its captured prior value so a real
    // client campaign isn't silently starved, and record the failed attempt so the
    // shift is never a zero-trace event.
    await setCampaignBudgetMicros(token, customerId, from.budgetResourceName, fromNew);
    try {
      await setCampaignBudgetMicros(token, customerId, to.budgetResourceName, toNew);
    } catch (recipErr) {
      console.error("[mutations] recipient budget write failed; rolling back donor:", recipErr);
      let rolledBack = false;
      try {
        await setCampaignBudgetMicros(token, customerId, from.budgetResourceName, from.amountMicros);
        rolledBack = true;
      } catch (rbErr) {
        console.error("[mutations] donor rollback ALSO failed — donor left throttled:", rbErr);
      }
      // Best-effort audit of the failed attempt (never let logging mask the failure).
      try {
        await firestore.collection("tenants").doc(tenant).collection("mutations").add({
          action: "budget_shift_failed",
          fromId: move.fromId,
          fromName: move.fromName,
          toId: move.toId,
          toName: move.toName,
          fromPrevMicros: from.amountMicros,
          fromAttemptedMicros: fromNew,
          donorRolledBack: rolledBack,
          customerId,
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

    await firestore.collection("tenants").doc(tenant).collection("mutations").add({
      action: "budget_shift",
      fromId: move.fromId,
      fromName: move.fromName,
      toId: move.toId,
      toName: move.toName,
      dailyMovedMicros: movedMicros,
      customerId,
      userId,
      at: new Date().toISOString(),
    });
    await recordActivity(tenant, {
      kind: "budget_shift",
      title: `Přesun rozpočtu ${move.fromName} → ${move.toName}`,
      detail: `Denní rozpočet snížen o ${fmtCZK(movedMicros / 1_000_000)} a přesunut na výkonnější kampaň.`,
      actor: "Vy",
    });
    // Capture the budgets' prior values so a revert can restore them exactly.
    return {
      ok: true,
      snapshots: [
        { budgetResourceName: from.budgetResourceName, prevMicros: from.amountMicros },
        { budgetResourceName: to.budgetResourceName, prevMicros: to.amountMicros },
      ],
    };
  } catch (err) {
    console.error("[mutations] budget shift failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Úprava se nezdařila." };
  }
}

/** Restore campaign budgets to exact prior micros from a change-set's snapshots
 *  — the precise inverse of a `budget_shift` apply (no re-flooring drift). When a
 *  budget appears in several snapshots, the earliest (prior-most) value wins.
 *  Audited like any other mutation. Live-account only. */
export async function restoreBudgets(
  userId: string,
  /** the project-scoped tenant the campaigns live under (resolveTenant/…Context) */
  tenant: string,
  snapshots: BudgetSnapshot[]
): Promise<MutationResult> {
  const resolved = await resolveActor(userId, tenant);
  if ("error" in resolved) return resolved.error;
  const { connection, token } = resolved.actor;
  const customerId = connection.customerId;

  // De-dupe by budget, keeping the first (prior-most) snapshot for each.
  const byBudget = dedupeSnapshots(snapshots);
  if (byBudget.size === 0) return { ok: false, error: "Chybí snímek původních rozpočtů." };

  try {
    for (const [resourceName, micros] of byBudget) {
      await setCampaignBudgetMicros(token, customerId, resourceName, micros);
    }
    await firestore.collection("tenants").doc(tenant).collection("mutations").add({
      action: "budget_restore",
      budgets: [...byBudget.keys()],
      customerId,
      userId,
      at: new Date().toISOString(),
    });
    return { ok: true };
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
      const snap = await firestore
        .collection("tenants")
        .doc(t)
        .collection("mutations")
        .orderBy("at", "desc")
        .limit(limit)
        .get();
      for (const d of snap.docs) {
        const data = d.data() as Record<string, unknown>;
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
