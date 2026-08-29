/** Grounding lines that deepen the monthly recap beyond period-over-period on the
 *  tenant's own revenue:
 *   - profit: the A3 cost model → the recap can talk TRUE net profit, not just
 *     revenue/ROAS (Robert). Only when a cost model exists.
 *   - history: a longer (12-month) horizon so the narrative reads the year's
 *     trajectory, not only the last window — only when the data actually spans it,
 *     so we never fabricate a year of history.
 *  Pure. Fed through the recap `groundingContext` channel (no LLM fingerprint change). */
import { buildSnapshot } from "@/lib/snapshot";
import { scoredAdviceOutcomes, type AdviceLedger, type AdviceOutcomeStatus } from "@/lib/advice/ledger";
import { periodProfit, PERIOD_MONTHS } from "@/lib/cost-model/compute";
import type { CostModel } from "@/lib/cost-model/types";
import type { PerformanceData } from "@/lib/types";
import { analysisPeriodLabel, type AnalysisPeriod } from "@/lib/ai-types";
import { createFormatters, type SupportedLocale } from "@/lib/format";

/** Net profit of a window under the cost model — the shared computation both the
 *  profit and history grounding reuse (blended-margin cost-model engine). */
function windowNetProfit(
  totals: { revenue: number; cost: number; conversions: number },
  months: number,
  model: CostModel
) {
  return periodProfit(
    { revenue: totals.revenue, adCost: totals.cost, conversions: totals.conversions, months },
    model
  );
}

/** Trend direction of net profit vs the prior equal-length window. A ±3 % dead
 *  band keeps a flat account from being narrated as a swing. */
function profitTrendWord(current: number, previous: number, locale: SupportedLocale): string {
  const delta = previous !== 0 ? (current - previous) / Math.abs(previous) : 0;
  const up = locale === "en" ? "rising" : "rostoucí";
  const down = locale === "en" ? "falling" : "klesající";
  const flat = locale === "en" ? "stable" : "stabilní";
  return delta > 0.03 ? up : delta < -0.03 ? down : flat;
}

/** True net profit after COGS + overhead over the ANALYZED window (threaded from
 *  the recap period, not a hardcoded 30 days), plus the net-profit trend direction
 *  vs the prior equal window so the narrative reads the trajectory, not a point.
 *  "" when no data or no cost model (recap stays revenue/contribution-based). */
export function profitGroundingText(
  data: PerformanceData | undefined,
  model: CostModel | null,
  locale: SupportedLocale,
  period: AnalysisPeriod = "30d"
): string {
  if (!data || !model) return "";
  const snap = buildSnapshot(period, "previous", data);
  const months = PERIOD_MONTHS[period];
  const pp = windowNetProfit(snap.current, months, model);
  const f = createFormatters(locale);
  const label = analysisPeriodLabel(period, locale);
  // Only name a trend when the prior window is a genuine equal-length baseline —
  // a truncated snapshot halved a short series, so its "previous" is fabricated.
  const trend = snap.truncated
    ? ""
    : profitTrendWord(pp.netProfit, windowNetProfit(snap.previous, months, model).netProfit, locale);
  return locale === "en"
    ? `True net profit after costs (${label}): ${f.fmtCZK(pp.netProfit)} at ${f.fmtPct(pp.profitMargin, 0)} net margin, margin-aware POAS ${f.fmtMultiple(pp.poas)}${trend ? `; net-profit trend ${trend} vs. the prior window` : ""}. Comment on profit from this, not just revenue/ROAS.`
    : `Skutečný čistý zisk po nákladech (${label}): ${f.fmtCZK(pp.netProfit)} při čisté marži ${f.fmtPct(pp.profitMargin, 0)}, POAS zohledňující marži ${f.fmtMultiple(pp.poas)}${trend ? `; trend čistého zisku ${trend} vs. předchozí období` : ""}. Zisk komentuj podle tohoto, ne jen podle obratu/ROAS.`;
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
  locale: SupportedLocale,
  model: CostModel | null = null
): string {
  if (!data || data.daily.length < HISTORY_MIN_DAYS) return "";
  const snap = buildSnapshot("12m", "previous", data);
  // Never quote a year's revenue / YoY change the series can't actually cover.
  if (snap.truncated) return "";
  const f = createFormatters(locale);
  const base =
    locale === "en"
      ? `Longer horizon (12 months): revenue ${f.fmtCZK(snap.current.revenue)}, ${f.fmtSignedPct(snap.delta.revenue)} vs. the prior year. Read the year's trajectory, not only the last period.`
      : `Delší horizont (12 měsíců): obrat ${f.fmtCZK(snap.current.revenue)}, ${f.fmtSignedPct(snap.delta.revenue)} meziročně. Čti trajektorii roku, ne jen poslední období.`;
  // With a cost model the year's trajectory can be read on TRUE net profit, not
  // just revenue — a YoY net-profit line the revenue-only fallback never had. The
  // same non-truncated 12m/prior-year windows the revenue line already vouched for.
  if (!model) return base;
  const months = PERIOD_MONTHS["12m"];
  const curNet = windowNetProfit(snap.current, months, model).netProfit;
  const prevNet = windowNetProfit(snap.previous, months, model).netProfit;
  const yoy = prevNet !== 0 ? (curNet - prevNet) / Math.abs(prevNet) : 0;
  const netLine =
    locale === "en"
      ? ` Net profit after costs: ${f.fmtCZK(curNet)}, ${f.fmtSignedPct(yoy)} YoY.`
      : ` Čistý zisk po nákladech: ${f.fmtCZK(curNet)}, ${f.fmtSignedPct(yoy)} meziročně.`;
  return base + netLine;
}

/** How many scored outcomes the recap grounding quotes. The narrative wants the
 *  shape of the loop, not a transcript of it. */
const ADVICE_GROUNDING_LIMIT = 4;

const ADVICE_VERDICT: Record<AdviceOutcomeStatus, { cs: string; en: string }> = {
  improved: { cs: "zlepšeno", en: "improved" },
  unchanged: { cs: "beze změny", en: "unchanged" },
  worse: { cs: "zhoršeno", en: "worse" },
};

/** WP W3-A — what the app's OWN advice did. Each line is a recommendation that was
 *  actually shown to the operator, whose signal has since gone quiet, with the signed
 *  move of the metric the signal itself reported (first sighting → last sighting).
 *
 *  "" when nothing is scored — which is the common case and must stay byte-identical
 *  to the pre-W3-A prompt. It is also the case for a project whose advice is entirely
 *  sample-derived: those records carry no outcome at all (see advice/ledger.ts), so a
 *  demo/unconnected project can never have the recap narrate a fixture as a result.
 *  User-prompt only (rides `groundingContext`) — no LLM fingerprint moves. Pure. */
export function adviceOutcomesGroundingText(
  ledger: AdviceLedger | null | undefined,
  locale: SupportedLocale
): string {
  const scored = scoredAdviceOutcomes(ledger).slice(0, ADVICE_GROUNDING_LIMIT);
  if (scored.length === 0) return "";
  const f = createFormatters(locale);
  const en = locale === "en";
  // Quotation marks follow the locale, like every other quoted string in the app:
  // Czech uses low-high „…“, English uses “…”.
  const [open, close] = en ? ["“", "”"] : ["„", "“"];
  const items = scored
    .map((r) => {
      const verdict = ADVICE_VERDICT[r.outcome!.status][en ? "en" : "cs"];
      const delta = r.outcome!.deltaPct;
      const measured =
        r.snapshot && delta !== null && Number.isFinite(delta)
          ? ` (${r.snapshot.key} ${f.fmtSignedPct(delta)})`
          : "";
      return `${open}${r.title}${close} — ${verdict}${measured}`;
    })
    .join("; ");
  return en
    ? `Outcomes of the advice this app already gave: ${items}. These are measured on the signal's own metric between the first and last time the recommendation was shown. Say whether the advice moved the numbers; never claim a result that is not in this list.`
    : `Výsledky rad, které aplikace už dala: ${items}. Měřeno na vlastní metrice signálu mezi prvním a posledním zobrazením doporučení. Napiš, zda se rady promítly do čísel; nikdy netvrď výsledek, který v tomto seznamu není.`;
}
