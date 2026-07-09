/** Direction 3 — inventory-aware budget action plan. Turns the read-only per-SKU
 *  budget proposal (`budgetChangeSet`) into an EXECUTABLE, governed change-set by
 *  enriching each move with the intelligence a pure ad tool has but a WMS never
 *  does: why the donor is being tapered (its forecast stockout date), the margin
 *  tilt (donor → recipient COGS), and — the differentiator — the fact that the
 *  shift lands across EVERY sales channel at once, not just Google Shopping.
 *
 *  Pure. The executable surface (InventoryBudgetActions) applies it; a real apply
 *  would route through the ad-ops control plane (simulate → approve → audited
 *  mutation → revert), the same governance envelope the Kampaně module uses. */
import type { BudgetChangeSet, StockRow, StockStatus } from "./compute";
import { DEFAULT_POLICY, checkPolicy, type ControlPolicy } from "@/lib/campaigns/control-plane-types";
import type { BudgetMove } from "@/lib/campaigns/simulate";

export interface AdChannel {
  name: string;
  /** a Czech-market channel Google's native out-of-stock handling can't touch */
  cz: boolean;
}

/** The channels an e-shop SKU is typically advertised across. Inventory-aware
 *  execution's whole point: a stockout must taper/redirect spend on ALL of them at
 *  once. Google's Merchant Center only pauses Google Shopping — Sklik, Zboží.cz
 *  and Heureka keep spending into an empty shelf unless something unifies them. */
export const SKU_AD_CHANNELS: AdChannel[] = [
  { name: "Google Nákupy", cz: false },
  { name: "Sklik", cz: true },
  { name: "Zboží.cz", cz: true },
  { name: "Heureka", cz: true },
  { name: "Meta", cz: false },
];

export interface InventoryAction {
  fromSku: string;
  fromTitle: string;
  toSku: string;
  toTitle: string;
  category: string;
  amountCzk: number;
  donorStatus: StockStatus;
  /** donor's projected stockout date (ISO) — why its spend is tapered now */
  stockoutAt: string | null;
  /** whole days until that stockout (Infinity-safe: null when cover is infinite) */
  stockoutInDays: number | null;
  donorMargin: number;
  recipientMargin: number;
  /** donor's margin-weighted cover value — the profit a stockout would waste */
  valueAtRisk: number;
  channels: AdChannel[];
}

export interface InventoryActionPlan {
  actions: InventoryAction[];
  totalShifted: number;
  /** margin-weighted cover value the plan protects from being spent into a stockout */
  valueProtected: number;
  /** true when the plan is inside the ad-ops guardrails (blast-radius + per-move cap) */
  withinGuardrails: boolean;
  policy: ControlPolicy;
}

/** Build the executable plan by joining the proposed moves back to their stock
 *  rows (for the forecast + margin context). Pure & deterministic. */
export function buildActionPlan(stock: StockRow[], changeSet: BudgetChangeSet): InventoryActionPlan {
  const bySku = new Map(stock.map((r) => [r.product.sku, r]));

  const actions: InventoryAction[] = changeSet.moves.map((m) => {
    const donor = bySku.get(m.fromSku);
    const recipient = bySku.get(m.toSku);
    const stockoutInDays =
      donor && Number.isFinite(donor.stockoutDays) ? donor.stockoutDays : null;
    return {
      fromSku: m.fromSku,
      fromTitle: m.fromTitle,
      toSku: m.toSku,
      toTitle: m.toTitle,
      category: m.category,
      amountCzk: m.amountCzk,
      donorStatus: donor?.status ?? "low",
      stockoutAt: donor?.stockoutAt ?? null,
      stockoutInDays,
      donorMargin: donor?.margin ?? 0,
      recipientMargin: recipient?.margin ?? 0,
      valueAtRisk: donor?.coverValue ?? 0,
      channels: SKU_AD_CHANNELS,
    };
  });

  const valueProtected = changeSet.moves.reduce((sum, m) => {
    const donor = bySku.get(m.fromSku);
    return sum + (donor?.coverValue ?? 0);
  }, 0);

  // Govern the plan with the EXACT ControlPolicy the ad-ops control plane enforces
  // (DEFAULT_POLICY, via the same checkPolicy), mapping each inventory move to the
  // campaigns BudgetMove shape checkPolicy expects (amountCzk → amount, titles →
  // names) so the "within guardrails" badge honestly reflects what a real apply
  // would gate — instead of a hand-rolled copy that had drifted to a laxer maxMoves.
  const guardrailMoves: BudgetMove[] = actions.map((a) => ({
    fromId: a.fromSku,
    fromName: a.fromTitle,
    toId: a.toSku,
    toName: a.toTitle,
    amount: a.amountCzk,
    fromRoas: 0,
    toRoas: 0,
    estValueGain: 0,
  }));
  const withinGuardrails = checkPolicy(guardrailMoves, DEFAULT_POLICY).length === 0;

  return {
    actions,
    totalShifted: changeSet.totalShifted,
    valueProtected,
    withinGuardrails,
    policy: DEFAULT_POLICY,
  };
}
