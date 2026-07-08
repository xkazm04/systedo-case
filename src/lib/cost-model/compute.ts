/** Pure profit math for the report's cost model. Turns a period's revenue / ad
 *  spend / conversions into TRUE net profit after COGS and overhead:
 *    grossProfit = revenue × grossMargin
 *    netProfit   = grossProfit − adSpend − monthlyOverhead×months − perOrder×orders
 *  POAS is margin-aware (grossProfit / adSpend), unlike the pre-COGS contribution
 *  the report shows without a model. Framework-free + unit-tested. */
import type { AnalysisPeriod } from "@/lib/ai-types";
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
  const grossProfit = input.revenue * m.grossMarginPct;
  const overhead = m.monthlyOverhead * input.months;
  const fulfilment = m.perOrderCost * input.conversions;
  const netProfit = grossProfit - input.adCost - overhead - fulfilment;
  return {
    grossProfit,
    overhead,
    fulfilment,
    netProfit,
    profitMargin: input.revenue > 0 ? netProfit / input.revenue : 0,
    poas: input.adCost > 0 ? grossProfit / input.adCost : 0,
  };
}

/** Clamp/validate a raw cost model from the client. Returns null if unusable. */
export function sanitizeCostModel(raw: unknown): Omit<CostModel, "updatedAt"> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const margin = Number(o.grossMarginPct);
  const overhead = Number(o.monthlyOverhead);
  const perOrder = Number(o.perOrderCost);
  if (!Number.isFinite(margin) || margin <= 0 || margin > 1) return null;
  return {
    grossMarginPct: margin,
    monthlyOverhead: Number.isFinite(overhead) && overhead >= 0 ? overhead : 0,
    perOrderCost: Number.isFinite(perOrder) && perOrder >= 0 ? perOrder : 0,
  };
}
