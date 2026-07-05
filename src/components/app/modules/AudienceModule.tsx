/** Publikum & výnos — audience funnel, segments and revenue. Server component. */
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { Bulb, Target, TrendUp, TrendDown } from "@/components/icons";
import { Pill } from "@/components/ui";
import Sparkline from "@/components/charts/Sparkline";
import NextSteps from "@/components/app/NextSteps";
import {
  audienceSummary,
  goalProgress,
  rateCard,
  revenueMix,
  segmentRevenue,
  sourceAttribution,
  trend,
} from "@/lib/audience/compute";
import type { Trend } from "@/lib/audience/compute";
import type {
  AudienceFunnel,
  AudienceGoals,
  MonthlyPoint,
  RevenueStream,
  Segment,
  SubscriberSource,
} from "@/lib/audience/sample";

const T = {
  cs: {
    subscribers: "Odběratelé",
    subConversion: "konverze {pct} z návštěv",
    active: "Aktivní",
    activeCount: "{n} odběratelů",
    monthlyRevenue: "Měsíční výnos",
    arpu: "ARPU",
    arpu_sub: "na aktivního odběratele",
    segments: "Segmenty",
    segSubscribers: "Odběratelé",
    segOpenRate: "Open rate",
    segRpm: "RPM",
    segRevEst: "Odhad výnosu",
    revenueSources: "Zdroje výnosu",
    seam: "Seam: napojit ESP (newsletter), analytiku a data o sponzoringu/reklamě.",
    subGrowthTitle: "Růst odběratelů",
    rpmTrendTitle: "Trend RPM",
    revenueMix: "Skladba výnosu",
    diversification: "Diverzifikace {pct} · největší zdroj {top}",
    revMixAria: "100% skládaný pruh skladby výnosu",
    concentratedWarning: "{pct} výnosu závisí na jednom zdroji ({source}) — diverzifikujte, ať jeden výpadek neohrozí celý výnos.",
    diversified: "Výnos je rozložený mezi více zdrojů — žádný jednotlivý kanál není kritická závislost.",
    sponsorPrice: "Cena za sponzoring",
    sponsorDesc: "Odhad z aktivního dosahu × open rate × benchmark CPM ({floor}–{ceil} Kč / 1 000 otevření)",
    pricePerSlot: "Cena za slot",
    pricePerSlotMid: "≈ {mid} střed",
    pricePer1000: "Cena / 1 000 otevření",
    opensPerSend: "{n} otevření / rozeslání",
    segOpenRateCol: "Open rate",
    segPremium: "Prémie",
    premiumNote: "Prémie je odchylka open rate segmentu od váženého průměru — cílené sloty lze ocenit výš.",
    subSources: "Zdroje odběratelů",
    subSourcesDesc: "{n} nových odběratelů · průměrná cena za získání {cost} (placené kanály)",
    lowestRetention: "Nejnižší retence: {src}",
    channel: "Kanál",
    newSubs: "Noví odběratelé",
    share: "Podíl",
    costPerSub: "Cena / odběratel",
    retention30: "Retence 30 dní",
    organicNote: "Organické kanály nemají cenu za získání; průměr počítá jen z placených zdrojů.",
    goals: "Cíle",
    goalSubscribers: "Odběratelé",
    goalRevenue: "Měsíční výnos",
    goalMet: "Cíl splněn",
    goalEta: "{pct} k cíli · odhad {n} měs. při růstu {growth}",
    goalNoEta: "{pct} k cíli · bez růstu nelze odhadnout ETA",
    forecastLine: "Prognóza příští měsíc: {val} · 3měsíční průměr {avg}",
    sparkLabel: "{title}: posledních {n} měsíců",
    nextStepBoost: "Posílit nejsilnější kanál",
    nextStepBoostHint: "Atribuce podle kanálu a varianty obsahu v Distribuci",
    nextStepPlan: "Naplánovat obsah k cílům růstu",
    nextStepPlanHint: "Propojit cíle odběratelů a výnosu s plánem obsahu",
  },
  en: {
    subscribers: "Subscribers",
    subConversion: "{pct} conversion from visits",
    active: "Active",
    activeCount: "{n} subscribers",
    monthlyRevenue: "Monthly revenue",
    arpu: "ARPU",
    arpu_sub: "per active subscriber",
    segments: "Segments",
    segSubscribers: "Subscribers",
    segOpenRate: "Open rate",
    segRpm: "RPM",
    segRevEst: "Est. revenue",
    revenueSources: "Revenue streams",
    seam: "Seam: connect ESP (newsletter), analytics, and sponsorship/ad data.",
    subGrowthTitle: "Subscriber growth",
    rpmTrendTitle: "RPM trend",
    revenueMix: "Revenue mix",
    diversification: "{pct} diversification · largest source {top}",
    revMixAria: "100% stacked revenue-mix bar",
    concentratedWarning: "{pct} of revenue depends on one source ({source}) — diversify so a single loss doesn't threaten total revenue.",
    diversified: "Revenue is spread across multiple sources — no single channel is a critical dependency.",
    sponsorPrice: "Sponsorship pricing",
    sponsorDesc: "Estimate from active reach × open rate × benchmark CPM ({floor}–{ceil} / 1,000 opens)",
    pricePerSlot: "Price per slot",
    pricePerSlotMid: "≈ {mid} mid",
    pricePer1000: "Price / 1,000 opens",
    opensPerSend: "{n} opens / send",
    segOpenRateCol: "Open rate",
    segPremium: "Premium",
    premiumNote: "Premium is the segment's open-rate deviation from the weighted average — targeted slots can be priced higher.",
    subSources: "Subscriber sources",
    subSourcesDesc: "{n} new subscribers · avg acquisition cost {cost} (paid channels)",
    lowestRetention: "Lowest retention: {src}",
    channel: "Channel",
    newSubs: "New subscribers",
    share: "Share",
    costPerSub: "Cost / subscriber",
    retention30: "30-day retention",
    organicNote: "Organic channels have no acquisition cost; the average counts paid sources only.",
    goals: "Goals",
    goalSubscribers: "Subscribers",
    goalRevenue: "Monthly revenue",
    goalMet: "Goal met",
    goalEta: "{pct} to goal · est. {n} mo. at {growth} growth",
    goalNoEta: "{pct} to goal · can't estimate ETA without growth",
    forecastLine: "Next-month forecast: {val} · 3-month avg {avg}",
    sparkLabel: "{title}: last {n} months",
    nextStepBoost: "Boost the strongest channel",
    nextStepBoostHint: "Attribution by channel and content variant in Distribution",
    nextStepPlan: "Plan content toward growth goals",
    nextStepPlanHint: "Link subscriber and revenue goals to the content plan",
  },
} as const;

/** Benchmark CPM band (price per 1000 opens, CZK) for the rate-card estimate. */
const CPM_BAND = { cpmFloor: 280, cpmCeil: 520 };

const SPARK_W = 120;
const SPARK_H = 32;

/** Compact inline sparkline for a short monthly series over the shared chart
 *  primitive (min-max scaling, last-point dot). Only the "—" empty state for
 *  sub-2-point series stays local. */
function MiniSpark({ series, label }: { series: number[]; label: string }) {
  if (series.length < 2) return <span className="text-sm text-muted">—</span>;
  return (
    <Sparkline
      values={series}
      width={SPARK_W}
      height={SPARK_H}
      area={false}
      stroke="var(--color-brand-accent)"
      strokeWidth={1.75}
      dot
      className="overflow-visible"
      label={label}
    />
  );
}

/** A compact "trend" card: a sparkline, the current value, a MoM delta pill and a
 *  one-month forecast line. Module-scope (not created during render); `t`/`fmt`
 *  and a `fmtValue` for the card's own units are passed in. */
function TrendCard({
  title,
  trendData,
  fmtValue,
  t,
  fmt,
}: {
  title: string;
  trendData: Trend;
  fmtValue: (n: number) => string;
  t: Awaited<ReturnType<typeof getT<keyof typeof T.cs>>>;
  fmt: Awaited<ReturnType<typeof getServerFormatters>>;
}) {
  const up = trendData.momGrowth != null && trendData.momGrowth >= 0;
  const DeltaIcon = up ? TrendUp : TrendDown;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmtValue(trendData.latest)}
          </p>
        </div>
        {trendData.momGrowth != null && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2 py-1 text-xs font-medium ${
              up ? "text-positive" : "text-negative"
            }`}
          >
            <DeltaIcon width={13} height={13} className="shrink-0" />
            {fmt.fmtSignedPct(trendData.momGrowth)}
          </span>
        )}
      </div>
      <div className="mt-3">
        <MiniSpark series={trendData.series} label={t("sparkLabel", { title, n: trendData.series.length })} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {t("forecastLine", { val: fmtValue(trendData.forecast), avg: fmtValue(trendData.movingAvg3) })}
      </p>
    </div>
  );
}

export default async function AudienceModule({
  funnel,
  segments,
  revenue,
  subscriberSources,
  subscriberHistory,
  rpmHistory,
  goals,
}: {
  funnel: AudienceFunnel;
  segments: Segment[];
  revenue: RevenueStream[];
  subscriberSources: SubscriberSource[];
  subscriberHistory?: MonthlyPoint[];
  rpmHistory?: MonthlyPoint[];
  goals?: AudienceGoals;
}) {
  const fmt = await getServerFormatters();
  const t = await getT(T);

  const s = audienceSummary(funnel, revenue);
  const maxStream = Math.max(...revenue.map((r) => r.amount), 1);
  const attribution = sourceAttribution(subscriberSources);
  const maxShare = Math.max(...attribution.rows.map((r) => r.share), 0.0001);

  const mix = revenueMix(revenue);
  const card = rateCard(funnel, segments, CPM_BAND);

  const subSeries = (subscriberHistory ?? []).map((p) => p.value);
  const rpmSeries = (rpmHistory ?? []).map((p) => p.value);
  const subTrend = subSeries.length > 0 ? trend(subSeries) : null;
  const rpmTrend = rpmSeries.length > 0 ? trend(rpmSeries) : null;

  // Goal ETA uses the subscriber MoM growth where available; falls back to 0.
  const subGrowth = subTrend?.momGrowth ?? 0;
  const goalsProgress = goals ? goalProgress(funnel, s, goals, subGrowth) : null;

  return (
    <div className="stagger space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("subscribers")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtInt(funnel.subscribers)}</p>
          <p className="mt-1 text-xs text-muted">{t("subConversion", { pct: fmt.fmtPct(s.subRate) })}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("active")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtPct(s.activeRate)}</p>
          <p className="mt-1 text-xs text-muted">{t("activeCount", { n: fmt.fmtInt(funnel.activeSubscribers) })}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("monthlyRevenue")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtCZKCompact(s.monthlyRevenue)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("arpu")}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-brand-accent">{fmt.fmtCZK(s.arpu)}</p>
          <p className="mt-1 text-xs text-muted">{t("arpu_sub")}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* segments */}
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-base font-semibold text-navy-800">{t("segments")}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">{t("segments")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("segSubscribers")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("segOpenRate")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("segRpm")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("segRevEst")}</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => (
                  <tr key={seg.name} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-800">{seg.name}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(seg.subscribers)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtPct(seg.openRate)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtCZK(seg.rpm)}</td>
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmt.fmtCZKCompact(segmentRevenue(seg))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* revenue streams */}
        <div className="card p-5">
          <h3 className="text-base font-semibold text-navy-800">{t("revenueSources")}</h3>
          <div className="mt-4 space-y-3">
            {revenue.map((r) => (
              <div key={r.source}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-navy-700">{r.source}</span>
                  <span className="tnum font-medium text-navy-800">{fmt.fmtCZKCompact(r.amount)}</span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-navy-50">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round((r.amount / maxStream) * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            {t("seam")}
          </p>
        </div>
      </div>

      {/* growth + RPM trends with one-month forecast */}
      {(subTrend || rpmTrend) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {subTrend && (
            <TrendCard title={t("subGrowthTitle")} trendData={subTrend} fmtValue={fmt.fmtInt} t={t} fmt={fmt} />
          )}
          {rpmTrend && (
            <TrendCard
              title={t("rpmTrendTitle")}
              trendData={rpmTrend}
              fmtValue={(n) => fmt.fmtCZK(n)}
              t={t}
              fmt={fmt}
            />
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* revenue-mix diversification & concentration risk */}
        {mix.total > 0 && (
          <div className="card p-5">
            <h3 className="text-base font-semibold text-navy-800">{t("revenueMix")}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {t("diversification", { pct: fmt.fmtPct(mix.diversification, 0), top: fmt.fmtPct(mix.concentration, 0) })}
            </p>
            <span
              className="mt-4 flex h-3 overflow-hidden rounded-full bg-navy-50"
              role="img"
              aria-label={`${t("revMixAria")}: ${mix.rows
                .map((r) => `${r.source} ${fmt.fmtPct(r.share, 0)}`)
                .join(", ")}`}
            >
              {mix.rows.map((r, i) => (
                <span
                  key={r.source}
                  className={`block h-full ${i % 2 === 0 ? "bg-brand-500" : "bg-brand-300"}`}
                  style={{ width: `${(r.share * 100).toFixed(2)}%` }}
                />
              ))}
            </span>
            <ul className="mt-4 space-y-2">
              {mix.rows.map((r, i) => (
                <li key={r.source} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-navy-700">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        i % 2 === 0 ? "bg-brand-500" : "bg-brand-300"
                      }`}
                    />
                    {r.source}
                  </span>
                  <span className="tnum font-medium text-navy-800">{fmt.fmtPct(r.share, 0)}</span>
                </li>
              ))}
            </ul>
            <div
              className={`mt-4 flex items-start gap-2.5 rounded-card border px-3.5 py-3 text-sm leading-relaxed ${
                mix.concentrated
                  ? "border-coral-200 bg-coral-soft text-coral-600"
                  : "border-line bg-canvas text-navy-700"
              }`}
            >
              <Bulb
                width={16}
                height={16}
                className={`mt-0.5 shrink-0 ${mix.concentrated ? "text-coral-600" : "text-positive"}`}
              />
              <p>
                {mix.concentrated && mix.topStream
                  ? t("concentratedWarning", { pct: fmt.fmtPct(mix.concentration, 0), source: mix.topStream.source })
                  : t("diversified")}
              </p>
            </div>
          </div>
        )}

        {/* sponsorship rate-card calculator */}
        <div className="card p-5">
          <h3 className="text-base font-semibold text-navy-800">{t("sponsorPrice")}</h3>
          <p className="mt-0.5 text-xs text-muted">
            {t("sponsorDesc", { floor: fmt.fmtInt(CPM_BAND.cpmFloor), ceil: fmt.fmtInt(CPM_BAND.cpmCeil) })}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-card border border-line bg-canvas px-3.5 py-3">
              <p className="text-xs text-muted">{t("pricePerSlot")}</p>
              <p className="tnum mt-1 text-lg font-semibold tracking-tight text-brand-accent">
                {fmt.fmtCZKCompact(card.priceFloor)} – {fmt.fmtCZKCompact(card.priceCeil)}
              </p>
              <p className="mt-0.5 text-xs text-muted">{t("pricePerSlotMid", { mid: fmt.fmtCZKCompact(card.priceMid) })}</p>
            </div>
            <div className="rounded-card border border-line bg-canvas px-3.5 py-3">
              <p className="text-xs text-muted">{t("pricePer1000")}</p>
              <p className="tnum mt-1 text-lg font-semibold tracking-tight text-navy-800">
                {fmt.fmtCZK(card.pricePer1000Opens)}
              </p>
              <p className="mt-0.5 text-xs text-muted">{t("opensPerSend", { n: fmt.fmtInt(card.opensPerSend) })}</p>
            </div>
          </div>
          {card.segments.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 font-medium">{t("segments")}</th>
                  <th className="py-2 text-right font-medium">{t("segOpenRateCol")}</th>
                  <th className="py-2 text-right font-medium">{t("segPremium")}</th>
                </tr>
              </thead>
              <tbody>
                {card.segments.map((seg) => (
                  <tr key={seg.name} className="border-b border-line/70 last:border-0">
                    <td className="py-2 font-medium text-navy-800">{seg.name}</td>
                    <td className="tnum py-2 text-right text-navy-700">{fmt.fmtPct(seg.openRate, 0)}</td>
                    <td className="py-2 text-right">
                      <span
                        className={`tnum font-medium ${
                          seg.premium > 0.01
                            ? "text-positive"
                            : seg.premium < -0.01
                              ? "text-negative"
                              : "text-muted"
                        }`}
                      >
                        {fmt.fmtSignedPct(seg.premium, 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            {t("premiumNote")}
          </p>
        </div>
      </div>

      {/* subscriber-source attribution */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-navy-800">{t("subSources")}</h3>
            <p className="mt-0.5 text-xs text-muted">
              {t("subSourcesDesc", {
                n: fmt.fmtInt(attribution.totalNewSubs),
                cost: attribution.blendedCostPerSub > 0 ? fmt.fmtCZK(attribution.blendedCostPerSub) : "—",
              })}
            </p>
          </div>
          {attribution.lowestRetentionSource && (
            <Pill tone="coral">{t("lowestRetention", { src: attribution.lowestRetentionSource })}</Pill>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("channel")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("newSubs")}</th>
                <th className="px-4 py-3 font-medium">{t("share")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("costPerSub")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("retention30")}</th>
              </tr>
            </thead>
            <tbody>
              {attribution.rows.map((r) => (
                <tr key={r.source} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{r.source}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(r.newSubs)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="block h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-navy-50">
                        <span
                          className="block h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.round((r.share / maxShare) * 100)}%` }}
                        />
                      </span>
                      <span className="tnum shrink-0 text-xs text-muted">{fmt.fmtPct(r.share)}</span>
                    </span>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">
                    {r.costPerSub !== undefined ? fmt.fmtCZK(r.costPerSub) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.lowestRetention ? (
                      <Pill tone="coral">{fmt.fmtPct(r.retention30, 0)}</Pill>
                    ) : (
                      <span className="tnum text-navy-700">{fmt.fmtPct(r.retention30, 0)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          {t("organicNote")}
        </p>
      </div>

      {/* audience-growth goal tracker */}
      {goalsProgress && (
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Target width={18} height={18} className="shrink-0 text-brand-accent" />
            <h3 className="text-base font-semibold text-navy-800">{t("goals")}</h3>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {(
              [
                {
                  key: "subscribers",
                  label: t("goalSubscribers"),
                  line: goalsProgress.subscribers,
                  fmt: fmt.fmtInt,
                },
                {
                  key: "revenue",
                  label: t("goalRevenue"),
                  line: goalsProgress.revenue,
                  fmt: fmt.fmtCZKCompact,
                },
              ] as const
            ).map(({ key, label, line, fmt: fmtVal }) => (
              <div key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-navy-800">{label}</span>
                  <span className="tnum text-muted">
                    {fmtVal(line.current)} / {fmtVal(line.target)}
                  </span>
                </div>
                <span className="mt-2 block h-2 overflow-hidden rounded-full bg-navy-50">
                  <span
                    className={`block h-full rounded-full ${line.met ? "bg-positive" : "bg-brand-500"}`}
                    style={{ width: `${Math.min(100, line.progress * 100).toFixed(1)}%` }}
                  />
                </span>
                <p className="mt-2 text-xs text-muted">
                  {line.met ? (
                    <span className="font-medium text-positive">{t("goalMet")}</span>
                  ) : (
                    <>
                      {line.etaMonths != null
                        ? t("goalEta", { pct: fmt.fmtPct(line.progress, 0), n: fmt.fmtInt(line.etaMonths), growth: fmt.fmtSignedPct(subGrowth) })
                        : t("goalNoEta", { pct: fmt.fmtPct(line.progress, 0) })}
                    </>
                  )}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <NextSteps
        steps={[
          {
            to: "distribuce",
            label: t("nextStepBoost"),
            hint: t("nextStepBoostHint"),
          },
          {
            to: "obsahovy-engine",
            label: t("nextStepPlan"),
            hint: t("nextStepPlanHint"),
          },
        ]}
      />
    </div>
  );
}
