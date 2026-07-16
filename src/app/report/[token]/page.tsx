import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Eyebrow, Pill } from "@/components/ui";
import { ArrowRight, Check, Sparkles, Target, TrendDown } from "@/components/icons";
import ReportView from "@/components/campaigns/ReportView";
import TypeBreakdown from "@/components/campaigns/TypeBreakdown";
import PrintButton from "@/components/campaigns/PrintButton";
import { getSharedReport, type SharedMonthlyReport } from "@/lib/campaigns/shared-report";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import {
  aggregate,
  withMetrics,
  campaignPeriodLabel,
  type CampaignPeriod,
} from "@/lib/campaigns/types";
import { deltaTone, type ReportMetric, type ReportTileSpec } from "@/lib/report/compute";
import type { Formatters } from "@/lib/format";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

const T = {
  cs: {
    eyebrow: "sdílený report výkonu",
    readOnly: "Pouze pro čtení",
    subtitle: "Vyhodnocení portfolia · období {period} · vygenerováno {generated}",
    kpiCost: "Náklady",
    kpiConversionValue: "Hodnota konverzí",
    kpiRoas: "ROAS",
    kpiRoasHint: "návratnost výdajů na reklamu",
    kpiPno: "PNO",
    kpiPnoHint: "podíl nákladů na obratu",
    aiSection: "AI vyhodnocení portfolia",
    budgetSection: "Doporučené přesuny rozpočtu",
    movePreamble: "Přesunout {amount}",
    moveFrom: "z {name}",
    footer: "Vygenerováno v {brand} · {count} kampaní",
    footerExpiry: "· odkaz platí do {date}",
    // Direction 1 — the Monthly Report tile model as the primary section.
    reportHeading: "Report výkonu",
    livePill: "Živá data",
    samplePill: "Ilustrativní data",
    vsPrev: "vs. předchozí období",
    attainmentHeading: "Plnění měsíčního cíle obratu",
    attainmentSub: "{hits} z {total} uzavřených měsíců",
    recapFrom: "AI souhrn · {date}",
    wins: "Co se daří",
    risks: "Na co si dát pozor",
    actions: "Doporučené kroky",
    portfolioHeading: "Vyhodnocení portfolia kampaní",
    portfolioSub: "Doplňkový pohled na kampaně v účtu (samostatné vyhodnocení).",
  },
  en: {
    eyebrow: "shared performance report",
    readOnly: "Read only",
    subtitle: "Portfolio evaluation · period {period} · generated {generated}",
    kpiCost: "Cost",
    kpiConversionValue: "Conversion value",
    kpiRoas: "ROAS",
    kpiRoasHint: "return on ad spend",
    kpiPno: "Cost ratio",
    kpiPnoHint: "share of cost in revenue",
    aiSection: "AI portfolio evaluation",
    budgetSection: "Recommended budget moves",
    movePreamble: "Move {amount}",
    moveFrom: "from {name}",
    footer: "Generated in {brand} · {count} campaigns",
    footerExpiry: "· link valid until {date}",
    reportHeading: "Performance report",
    livePill: "Live data",
    samplePill: "Illustrative data",
    vsPrev: "vs. previous period",
    attainmentHeading: "Monthly revenue goal attainment",
    attainmentSub: "{hits} of {total} closed months",
    recapFrom: "AI summary · {date}",
    wins: "What’s working",
    risks: "Watch out for",
    actions: "Recommended actions",
    portfolioHeading: "Campaign portfolio evaluation",
    portfolioSub: "A supplementary view of the account's campaigns (a separate evaluation).",
  },
} as const;

// Shared links are private; never index them (the root layout is noindex too).
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Format a tile value by its declared format — mirrors the in-app report's fmtVal. */
function fmtTile(fmt: Formatters, spec: ReportTileSpec, v: number): string {
  switch (spec.format) {
    case "czk": return fmt.fmtCZKCompact(v);
    case "multiple": return fmt.fmtMultiple(v);
    case "pct": return fmt.fmtPct(v);
    default: return fmt.fmtInt(v);
  }
}

function toneClass(tone: string): string {
  return tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-muted";
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const shared = await getSharedReport(token);
  if (!shared) notFound();

  const t = await getT(T);
  const fmt = await getServerFormatters();
  const locale = await getServerLocale();
  const en = locale === "en";

  const totals = aggregate(shared.campaigns);
  const period = shared.period as CampaignPeriod;
  const periodLabel = (period in { "7d": 1, "30d": 1, "90d": 1 })
    ? campaignPeriodLabel(period, locale)
    : shared.period;
  const accent = shared.accentColor || "var(--color-brand-600)";
  // Never fall back to the vendor name on a client-facing report — use the brand
  // captured at share time (white-label or project), else the client account name.
  const brand = shared.brandName || shared.accountName || "Report";

  // Direction 1: the Monthly Report tile model, when the link captured it. It renders
  // as the PRIMARY report; the campaigns-portfolio eval below is a labeled secondary.
  // A link created before this shipped carries no payload → the legacy layout (the
  // portfolio KPIs + eval as the only content) renders unchanged (backward tolerance).
  const mr = shared.monthlyReport ?? null;

  // Gloss the jargon — a client report is read by non-marketers, so ROAS/PNO get
  // a one-line plain-language explanation (Cost/Conversion value are already plain).
  const kpis: { label: string; value: string; hint?: string }[] = [
    { label: t("kpiCost"), value: fmt.fmtCZK(totals.cost) },
    { label: t("kpiConversionValue"), value: fmt.fmtCZK(totals.conversionValue) },
    { label: t("kpiRoas"), value: fmt.fmtMultiple(totals.roas), hint: t("kpiRoasHint") },
    { label: t("kpiPno"), value: fmt.fmtPct(totals.pno), hint: t("kpiPnoHint") },
  ];

  const moves = recommendBudgetMoves(shared.campaigns.map(withMetrics)).moves.slice(0, 3);

  return (
    <>
      {/* white-label accent bar */}
      <div style={{ backgroundColor: accent }} className="h-1.5 w-full" aria-hidden />
      <Container className="max-w-3xl py-12 sm:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {shared.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shared.logoUrl} alt={brand} className="h-8 w-auto max-w-[160px] object-contain" />
            )}
            <Eyebrow>{brand} · {mr ? t("reportHeading") : t("eyebrow")}</Eyebrow>
          </div>
          <div className="flex items-center gap-2">
            <PrintButton />
            <Pill tone="neutral">{t("readOnly")}</Pill>
          </div>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-[2.4rem]">
          {shared.accountName}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {t("subtitle", { period: periodLabel, generated: fmt.fmtDateTime(shared.createdAt) })}
        </p>

        {mr ? (
          <MonthlyReportPrimary mr={mr} fmt={fmt} en={en} t={t} />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {kpis.map((k) => (
              <div key={k.label} className="card p-4">
                <p className="text-xs text-muted">{k.label}</p>
                <p className="tnum mt-1 text-xl font-semibold text-navy-800">{k.value}</p>
                {k.hint && <p className="mt-0.5 text-[11px] leading-tight text-muted">{k.hint}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Campaigns-portfolio evaluation — the PRIMARY report when no tile model was
            captured (legacy), a labeled SECONDARY section when it was (Direction 1). */}
        {mr && (
          <div className="mt-10 border-t border-line pt-8">
            <h2 className="text-lg font-semibold text-navy-800">{t("portfolioHeading")}</h2>
            <p className="mt-1 text-sm text-muted">{t("portfolioSub")}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kpis.map((k) => (
                <div key={k.label} className="card p-4">
                  <p className="text-xs text-muted">{k.label}</p>
                  <p className="tnum mt-1 text-xl font-semibold text-navy-800">{k.value}</p>
                  {k.hint && <p className="mt-0.5 text-[11px] leading-tight text-muted">{k.hint}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* by-type breakdown */}
        <div className="mt-6">
          <TypeBreakdown campaigns={shared.campaigns} />
        </div>

        {/* AI evaluation */}
        <section className="card mt-6 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
            <Sparkles width={18} height={18} className="text-brand-600" />
            {t("aiSection")}
          </h2>
          <div className="mt-5 border-t border-line pt-5">
            <ReportView report={shared.report} history={shared.history} clientSafe />
          </div>
        </section>

        {/* recommended budget moves (read-only) */}
        {moves.length > 0 && (
          <section className="card mt-6 p-5 sm:p-6">
            <h2 className="text-base font-semibold text-navy-800">{t("budgetSection")}</h2>
            <ul className="mt-4 space-y-2.5">
              {moves.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-line p-3 text-sm">
                  <span className="font-semibold text-navy-800">{t("movePreamble", { amount: fmt.fmtCZK(m.amount) })}</span>
                  <span className="text-navy-700">{t("moveFrom", { name: m.fromName })}</span>
                  <ArrowRight width={14} height={14} className="text-muted" aria-hidden />
                  <span className="text-navy-700">{m.toName}</span>
                  <span className="tnum ml-auto font-semibold text-positive">
                    {fmt.fmtSignedCZK(m.estValueGain)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          {t("footer", { brand, count: shared.campaigns.length })}
          {shared.expiresAt && <> {t("footerExpiry", { date: fmt.fmtDate(shared.expiresAt) })}</>}
        </p>
      </Container>
    </>
  );
}

/** Direction 1: the in-app Monthly Report's tile model, rendered read-only as the
 *  shared page's primary section. Type-aware tiles + the goal-attainment strip (when
 *  captured) + the newest persisted recap — the SAME numbers the tenant sees in-app
 *  (the values were assembled by the one shared helper at share time). */
function MonthlyReportPrimary({
  mr,
  fmt,
  en,
  t,
}: {
  mr: SharedMonthlyReport;
  fmt: Formatters;
  en: boolean;
  t: (key: keyof (typeof T)["cs"], vars?: Record<string, string | number>) => string;
}) {
  const snap = mr.snaps[mr.period];
  const r = mr.recap?.result ?? null;
  const hits = mr.attainment.filter((m) => m.hit).length;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center gap-2">
        <Pill tone={mr.live ? "positive" : "neutral"}>{mr.live ? t("livePill") : t("samplePill")}</Pill>
      </div>

      {/* Type-aware KPI tiles — the exact tiles the in-app report renders. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {mr.tiles.map((spec) => {
          const value = snap.current[spec.metric as ReportMetric] ?? 0;
          const d = spec.hasDelta ? snap.delta[spec.metric as ReportMetric] : undefined;
          return (
            <div key={spec.metric} className="card p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                {en ? spec.labelEn : spec.label}
              </p>
              <p className="tnum mt-1 text-2xl font-semibold text-navy-800">{fmtTile(fmt, spec, value)}</p>
              {typeof d === "number" && (
                <p className={"tnum mt-0.5 text-xs font-medium " + toneClass(deltaTone(d, spec.goodWhenDown))}>
                  {fmt.fmtSignedPct(d)} <span className="text-muted">{t("vsPrev")}</span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Goal-attainment track record (e-shop only; empty otherwise). */}
      {mr.attainment.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-navy-800">{t("attainmentHeading")}</span>
            <span className="text-xs text-muted">{t("attainmentSub", { hits, total: mr.attainment.length })}</span>
          </div>
          <ul className="mt-3 flex items-end gap-3">
            {mr.attainment.map((m) => (
              <li key={m.month} className="flex flex-col items-center gap-1" title={`${fmt.fmtMonth(m.month)} · ${fmt.fmtPct(m.attainment, 0)}`}>
                <span className="flex h-9 w-6 items-end overflow-hidden rounded-sm bg-navy-50">
                  <span
                    aria-hidden
                    className={`block w-full rounded-sm ${m.hit ? "bg-brand-500" : "bg-coral-500"}`}
                    style={{ height: `${Math.min(100, m.attainment * 100)}%` }}
                  />
                </span>
                <span className="text-[10px] text-muted">{fmt.fmtMonth(m.month)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Newest persisted AI recap (read-only), when the tenant generated one. */}
      {r && (
        <div className="card p-5 sm:p-6">
          {mr.recap?.createdAt && (
            <p className="text-xs text-muted">{t("recapFrom", { date: fmt.fmtDateShort(mr.recap.createdAt.slice(0, 10)) })}</p>
          )}
          <div className="mt-3 rounded-card border border-navy-200 bg-navy-50 p-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400"><Target width={18} height={18} /></span>
              <div>
                <p className="font-semibold text-navy-800">{r.headline}</p>
                <p className="mt-2 text-sm leading-relaxed text-navy-700">{r.summary}</p>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            {r.highlights.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-navy-800">{t("wins")}</p>
                <ul className="space-y-2.5">
                  {r.highlights.map((w, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-positive-soft text-positive"><Check width={12} height={12} /></span>
                      <span className="leading-snug">{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {r.watchouts.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-semibold text-navy-800">{t("risks")}</p>
                <ul className="space-y-2.5">
                  {r.watchouts.map((w, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral-soft text-coral-600"><TrendDown width={12} height={12} /></span>
                      <span className="leading-snug">{w}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {r.priorities.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-sm font-semibold text-navy-800">{t("actions")}</p>
              <ol className="space-y-2.5">
                {r.priorities.map((a, i) => (
                  <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                    <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-navy-800">{a.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{a.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
