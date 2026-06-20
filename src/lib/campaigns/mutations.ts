/** Apply a recommendation back to Google Ads — closing the observe → decide → act
 *  loop. Human-triggered only (never automatic), live-account only, and every
 *  applied change is written to an audit log (`tenants/{tenant}/mutations`).
 *  Server-only. */
import { firestore } from "@/lib/firebase";
import { getAdsConnection } from "./connection";
import { getSyncMeta } from "./store";
import { recordActivity } from "./activity";
import { CAMPAIGN_PERIOD_DAYS } from "./types";
import { fmtCZK } from "@/lib/format";
import { getUserAccessToken } from "@/lib/google/token";
import {
  adsConfigured,
  fetchCampaignBudgets,
  pauseCampaign,
  setCampaignBudgetMicros,
} from "@/lib/google/ads";
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

/** Shared guard for every live mutation: configured + connected + authorized.
 *  Returns the actor, or a ready-to-return error result. */
async function resolveActor(
  userId: string
): Promise<{ actor: AdsActor } | { error: MutationResult }> {
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
  campaignId: string,
  campaignName: string
): Promise<MutationResult> {
  const resolved = await resolveActor(userId);
  if ("error" in resolved) return resolved.error;
  const { connection, token } = resolved.actor;

  const tenant = `u_${userId}_${connection.customerId}`;
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

/** Apply a recommended budget reallocation: lower the donor's daily budget and
 *  raise the recipient's by the same micros, then audit both. The recommendation's
 *  `amount` is a period total, so it's converted to a daily delta via the synced
 *  period length. The donor is floored at a small daily budget so it keeps
 *  serving, and the actual (floored) reduction is what's moved to the recipient. */
export async function applyBudgetShift(
  userId: string,
  move: BudgetShiftInput
): Promise<MutationResult> {
  const resolved = await resolveActor(userId);
  if ("error" in resolved) return resolved.error;
  const { connection, token } = resolved.actor;
  const customerId = connection.customerId;
  const tenant = `u_${userId}_${customerId}`;

  const meta = await getSyncMeta(tenant);
  const days = meta ? CAMPAIGN_PERIOD_DAYS[meta.period] : 30;
  const dailyMicros = Math.round((move.amount / days) * 1_000_000);
  if (dailyMicros <= 0) return { ok: false, error: "Přesun je příliš malý na úpravu rozpočtu." };

  try {
    const budgets = await fetchCampaignBudgets(token, customerId, [move.fromId, move.toId]);
    const from = budgets.get(move.fromId);
    const to = budgets.get(move.toId);
    if (!from || !to) {
      return { ok: false, error: "Nepodařilo se načíst rozpočty kampaní." };
    }
    if (from.budgetResourceName === to.budgetResourceName) {
      return { ok: false, error: "Kampaně sdílejí jeden rozpočet — přesun nelze provést." };
    }

    // Keep the donor serving with a small floor; move only what we actually took.
    const MIN_DAILY_MICROS = 10_000_000; // 10 CZK/day
    const fromNew = Math.max(MIN_DAILY_MICROS, from.amountMicros - dailyMicros);
    const movedMicros = from.amountMicros - fromNew;
    if (movedMicros <= 0) {
      return { ok: false, error: "Zdrojová kampaň už má minimální rozpočet." };
    }
    const toNew = to.amountMicros + movedMicros;

    await setCampaignBudgetMicros(token, customerId, from.budgetResourceName, fromNew);
    await setCampaignBudgetMicros(token, customerId, to.budgetResourceName, toNew);

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
  snapshots: BudgetSnapshot[]
): Promise<MutationResult> {
  const resolved = await resolveActor(userId);
  if ("error" in resolved) return resolved.error;
  const { connection, token } = resolved.actor;
  const customerId = connection.customerId;
  const tenant = `u_${userId}_${customerId}`;

  // De-dupe by budget, keeping the first (prior-most) snapshot for each.
  const byBudget = new Map<string, number>();
  for (const s of snapshots) {
    if (!byBudget.has(s.budgetResourceName)) byBudget.set(s.budgetResourceName, s.prevMicros);
  }
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
