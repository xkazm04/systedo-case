/** Grounding lines that deepen the monthly recap beyond period-over-period on the
 *  tenant's own revenue:
 *   - profit: the A3 cost model → the recap can talk TRUE net profit, not just
 *     revenue/ROAS (Robert). Only when a cost model exists.
 *   - history: a longer (12-month) horizon so the narrative reads the year's
 *     trajectory, not only the last window — only when the data actually spans it,
 *     so we never fabricate a year of history.
 *  Pure. Fed through the recap `groundingContext` channel (no LLM fingerprint change). */
import { buildSnapshot } from "@/lib/snapshot";
import { periodProfit, PERIOD_MONTHS } from "@/lib/cost-model/compute";
import type { CostModel } from "@/lib/cost-model/types";
import type { PerformanceData } from "@/lib/types";
import { createFormatters, type SupportedLocale } from "@/lib/format";

/** True net profit after COGS + overhead over the last 30 days, from the saved cost
 *  model. "" when no data or no cost model (recap stays revenue/contribution-based). */
export function profitGroundingText(
  data: PerformanceData | undefined,
  model: CostModel | null,
  locale: SupportedLocale
): string {
  if (!data || !model) return "";
  const snap = buildSnapshot("30d", "previous", data);
  const pp = periodProfit(
    {
      revenue: snap.current.revenue,
      adCost: snap.current.cost,
      conversions: snap.current.conversions,
      months: PERIOD_MONTHS["30d"],
    },
    model
  );
  const f = createFormatters(locale);
  return locale === "en"
    ? `True net profit after costs (30d): ${f.fmtCZK(pp.netProfit)} at ${f.fmtPct(pp.profitMargin, 0)} net margin, margin-aware POAS ${f.fmtMultiple(pp.poas)}. Comment on profit from this, not just revenue/ROAS.`
    : `Skutečný čistý zisk po nákladech (30 dní): ${f.fmtCZK(pp.netProfit)} při čisté marži ${f.fmtPct(pp.profitMargin, 0)}, POAS zohledňující marži ${f.fmtMultiple(pp.poas)}. Zisk komentuj podle tohoto, ne jen podle obratu/ROAS.`;
}

/** A ~year of history spans this many daily points; below it we don't claim a
 *  12-month trend (honest — the sample spine is shorter). */
const HISTORY_MIN_DAYS = 300;

/** The 12-month horizon + YoY delta, so the narrative reads the year's trajectory.
 *  "" when the dataset doesn't span roughly a year. */
export function historyGroundingText(
  data: PerformanceData | undefined,
  locale: SupportedLocale
): string {
  if (!data || data.daily.length < HISTORY_MIN_DAYS) return "";
  const snap = buildSnapshot("12m", "previous", data);
  const f = createFormatters(locale);
  return locale === "en"
    ? `Longer horizon (12 months): revenue ${f.fmtCZK(snap.current.revenue)}, ${f.fmtSignedPct(snap.delta.revenue)} vs. the prior year. Read the year's trajectory, not only the last period.`
    : `Delší horizont (12 měsíců): obrat ${f.fmtCZK(snap.current.revenue)}, ${f.fmtSignedPct(snap.delta.revenue)} meziročně. Čti trajektorii roku, ne jen poslední období.`;
}
