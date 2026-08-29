/** Lead → close funnel by source: per-step conversion + absolute drop-off.
 *  Extracted from LeadQualityModule (WP W3-C seams — the module may not end larger
 *  than it started); pure presentation over the rows `funnelBySource` computed. */
import { Funnel, Clock } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import type { SourceFunnel } from "@/lib/lead-quality/compute";

const T = {
  cs: {
    funnelTitle: "Trychtýř lead → uzavřeno",
    funnelVelocity: "ø {days} dní do uzavření",
    funnelOverallConversion: "celkem {pct} lead → uzavřeno",
    funnelEntry: "vstup",
    funnelFooter:
      "Konverze = podíl předaný dál z předchozí fáze; drop-off = počet ztracený mezi fázemi. Fáze „Příležitost“ se zobrazí jen tam, kde data existují.",
  },
  en: {
    funnelTitle: "Lead → close funnel",
    funnelVelocity: "avg. {days} days to close",
    funnelOverallConversion: "{pct} overall lead → close",
    funnelEntry: "entry",
    funnelFooter:
      "Conversion = share passed to the next stage from the previous; drop-off = count lost between stages. The “Opportunity” stage appears only where data exists.",
  },
} as const;

/** Conversion tone for a single funnel step (entry stage is always neutral). */
function stepTone(conversion: number, isEntry: boolean): PillTone {
  if (isEntry) return "neutral";
  if (conversion >= 0.5) return "positive";
  if (conversion >= 0.2) return "coral";
  return "negative";
}

export default async function FunnelBySourceCard({
  funnels,
  velocityTotal,
}: {
  funnels: SourceFunnel[];
  velocityTotal: number | null;
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <Funnel width={18} height={18} className="shrink-0 text-brand-accent" />
        <h3 className="text-sm font-semibold text-navy-800">{t("funnelTitle")}</h3>
        {velocityTotal !== null && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted">
            <Clock width={14} height={14} className="shrink-0" />
            {t("funnelVelocity", { days: fmt.fmtDecimal(velocityTotal, 0) })}
          </span>
        )}
      </div>

      <div className="space-y-5 px-5 py-4">
        {funnels.map((f) => {
          const entry = f.stages[0]?.count ?? 0;
          return (
            <div key={f.source}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-navy-800">{f.source}</p>
                <p className="tnum text-xs text-muted">
                  {t("funnelOverallConversion", { pct: fmt.fmtPct(f.overallConversion) })}
                </p>
              </div>
              <div className="flex flex-wrap items-stretch gap-2">
                {f.stages.map((stage, i) => {
                  const width = entry > 0 ? Math.max(8, (stage.count / entry) * 100) : 100;
                  return (
                    <div key={stage.key} className="min-w-[7rem] flex-1" style={{ flexGrow: width }}>
                      <div className="rounded-card border border-line bg-navy-50/40 px-3 py-2">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-muted">{stage.label}</span>
                          <span className="tnum text-sm font-semibold text-navy-800">{fmt.fmtInt(stage.count)}</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <Pill tone={stepTone(stage.conversion, i === 0)}>
                            {i === 0 ? t("funnelEntry") : fmt.fmtPct(stage.conversion)}
                          </Pill>
                          {i > 0 && stage.dropOff > 0 && (
                            <span className="tnum text-xs text-negative">−{fmt.fmtInt(stage.dropOff)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-line px-5 py-3 text-xs text-muted">{t("funnelFooter")}</div>
    </div>
  );
}
