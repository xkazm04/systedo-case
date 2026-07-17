/** Pure profit math for the report's cost model. Turns a period's revenue / ad
 *  spend / conversions into TRUE net profit after COGS and overhead:
 *    grossProfit = revenue × grossMargin
 *    netProfit   = grossProfit − adSpend − monthlyOverhead×months − perOrder×orders
 *  POAS is margin-aware (grossProfit / adSpend), unlike the pre-COGS contribution
 *  the report shows without a model. Framework-free + unit-tested. */
import type { AnalysisPeriod } from "@/lib/ai-types";
import * as ProfitMath from "@/lib/profit/core";
import type { CostModel } from "./types";

/** Whole months a report period spans, so the monthly overhead scales to it. */
export const PERIOD_MONTHS: Record<AnalysisPeriod, number> = { "30d": 1, "90d": 3, "12m": 12 };

export interface PeriodProfitInput {
  revenue: number;
  /** ad spend for the period */
  adCost: number;
  /** orders/conversions in the period (fulfilment cost basis) */
  conversions: number;
  /** whole months the period spans (overhead proration) */
  months: number;
}

export interface PeriodProfit {
  grossProfit: number;
  overhead: number;
  fulfilment: number;
  /** grossProfit − adCost − overhead − fulfilment */
  netProfit: number;
  /** netProfit / revenue */
  profitMargin: number;
  /** grossProfit / adCost — margin-aware profit-on-ad-spend */
  poas: number;
}

/** Net profit after COGS + overhead for one period under a cost model. */
export function periodProfit(input: PeriodProfitInput, m: CostModel): PeriodProfit {
  // Blended-margin, single-P&L variant of the shared primitives: one margin over
  // all revenue, the whole overhead charged against portfolio net profit (the
  // per-channel /zisk engine splits overhead by revenue share instead — see core).
  const grossProfit = ProfitMath.grossProfit(input.revenue, m.grossMarginPct);
  const overhead = ProfitMath.overheadForPeriod(m.monthlyOverhead, input.months);
  const fulfilment = ProfitMath.fulfilment(m.perOrderCost, input.conversions);
  const netProfit = ProfitMath.netProfit(grossProfit, input.adCost, overhead, fulfilment);
  return {
    grossProfit,
    overhead,
    fulfilment,
    netProfit,
    profitMargin: input.revenue > 0 ? netProfit / input.revenue : 0,
    poas: input.adCost > 0 ? grossProfit / input.adCost : 0,
  };
}

/** The tenant's break-even performance derived from its cost model, so every
 *  operational surface can judge against the margin it actually earns — not the
 *  margin-blind portfolio target. `gross*` is the period-independent 1/margin
 *  (the "hrubý" break-even the /kampane and report surfaces show); `loaded*` folds
 *  in overhead + fulfilment for a reference window and is only present when the
 *  model carries either (else it equals the gross value, so it's omitted). */
export interface BreakEven {
  /** gross break-even ROAS = 1 / margin */
  grossRoas: number;
  /** gross break-even PNO = margin */
  grossPno: number;
  /** overhead-loaded break-even ROAS over the reference window */
  loadedRoas?: number;
  /** overhead-loaded break-even PNO over the reference window */
  loadedPno?: number;
}

/** Derive the tenant's break-even ROAS + PNO from its blended margin. Pass a
 *  reference window (ad spend, orders, months) to also get the overhead-loaded
 *  variant; without one — or when the model has no overhead/fulfilment — only the
 *  gross figures are returned. Pure; reuses the shared profit-math core. */
export function deriveBreakEven(
  m: CostModel,
  ref?: { adCost: number; conversions: number; months: number }
): BreakEven {
  const grossRoas = ProfitMath.breakEvenRoas(m.grossMarginPct);
  const grossPno = ProfitMath.breakEvenPno(m.grossMarginPct);
  if (!ref) return { grossRoas, grossPno };
  const overhead = ProfitMath.overheadForPeriod(m.monthlyOverhead, ref.months);
  const fulfil = ProfitMath.fulfilment(m.perOrderCost, ref.conversions);
  if (overhead <= 0 && fulfil <= 0) return { grossRoas, grossPno };
  const loadedRoas = ProfitMath.loadedBreakEvenRoas(m.grossMarginPct, ref.adCost, overhead, fulfil);
  // A non-finite loaded value (no ad spend / no margin) is not a serializable domain
  // number — JSON.stringify(Infinity) becomes null, breaking the `number` contract
  // downstream. Treat it as "no loaded variant" and omit both optional fields, exactly
  // like the no-overhead/fulfilment case above.
  if (!Number.isFinite(loadedRoas)) return { grossRoas, grossPno };
  return { grossRoas, grossPno, loadedRoas, loadedPno: 1 / loadedRoas };
}

/** Validate a raw cost model from the client. Returns null if unusable, so the API
 *  route can 400 rather than silently persist a wrong number. Accepted ranges:
 *  grossMarginPct in (0, 1] (0 rejected — a zero-margin model earns nothing; 1 = 100 %
 *  margin accepted), monthlyOverhead and perOrderCost each a finite value >= 0. Every
 *  field uses the SAME reject-don't-coerce policy — previously an invalid overhead or
 *  per-order cost (e.g. a thousands-separated "45 000" → NaN, or a negative) was quietly
 *  coerced to 0, so the report showed a rosier "true net profit" that omitted the
 *  overhead the model exists to capture. */
export function sanitizeCostModel(raw: unknown): Omit<CostModel, "updatedAt"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const margin = Number(o.grossMarginPct);
  const overhead = Number(o.monthlyOverhead);
  const perOrder = Number(o.perOrderCost);
  if (!Number.isFinite(margin) || margin <= 0 || margin > 1) return null;
  if (!Number.isFinite(overhead) || overhead < 0) return null;
  if (!Number.isFinite(perOrder) || perOrder < 0) return null;
  return { grossMarginPct: margin, monthlyOverhead: overhead, perOrderCost: perOrder };
}
