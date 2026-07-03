/** CAC → LTV — cohort economics. Project-type-aware framing: e-shop projects read
 *  customer / repeat-purchase wording, app/SaaS projects read signup / retention
 *  wording (the cohort math is identical). Server component. */
import { Bulb, TrendUp, TrendDown } from "@/components/icons";
import NextSteps from "@/components/app/NextSteps";
import LtvReportButton from "@/components/app/modules/LtvReportButton";
import LtvDiagnosisPanel from "@/components/app/modules/LtvDiagnosisPanel";
import LtvProjectionPanel from "@/components/app/modules/LtvProjectionPanel";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import Sparkline from "@/components/charts/Sparkline";
import { cohortTrend } from "@/lib/ltv/compute";
import type { CohortMetrics, LtvSummary, TrendDirection } from "@/lib/ltv/compute";
import type { Cohort } from "@/lib/ltv/sample";
import { FALLBACK_CHANNEL_COLOR, LTV_CHANNEL_COLORS } from "@/lib/ltv/sample";

const T = {
  cs: {
    blendedCac: "Blended CAC",
    blendedCacSub: "vč. organické / přímé",
    paidCac: "Placené CAC",
    paidCacSub: "{count} placených {unit}",
    ltvCac: "LTV : CAC",
    ltvCacTarget: "cíl ≥ 3,0×",
    payback: "Návratnost",
    healthyInsight: "Jednotková ekonomika je zdravá (LTV:CAC ≥ 3). Akvizici lze škálovat — optimalizujte na dobu návratnosti, ne na {scaleOn}.",
    unhealthyInsight: "LTV:CAC je pod cílem 3×. Než přidáte rozpočet, zlepšete {improve} nebo snižte CAC — jinak rychlejší akvizice prohlubuje ztrátu.",
    cohortTableTitle: "Kohorty měsíc po měsíci",
    trendSub: "{from} → {to}: CAC {cacDelta}, LTV {ltvDelta}, LTV:CAC {ltvCacDelta}",
    trendLabel: "Trend:",
    improving: "zlepšuje se",
    worsening: "zhoršuje se",
    flat: "beze změny",
    colCohort: "Kohorta",
    colPayback: "Návratnost",
    paybackMonths: "{n} měs.",
    paybackOver: "> 12 měs.",
    legendObserved: "pozorováno",
    legendModelled: "modelováno",
    ltvNote: "LTV počítáno na {months} měsíců s extrapolací {curve}. {seam}",
    channelTableTitle: "CAC a návratnost podle akvizičního kanálu",
    channelTableDesc: "Placené i organické kanály z kohort s rozpadem. LTV:CAC sdílí hodnotu zákazníka kohorty.",
    freeTag: "zdarma",
    channelFooter: "CAC je vlastní útrata kanálu na {unitSingular}; organické / přímé kanály mají nulové akviziční náklady, proto se nezapočítávají do placené CAC.",
    nextStepLabel: "Přesunout rozpočet do kanálů s rychlou návratností",
    nextStepHint: "Přidat do kanálů s nejlepší LTV:CAC a nejkratší dobou návratnosti",
    sparklineAriaLabel: "Retenční křivka kohorty {month}: {observed} pozorovaných měsíců, do M{last} modelováno na {pct}",
    // project-type labels — eshop
    eshopUnit: "Zákazníci",
    eshopUnitLower: "zákazníků",
    eshopUnitSingular: "zákazníka",
    eshopM3: "M3 opakování",
    eshopCurve: "Křivka opakování",
    eshopCurveLower: "křivky opakování",
    eshopImprove: "opakované nákupy / hodnotu objednávky",
    eshopScaleOn: "počet objednávek",
    eshopSeam: "Seam: napojit objednávky a zákazníky z e-shopu / CRM (Shoptet, Shopify, GA4 e-commerce).",
    // project-type labels — saas/app
    saasUnit: "Registrace",
    saasUnitLower: "registrací",
    saasUnitSingular: "registraci",
    saasM3: "M3 retence",
    saasCurve: "Retenční křivka",
    saasCurveLower: "retenční křivky",
    saasImprove: "retenci / ARPU",
    saasScaleOn: "počet registrací",
    saasSeam: "Seam: napojit události z product analytics (Segment / PostHog / Stripe).",
  },
  en: {
    blendedCac: "Blended CAC",
    blendedCacSub: "incl. organic / direct",
    paidCac: "Paid CAC",
    paidCacSub: "{count} paid {unit}",
    ltvCac: "LTV : CAC",
    ltvCacTarget: "target ≥ 3.0×",
    payback: "Payback",
    healthyInsight: "Unit economics are healthy (LTV:CAC ≥ 3). Acquisition can scale — optimise for payback period, not {scaleOn}.",
    unhealthyInsight: "LTV:CAC is below the 3× target. Before adding budget, improve {improve} or lower CAC — otherwise faster acquisition deepens the loss.",
    cohortTableTitle: "Cohorts month by month",
    trendSub: "{from} → {to}: CAC {cacDelta}, LTV {ltvDelta}, LTV:CAC {ltvCacDelta}",
    trendLabel: "Trend:",
    improving: "improving",
    worsening: "worsening",
    flat: "flat",
    colCohort: "Cohort",
    colPayback: "Payback",
    paybackMonths: "{n} mo.",
    paybackOver: "> 12 mo.",
    legendObserved: "observed",
    legendModelled: "modelled",
    ltvNote: "LTV calculated over {months} months with {curve} extrapolation. {seam}",
    channelTableTitle: "CAC and payback by acquisition channel",
    channelTableDesc: "Paid and organic channels from cohorts with breakdown. LTV:CAC shares the cohort's customer value.",
    freeTag: "free",
    channelFooter: "CAC is the channel's own spend per {unitSingular}; organic / direct channels have zero acquisition cost and are excluded from paid CAC.",
    nextStepLabel: "Shift budget to channels with fast payback",
    nextStepHint: "Increase spend in channels with the best LTV:CAC and shortest payback",
    sparklineAriaLabel: "Retention curve for cohort {month}: {observed} observed months, modelled to M{last} at {pct}",
    // project-type labels — eshop
    eshopUnit: "Customers",
    eshopUnitLower: "customers",
    eshopUnitSingular: "customer",
    eshopM3: "M3 repeat",
    eshopCurve: "Repeat curve",
    eshopCurveLower: "repeat curve",
    eshopImprove: "repeat purchases / order value",
    eshopScaleOn: "order count",
    eshopSeam: "Seam: connect orders and customers from e-shop / CRM (Shoptet, Shopify, GA4 e-commerce).",
    // project-type labels — saas/app
    saasUnit: "Sign-ups",
    saasUnitLower: "sign-ups",
    saasUnitSingular: "sign-up",
    saasM3: "M3 retention",
    saasCurve: "Retention curve",
    saasCurveLower: "retention curve",
    saasImprove: "retention / ARPU",
    saasScaleOn: "sign-up count",
    saasSeam: "Seam: connect events from product analytics (Segment / PostHog / Stripe).",
  },
} as const;

function ratioTone(r: number): string {
  if (r >= 3) return "text-positive";
  if (r >= 1) return "text-navy-800";
  return "text-negative";
}

/** Render an absolute delta as a signed percent of its base ("+12.4 %"), falling
 *  back to "—" when the base is zero (no meaningful relative change). */
function fmtSignedPctSafe(fmtSignedPct: (v: number) => string, delta: number, base: number): string {
  return base !== 0 ? fmtSignedPct(delta / base) : "—";
}

/** Blended per-channel economics across all cohorts that carry a breakdown:
 *  spend-weighted CAC, signup-weighted payback, and the resulting LTV per signup. */
interface BlendedChannel {
  channel: string;
  spend: number;
  signups: number;
  paid: boolean;
  cac: number;
  ltvCac: number;
  /** signup-weighted average payback month, or null when never recovered */
  paybackMonth: number | null;
}

function blendChannels(rows: CohortMetrics[]): BlendedChannel[] {
  // Accumulate per channel: spend, signups, LTV value (ltv-per-user × signups),
  // and a signup-weighted payback (only over cohorts where it recovers).
  const acc = new Map<
    string,
    { spend: number; signups: number; paid: boolean; ltvValue: number; paybackNum: number; paybackDen: number }
  >();
  for (const r of rows) {
    const ltvPerUser = r.ltv;
    for (const m of r.channelMetrics) {
      const a =
        acc.get(m.channel) ?? { spend: 0, signups: 0, paid: m.paid, ltvValue: 0, paybackNum: 0, paybackDen: 0 };
      a.spend += m.spend;
      a.signups += m.signups;
      a.ltvValue += ltvPerUser * m.signups;
      if (m.paybackMonth != null) {
        a.paybackNum += m.paybackMonth * m.signups;
        a.paybackDen += m.signups;
      }
      acc.set(m.channel, a);
    }
  }
  return [...acc.entries()]
    .map(([channel, a]) => {
      const cac = a.signups > 0 ? a.spend / a.signups : 0;
      const ltvPerSignup = a.signups > 0 ? a.ltvValue / a.signups : 0;
      return {
        channel,
        spend: a.spend,
        signups: a.signups,
        paid: a.paid,
        cac,
        ltvCac: cac > 0 ? ltvPerSignup / cac : 0,
        paybackMonth: a.paybackDen > 0 ? a.paybackNum / a.paybackDen : null,
      } satisfies BlendedChannel;
    })
    .sort((x, y) => y.spend - x.spend);
}

function channelColor(channel: string): string {
  return LTV_CHANNEL_COLORS[channel] ?? FALLBACK_CHANNEL_COLOR;
}

const SPARK_W = 96;
const SPARK_H = 28;

/** Retention sparkline for one cohort over the shared chart primitive: the
 *  observed months render solid, the extrapolated tail dashed (`dashFrom`), so
 *  the modeled part of the decay reads as an estimate, not measured data. The
 *  fixed `domain` [0, 1] keeps curves comparable across cohorts. */
function SurvivalSpark({ row, ariaLabel }: { row: CohortMetrics; ariaLabel: string }) {
  const n = row.survival.length;
  const observed = Math.max(0, Math.min(row.observedMonths, n));
  if (n < 2 || observed === 0) return <span className="text-muted">—</span>;
  return (
    <Sparkline
      values={row.survival}
      width={SPARK_W}
      height={SPARK_H}
      area={false}
      stroke="var(--color-brand-accent)"
      strokeWidth={1.75}
      domain={[0, 1]}
      dashFrom={observed - 1}
      dot
      className="overflow-visible"
      label={ariaLabel}
    />
  );
}

export default async function LtvModule({
  rows,
  summary,
  cohorts,
  eshop = false,
}: {
  rows: CohortMetrics[];
  summary: LtvSummary;
  /** raw cohorts for the interactive horizon/churn projection (feature #3) */
  cohorts: Cohort[];
  /** e-shop project → customer / repeat-purchase framing instead of signup / retention */
  eshop?: boolean;
}) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  // Project-type-aware labels.
  const L = eshop
    ? {
        unit: t("eshopUnit"),
        unitLower: t("eshopUnitLower"),
        unitSingular: t("eshopUnitSingular"),
        m3: t("eshopM3"),
        curve: t("eshopCurve"),
        curveLower: t("eshopCurveLower"),
        improve: t("eshopImprove"),
        scaleOn: t("eshopScaleOn"),
        seam: t("eshopSeam"),
      }
    : {
        unit: t("saasUnit"),
        unitLower: t("saasUnitLower"),
        unitSingular: t("saasUnitSingular"),
        m3: t("saasM3"),
        curve: t("saasCurve"),
        curveLower: t("saasCurveLower"),
        improve: t("saasImprove"),
        scaleOn: t("saasScaleOn"),
        seam: t("saasSeam"),
      };

  const TREND_META: Record<TrendDirection, { label: string; tone: string; Icon: typeof TrendUp }> = {
    improving: { label: t("improving"), tone: "text-positive", Icon: TrendUp },
    worsening: { label: t("worsening"), tone: "text-negative", Icon: TrendDown },
    flat: { label: t("flat"), tone: "text-muted", Icon: TrendUp },
  };

  const healthy = summary.avgLtvCac >= 3;
  const channels = blendChannels(rows);
  const maxRatio = Math.max(...channels.map((x) => x.ltvCac), 1);
  const trend = cohortTrend(rows);
  const TrendIcon = trend ? TREND_META[trend.direction].Icon : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("blendedCac")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtCZK(summary.blendedCac)}</p>
          <p className="mt-1 text-xs text-muted">{t("blendedCacSub")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("paidCac")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtCZK(summary.paidCac)}</p>
          <p className="mt-1 text-xs text-muted">{t("paidCacSub", { count: fmt.fmtInt(summary.paidSignups), unit: L.unitLower })}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("ltvCac")}</p>
          <p className={`tnum mt-1.5 text-2xl font-semibold tracking-tight ${ratioTone(summary.avgLtvCac)}`}>
            {fmt.fmtMultiple(summary.avgLtvCac)}
          </p>
          <p className="mt-1 text-xs text-muted">{t("ltvCacTarget")}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("payback")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {summary.avgPayback != null ? t("paybackMonths", { n: fmt.fmtDecimal(summary.avgPayback, 1) }) : "—"}
          </p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3.5">
        <Bulb width={18} height={18} className={`mt-0.5 shrink-0 ${healthy ? "text-positive" : "text-coral-600"}`} />
        <p className="text-sm leading-relaxed text-navy-700">
          {healthy
            ? t("healthyInsight", { scaleOn: L.scaleOn })
            : t("unhealthyInsight", { improve: L.improve })}
        </p>
      </div>

      <LtvDiagnosisPanel rows={rows} summary={summary} eshop={eshop} />

      <LtvProjectionPanel cohorts={cohorts} paidCac={summary.paidCac} />

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy-800">{t("cohortTableTitle")}</p>
            {trend && (
              <p className="mt-0.5 text-xs text-muted">
                {t("trendSub", {
                  from: trend.fromMonth,
                  to: trend.toMonth,
                  cacDelta: fmtSignedPctSafe(fmt.fmtSignedPct, trend.cacDelta, rows[0]!.cac),
                  ltvDelta: fmtSignedPctSafe(fmt.fmtSignedPct, trend.ltvDelta, rows[0]!.ltv),
                  ltvCacDelta: trend.ltvCacDeltaPct != null ? fmt.fmtSignedPct(trend.ltvCacDeltaPct) : "—",
                })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {trend && TrendIcon && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium ${TREND_META[trend.direction].tone}`}
              >
                <TrendIcon width={14} height={14} className="shrink-0" />
                {t("trendLabel")} {TREND_META[trend.direction].label}
              </span>
            )}
            <LtvReportButton rows={rows} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colCohort")}</th>
                <th className="px-4 py-3 text-right font-medium">{L.unit}</th>
                <th className="px-4 py-3 text-right font-medium">CAC</th>
                <th className="px-4 py-3 text-right font-medium">{L.m3}</th>
                <th className="px-4 py-3 text-center font-medium">{L.curve}</th>
                <th className="px-4 py-3 text-right font-medium">LTV</th>
                <th className="px-4 py-3 text-right font-medium">LTV:CAC</th>
                <th className="px-4 py-3 text-right font-medium">{t("colPayback")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const lastMonth = r.survival.length;
                const lastPct = fmt.fmtPct(r.survival[r.survival.length - 1] ?? 0);
                return (
                  <tr key={r.month} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-800">{r.month}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(r.signups)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZK(r.cac)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(r.m3)}</td>
                    <td className="px-4 py-3">
                      <span className="flex justify-center">
                        <SurvivalSpark
                          row={r}
                          ariaLabel={t("sparklineAriaLabel", {
                            month: r.month,
                            observed: r.observedMonths,
                            last: lastMonth - 1,
                            pct: lastPct,
                          })}
                        />
                      </span>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZK(r.ltv)}</td>
                    <td className={`tnum px-4 py-3 text-right font-semibold ${ratioTone(r.ltvCac)}`}>
                      {fmt.fmtMultiple(r.ltvCac)}
                    </td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">
                      {r.paybackMonth != null
                        ? t("paybackMonths", { n: r.paybackMonth })
                        : t("paybackOver")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line px-5 py-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 18 8" width={18} height={8} aria-hidden="true">
              <line x1={0} y1={4} x2={18} y2={4} stroke="var(--color-brand-accent)" strokeWidth={1.75} />
            </svg>
            {t("legendObserved")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg viewBox="0 0 18 8" width={18} height={8} aria-hidden="true">
              <line
                x1={0}
                y1={4}
                x2={18}
                y2={4}
                stroke="var(--color-brand-accent)"
                strokeWidth={1.75}
                strokeOpacity={0.45}
                strokeDasharray="2 2"
              />
            </svg>
            {t("legendModelled")}
          </span>
          <span>
            {t("ltvNote", { months: 12, curve: L.curveLower, seam: L.seam })}
          </span>
        </div>
      </div>

      {channels.length > 0 && (
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-3.5">
            <p className="text-sm font-semibold text-navy-800">{t("channelTableTitle")}</p>
            <p className="mt-0.5 text-xs text-muted">
              {t("channelTableDesc")}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">{t("colCohort")}</th>
                  <th className="px-4 py-3 text-right font-medium">{L.unit}</th>
                  <th className="px-4 py-3 text-right font-medium">CAC</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colPayback")}</th>
                  <th className="px-4 py-3 text-right font-medium">LTV:CAC</th>
                </tr>
              </thead>
              <tbody>
                {channels.map((c) => (
                    <tr key={c.channel} className="border-b border-line/70 last:border-0">
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2 font-medium text-navy-800">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: channelColor(c.channel) }}
                          />
                          {c.channel}
                          {!c.paid && (
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                              {t("freeTag")}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(c.signups)}</td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">
                        {c.paid ? fmt.fmtCZK(c.cac) : "—"}
                      </td>
                      <td className="tnum px-4 py-3 text-right text-navy-700">
                        {c.paybackMonth != null
                          ? t("paybackMonths", { n: fmt.fmtDecimal(c.paybackMonth, 1) })
                          : t("paybackOver")}
                      </td>
                      <td className="px-4 py-3">
                        <span className="flex items-center justify-end gap-2">
                          <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-line sm:block">
                            <span
                              className="block h-full rounded-full bg-brand-accent"
                              style={{ width: `${Math.min(100, (c.ltvCac / maxRatio) * 100)}%` }}
                            />
                          </span>
                          <span className={`tnum font-semibold ${ratioTone(c.ltvCac)}`}>
                            {c.ltvCac > 0 ? fmt.fmtMultiple(c.ltvCac) : "—"}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-5 py-3 text-xs text-muted">
            {t("channelFooter", { unitSingular: L.unitSingular })}
          </div>
        </div>
      )}

      <NextSteps
        steps={[
          {
            to: "kampane",
            label: t("nextStepLabel"),
            hint: t("nextStepHint"),
          },
        ]}
      />
    </div>
  );
}
