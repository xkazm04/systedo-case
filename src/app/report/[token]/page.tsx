import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container, Eyebrow, Pill } from "@/components/ui";
import { ArrowRight, Sparkles } from "@/components/icons";
import ReportView from "@/components/campaigns/ReportView";
import PortfolioTrend from "@/components/campaigns/PortfolioTrend";
import TypeBreakdown from "@/components/campaigns/TypeBreakdown";
import PrintButton from "@/components/campaigns/PrintButton";
import { getSharedReport } from "@/lib/campaigns/shared-report";
import { recommendBudgetMoves } from "@/lib/campaigns/budget-moves";
import {
  aggregate,
  withMetrics,
  campaignPeriodLabel,
  type CampaignPeriod,
} from "@/lib/campaigns/types";
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
  },
} as const;

// Shared links are private; never index them (the root layout is noindex too).
export const metadata: Metadata = { robots: { index: false, follow: false } };

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

  const totals = aggregate(shared.campaigns);
  const period = shared.period as CampaignPeriod;
  const periodLabel = (period in { "7d": 1, "30d": 1, "90d": 1 })
    ? campaignPeriodLabel(period, locale)
    : shared.period;
  const accent = shared.accentColor || "var(--color-brand-600)";
  // Never fall back to the vendor name on a client-facing report — use the brand
  // captured at share time (white-label or project), else the client account name.
  const brand = shared.brandName || shared.accountName || "Report";
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
          <Eyebrow>{brand} · {t("eyebrow")}</Eyebrow>
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

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="card p-4">
              <p className="text-xs text-muted">{k.label}</p>
              <p className="tnum mt-1 text-xl font-semibold text-navy-800">{k.value}</p>
              {k.hint && <p className="mt-0.5 text-[11px] leading-tight text-muted">{k.hint}</p>}
            </div>
          ))}
        </div>

        {/* daily trend */}
        {shared.series.length >= 2 && (
          <div className="mt-6">
            <PortfolioTrend series={shared.series} />
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
            <ReportView report={shared.report} history={shared.history} />
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
