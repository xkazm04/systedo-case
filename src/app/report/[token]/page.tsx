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
  CAMPAIGN_PERIOD_LABELS,
  type CampaignPeriod,
} from "@/lib/campaigns/types";
import { fmtCZK, fmtDate, fmtDateTime, fmtMultiple, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";
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

  const totals = aggregate(shared.campaigns);
  const periodLabel =
    CAMPAIGN_PERIOD_LABELS[shared.period as CampaignPeriod] ?? shared.period;
  const accent = shared.accentColor || "var(--color-brand-600)";
  const brand = shared.brandName || "Systedo";
  const kpis = [
    { label: "Náklady", value: fmtCZK(totals.cost) },
    { label: "Hodnota konverzí", value: fmtCZK(totals.conversionValue) },
    { label: "ROAS", value: fmtMultiple(totals.roas) },
    { label: "PNO", value: fmtPct(totals.pno) },
  ];

  const moves = recommendBudgetMoves(shared.campaigns.map(withMetrics)).moves.slice(0, 3);

  return (
    <>
      {/* white-label accent bar */}
      <div style={{ backgroundColor: accent }} className="h-1.5 w-full" aria-hidden />
      <Container className="max-w-3xl py-12 sm:py-16">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>{brand} · sdílený report výkonu</Eyebrow>
          <div className="flex items-center gap-2">
            <PrintButton />
            <Pill tone="neutral">Pouze pro čtení</Pill>
          </div>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-[2.4rem]">
          {shared.accountName}
        </h1>
        <p className="mt-2 text-sm text-muted">
          Vyhodnocení portfolia · období {periodLabel} · vygenerováno {fmtDateTime(shared.createdAt)}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="card p-4">
              <p className="text-xs text-muted">{k.label}</p>
              <p className="tnum mt-1 text-xl font-semibold text-navy-800">{k.value}</p>
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
            AI vyhodnocení portfolia
          </h2>
          <div className="mt-5 border-t border-line pt-5">
            <ReportView report={shared.report} history={shared.history} />
          </div>
        </section>

        {/* recommended budget moves (read-only) */}
        {moves.length > 0 && (
          <section className="card mt-6 p-5 sm:p-6">
            <h2 className="text-base font-semibold text-navy-800">Doporučené přesuny rozpočtu</h2>
            <ul className="mt-4 space-y-2.5">
              {moves.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card border border-line p-3 text-sm">
                  <span className="font-semibold text-navy-800">Přesunout {fmtCZK(m.amount)}</span>
                  <span className="text-navy-700">z {m.fromName}</span>
                  <ArrowRight width={14} height={14} className="text-muted" aria-hidden />
                  <span className="text-navy-700">{m.toName}</span>
                  <span className="tnum ml-auto font-semibold text-positive">
                    +{fmtCZK(m.estValueGain)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-8 text-center text-xs text-muted">
          Vygenerováno v {brand} · {shared.campaigns.length} kampaní
          {shared.expiresAt && <> · odkaz platí do {fmtDate(shared.expiresAt)}</>}
        </p>
      </Container>
    </>
  );
}
