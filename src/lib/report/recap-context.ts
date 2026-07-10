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

/** Claiming a 12-month total AND a year-over-year delta needs ~2 years of data
 *  (a full current year plus a full prior year to compare). The live sync caps at
 *  SYNC_DAYS (400) and evaluatePeriod halves a short series into equal windows, so
 *  a 300-day gate let a ~200d-vs-200d comparison be narrated as "12 měsíců /
 *  meziročně". The real guard is snap.truncated below; this floor just short-circuits
 *  obviously-too-short series (the sample spine is ~730d and clears it). */
const HISTORY_MIN_DAYS = 700;

/** The 12-month horizon + YoY delta, so the narrative reads the year's trajectory.
 *  "" when the dataset doesn't span roughly a year — i.e. below the day floor OR
 *  when buildSnapshot had to truncate the window (so the "12 months" total and the
 *  "meziročně" delta would both be fabricated from a shorter span). */
export function historyGroundingText(
  data: PerformanceData | undefined,
  locale: SupportedLocale
): string {
  if (!data || data.daily.length < HISTORY_MIN_DAYS) return "";
  const snap = buildSnapshot("12m", "previous", data);
  // Never quote a year's revenue / YoY change the series can't actually cover.
  if (snap.truncated) return "";
  const f = createFormatters(locale);
  return locale === "en"
    ? `Longer horizon (12 months): revenue ${f.fmtCZK(snap.current.revenue)}, ${f.fmtSignedPct(snap.delta.revenue)} vs. the prior year. Read the year's trajectory, not only the last period.`
    : `Delší horizont (12 měsíců): obrat ${f.fmtCZK(snap.current.revenue)}, ${f.fmtSignedPct(snap.delta.revenue)} meziročně. Čti trajektorii roku, ne jen poslední období.`;
}
