/** Publikum & výnos — audience funnel, segments and revenue. Server component. */
import { fmtCZK, fmtCZKCompact, fmtDecimal, fmtInt, fmtPct, fmtSignedPct } from "@/lib/format";
import { Bulb, Target, TrendUp, TrendDown } from "@/components/icons";
import { Pill } from "@/components/ui";
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

/** Benchmark CPM band (price per 1000 opens, CZK) for the rate-card estimate. */
const CPM_BAND = { cpmFloor: 280, cpmCeil: 520 };

const SPARK_W = 120;
const SPARK_H = 32;

/** Compact inline sparkline for a short monthly series, min-max normalised to its
 *  own range so the shape reads regardless of absolute scale. Pure SVG, no DOM. */
function MiniSpark({ series, label }: { series: number[]; label: string }) {
  if (series.length < 2) return <span className="text-sm text-muted">—</span>;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = SPARK_W / (series.length - 1);
  const pts = series
    .map((v, i) => `${(i * step).toFixed(2)},${(SPARK_H * (1 - (v - min) / span)).toFixed(2)}`)
    .join(" ");
  const last = series[series.length - 1]!;
  const lastY = SPARK_H * (1 - (last - min) / span);
  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      width={SPARK_W}
      height={SPARK_H}
      className="overflow-visible"
      role="img"
      aria-label={label}
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-brand-accent)"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={(series.length - 1) * step} cy={lastY} r={2} fill="var(--color-brand-accent)" />
    </svg>
  );
}

/** A compact "trend" card: a sparkline, the current value, a MoM delta pill and a
 *  one-month forecast line. `fmtValue` lets each card render its own units. */
function TrendCard({
  title,
  t,
  fmtValue,
}: {
  title: string;
  t: Trend;
  fmtValue: (n: number) => string;
}) {
  const up = t.momGrowth != null && t.momGrowth >= 0;
  const DeltaIcon = up ? TrendUp : TrendDown;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
            {fmtValue(t.latest)}
          </p>
        </div>
        {t.momGrowth != null && (
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-canvas px-2 py-1 text-xs font-medium ${
              up ? "text-positive" : "text-negative"
            }`}
          >
            <DeltaIcon width={13} height={13} className="shrink-0" />
            {fmtSignedPct(t.momGrowth)}
          </span>
        )}
      </div>
      <div className="mt-3">
        <MiniSpark series={t.series} label={`${title}: posledních ${t.series.length} měsíců`} />
      </div>
      <p className="mt-2 text-xs text-muted">
        Prognóza příští měsíc: <span className="tnum font-medium text-navy-700">{fmtValue(t.forecast)}</span>
        {" · "}3měsíční průměr {fmtValue(t.movingAvg3)}
      </p>
    </div>
  );
}

export default function AudienceModule({
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
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Odběratelé</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtInt(funnel.subscribers)}</p>
          <p className="mt-1 text-xs text-muted">konverze {fmtPct(s.subRate)} z návštěv</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Aktivní</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtPct(s.activeRate)}</p>
          <p className="mt-1 text-xs text-muted">{fmtInt(funnel.activeSubscribers)} odběratelů</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Měsíční výnos</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtCZKCompact(s.monthlyRevenue)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">ARPU</p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-brand-accent">{fmtCZK(s.arpu)}</p>
          <p className="mt-1 text-xs text-muted">na aktivního odběratele</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* segments */}
        <div className="card overflow-hidden">
          <div className="border-b border-line px-5 py-4">
            <h3 className="text-base font-semibold text-navy-800">Segmenty</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">Segment</th>
                  <th className="px-4 py-3 text-right font-medium">Odběratelé</th>
                  <th className="px-4 py-3 text-right font-medium">Open rate</th>
                  <th className="px-4 py-3 text-right font-medium">RPM</th>
                  <th className="px-4 py-3 text-right font-medium">Odhad výnosu</th>
                </tr>
              </thead>
              <tbody>
                {segments.map((seg) => (
                  <tr key={seg.name} className="border-b border-line/70 last:border-0">
                    <td className="px-5 py-3 font-medium text-navy-800">{seg.name}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(seg.subscribers)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtPct(seg.openRate)}</td>
                    <td className="tnum px-4 py-3 text-right text-navy-700">{fmtCZK(seg.rpm)}</td>
                    <td className="tnum px-4 py-3 text-right font-medium text-navy-800">{fmtCZKCompact(segmentRevenue(seg))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* revenue streams */}
        <div className="card p-5">
          <h3 className="text-base font-semibold text-navy-800">Zdroje výnosu</h3>
          <div className="mt-4 space-y-3">
            {revenue.map((r) => (
              <div key={r.source}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-navy-700">{r.source}</span>
                  <span className="tnum font-medium text-navy-800">{fmtCZKCompact(r.amount)}</span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-navy-50">
                  <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.round((r.amount / maxStream) * 100)}%` }} />
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            Seam: napojit ESP (newsletter), analytiku a data o sponzoringu/reklamě.
          </p>
        </div>
      </div>

      {/* #4 growth + RPM trends with one-month forecast */}
      {(subTrend || rpmTrend) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {subTrend && <TrendCard title="Růst odběratelů" t={subTrend} fmtValue={fmtInt} />}
          {rpmTrend && (
            <TrendCard title="Trend RPM" t={rpmTrend} fmtValue={(n) => `${fmtDecimal(n, 1)} Kč`} />
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* #3 revenue-mix diversification & concentration risk */}
        {mix.total > 0 && (
          <div className="card p-5">
            <h3 className="text-base font-semibold text-navy-800">Skladba výnosu</h3>
            <p className="mt-0.5 text-xs text-muted">
              Diverzifikace {fmtPct(mix.diversification, 0)} · největší zdroj {fmtPct(mix.concentration, 0)}
            </p>
            <span
              className="mt-4 flex h-3 overflow-hidden rounded-full bg-navy-50"
              role="img"
              aria-label={`100% skládaný pruh skladby výnosu: ${mix.rows
                .map((r) => `${r.source} ${fmtPct(r.share, 0)}`)
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
                  <span className="tnum font-medium text-navy-800">{fmtPct(r.share, 0)}</span>
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
                  ? `${fmtPct(mix.concentration, 0)} výnosu závisí na jednom zdroji (${mix.topStream.source}) — diverzifikujte, ať jeden výpadek neohrozí celý výnos.`
                  : "Výnos je rozložený mezi více zdrojů — žádný jednotlivý kanál není kritická závislost."}
              </p>
            </div>
          </div>
        )}

        {/* #2 sponsorship rate-card calculator */}
        <div className="card p-5">
          <h3 className="text-base font-semibold text-navy-800">Cena za sponzoring</h3>
          <p className="mt-0.5 text-xs text-muted">
            Odhad z aktivního dosahu × open rate × benchmark CPM ({fmtInt(CPM_BAND.cpmFloor)}–
            {fmtInt(CPM_BAND.cpmCeil)} Kč / 1 000 otevření)
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-card border border-line bg-canvas px-3.5 py-3">
              <p className="text-xs text-muted">Cena za slot</p>
              <p className="tnum mt-1 text-lg font-semibold tracking-tight text-brand-accent">
                {fmtCZKCompact(card.priceFloor)} – {fmtCZKCompact(card.priceCeil)}
              </p>
              <p className="mt-0.5 text-xs text-muted">≈ {fmtCZKCompact(card.priceMid)} střed</p>
            </div>
            <div className="rounded-card border border-line bg-canvas px-3.5 py-3">
              <p className="text-xs text-muted">Cena / 1 000 otevření</p>
              <p className="tnum mt-1 text-lg font-semibold tracking-tight text-navy-800">
                {fmtCZK(card.pricePer1000Opens)}
              </p>
              <p className="mt-0.5 text-xs text-muted">{fmtInt(card.opensPerSend)} otevření / rozeslání</p>
            </div>
          </div>
          {card.segments.length > 0 && (
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 font-medium">Segment</th>
                  <th className="py-2 text-right font-medium">Open rate</th>
                  <th className="py-2 text-right font-medium">Prémie</th>
                </tr>
              </thead>
              <tbody>
                {card.segments.map((seg) => (
                  <tr key={seg.name} className="border-b border-line/70 last:border-0">
                    <td className="py-2 font-medium text-navy-800">{seg.name}</td>
                    <td className="tnum py-2 text-right text-navy-700">{fmtPct(seg.openRate, 0)}</td>
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
                        {fmtSignedPct(seg.premium, 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
            Prémie je odchylka open rate segmentu od váženého průměru — cílené sloty lze ocenit výš.
          </p>
        </div>
      </div>

      {/* subscriber-source attribution — kde rostou odběratelé */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-navy-800">Zdroje odběratelů</h3>
            <p className="mt-0.5 text-xs text-muted">
              {fmtInt(attribution.totalNewSubs)} nových odběratelů · průměrná cena za získání{" "}
              {attribution.blendedCostPerSub > 0 ? fmtCZK(attribution.blendedCostPerSub) : "—"} (placené kanály)
            </p>
          </div>
          {attribution.lowestRetentionSource && (
            <Pill tone="coral">Nejnižší retence: {attribution.lowestRetentionSource}</Pill>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">Kanál</th>
                <th className="px-4 py-3 text-right font-medium">Noví odběratelé</th>
                <th className="px-4 py-3 font-medium">Podíl</th>
                <th className="px-4 py-3 text-right font-medium">Cena / odběratel</th>
                <th className="px-4 py-3 text-right font-medium">Retence 30 dní</th>
              </tr>
            </thead>
            <tbody>
              {attribution.rows.map((r) => (
                <tr key={r.source} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{r.source}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(r.newSubs)}</td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="block h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-navy-50">
                        <span
                          className="block h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.round((r.share / maxShare) * 100)}%` }}
                        />
                      </span>
                      <span className="tnum shrink-0 text-xs text-muted">{fmtPct(r.share)}</span>
                    </span>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">
                    {r.costPerSub !== undefined ? fmtCZK(r.costPerSub) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.lowestRetention ? (
                      <Pill tone="coral">{fmtPct(r.retention30, 0)}</Pill>
                    ) : (
                      <span className="tnum text-navy-700">{fmtPct(r.retention30, 0)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Organické kanály nemají cenu za získání; průměr počítá jen z placených zdrojů.
        </p>
      </div>

      {/* #5 audience-growth goal tracker */}
      {goalsProgress && (
        <div className="card p-5">
          <div className="flex items-center gap-2">
            <Target width={18} height={18} className="shrink-0 text-brand-accent" />
            <h3 className="text-base font-semibold text-navy-800">Cíle</h3>
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {(
              [
                {
                  key: "subscribers",
                  label: "Odběratelé",
                  line: goalsProgress.subscribers,
                  fmt: fmtInt,
                },
                {
                  key: "revenue",
                  label: "Měsíční výnos",
                  line: goalsProgress.revenue,
                  fmt: fmtCZKCompact,
                },
              ] as const
            ).map(({ key, label, line, fmt }) => (
              <div key={key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-navy-800">{label}</span>
                  <span className="tnum text-muted">
                    {fmt(line.current)} / {fmt(line.target)}
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
                    <span className="font-medium text-positive">Cíl splněn</span>
                  ) : (
                    <>
                      {fmtPct(line.progress, 0)} k cíli ·{" "}
                      {line.etaMonths != null
                        ? `odhad ${fmtInt(line.etaMonths)} měs. při růstu ${fmtSignedPct(subGrowth)}`
                        : "bez růstu nelze odhadnout ETA"}
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
            label: "Posílit nejsilnější kanál",
            hint: "Atribuce podle kanálu a varianty obsahu v Distribuci",
          },
          {
            to: "obsahovy-engine",
            label: "Naplánovat obsah k cílům růstu",
            hint: "Propojit cíle odběratelů a výnosu s plánem obsahu",
          },
        ]}
      />
    </div>
  );
}
