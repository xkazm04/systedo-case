"use client";

import { Pill } from "@/components/ui";
import { Bell, Bolt, Clock } from "@/components/icons";
import { CHANNEL_LABELS } from "@/lib/speed-lead/sample";
import type { ResponseAnalytics } from "@/lib/speed-lead/analytics";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    medianResponse: "Medián reakce",
    withinSla: "V SLA",
    slaGoal: "do {min} min",
    avgByChannel: "Průměr dle kanálu",
    noData: "zatím bez dat",
    sentCount: "z {n} odeslaných",
    repliedCount: "z {n} zodpovězených",
    noSent: "zatím bez odeslání",
    judged: "{n} z {total} hodnoceno",
    atRiskPending: "{n} čeká na odpověď",
    leadsOverSla_one: "lead po SLA",
    leadsOverSla_few: "leady po SLA",
    leadsOverSla_many: "leadů po SLA",
    overSlaUrgent: "Reagujte okamžitě.",
    escalate: "Eskalovat",
    responseGoal: "Cíl reakce",
    queueGoal: "Cíl fronty CRM",
    allInSla: "Vše v SLA",
  },
  en: {
    medianResponse: "Median response",
    withinSla: "Within SLA",
    slaGoal: "< {min} min",
    avgByChannel: "Avg by channel",
    noData: "no data yet",
    sentCount: "of {n} sent",
    repliedCount: "of {n} answered",
    noSent: "none sent yet",
    judged: "{n} of {total} judged",
    atRiskPending: "{n} awaiting reply",
    leadsOverSla_one: "lead past SLA",
    leadsOverSla_few: "leads past SLA",
    leadsOverSla_many: "leads past SLA",
    overSlaUrgent: "Respond immediately.",
    escalate: "Escalate",
    responseGoal: "Response target",
    queueGoal: "CRM queue target",
    allInSla: "All within SLA",
  },
} as const;

/** The inbox's response-time analytics band plus the escalation strip. Derived from
 *  this session's replies (and, on a live queue, the CRM's recorded ones) plus the
 *  live SLA state of still-open leads. The target it states is the ACTIVE set's own:
 *  the CRM queue's on live data, the drill's on the sample — each labelled as such. */
export default function ResponseBand({
  analytics,
  leadsCount,
  overdueCount,
  targetMin,
  live,
  onEscalate,
}: {
  analytics: ResponseAnalytics;
  leadsCount: number;
  overdueCount: number;
  targetMin: number;
  /** the rows are real CRM contacts (labels the target as the queue's) */
  live: boolean;
  onEscalate: () => void;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();
  const L = locale === "en" ? "en" : "cs";

  /** Czech plural for overdue count: 1 = lead, 2–4 = leady, 5+ = leadů */
  const overdueLabel =
    overdueCount === 1 ? t("leadsOverSla_one") : overdueCount < 5 ? t("leadsOverSla_few") : t("leadsOverSla_many");

  return (
    <>
      <div className="flex flex-wrap items-stretch gap-3 rounded-card border border-line bg-surface px-4 py-3">
        <div className="min-w-[120px]">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("medianResponse")}</p>
          <p className="tnum mt-0.5 text-lg font-semibold text-navy-800">
            {analytics.medianResponseSec != null ? fmt.fmtDuration(analytics.medianResponseSec) : "—"}
          </p>
          <p className="text-[11px] text-muted">
            {analytics.answered > 0 ? t(live ? "repliedCount" : "sentCount", { n: analytics.answered }) : t("noSent")}
          </p>
        </div>
        <div className="min-w-[120px] border-l border-line pl-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("withinSla")}</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="tnum text-lg font-semibold text-navy-800">
              {analytics.withinSlaRate != null ? fmt.fmtPct(analytics.withinSlaRate, 0) : "—"}
            </p>
            {analytics.withinSlaRate != null ? (
              <Pill tone={analytics.withinSlaRate >= 0.8 ? "positive" : analytics.withinSlaRate >= 0.5 ? "coral" : "negative"}>
                {t("slaGoal", { min: targetMin })}
              </Pill>
            ) : null}
          </div>
          <p className="text-[11px] text-muted">
            {t("judged", { n: analytics.judged, total: leadsCount })}
            {analytics.atRisk > 0 ? ` · ${t("atRiskPending", { n: analytics.atRisk })}` : ""}
          </p>
        </div>
        <div className="min-w-[160px] flex-1 border-l border-line pl-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("avgByChannel")}</p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
            {analytics.byChannel.length > 0 ? (
              analytics.byChannel.map((c) => (
                <span key={c.channel} className="text-xs text-navy-700">
                  {CHANNEL_LABELS[c.channel][L]}{" "}
                  <strong className="tnum font-semibold">
                    {c.avgResponseSec != null ? fmt.fmtDuration(c.avgResponseSec) : "—"}
                  </strong>
                </span>
              ))
            ) : (
              <span className="text-xs text-muted">{t("noData")}</span>
            )}
          </div>
        </div>
      </div>

      {overdueCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-negative/40 bg-negative-soft px-4 py-3 text-sm">
          <Bell width={16} height={16} className="shrink-0 text-negative" />
          <span className="font-semibold text-negative">
            {overdueCount} {overdueLabel}
          </span>
          <span className="text-navy-700">{t("overSlaUrgent")}</span>
          <button
            type="button"
            onClick={onEscalate}
            className="ml-auto inline-flex items-center gap-2 rounded-pill bg-negative px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:opacity-90"
          >
            <Bolt width={14} height={14} />
            {t("escalate")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-card border border-line bg-canvas px-4 py-3 text-sm">
          <Clock width={16} height={16} className="text-brand-accent" />
          <span className="text-navy-700">
            {t(live ? "queueGoal" : "responseGoal")} <strong>{t("slaGoal", { min: targetMin })}</strong>.
          </span>
          <Pill tone="positive">{t("allInSla")}</Pill>
        </div>
      )}
    </>
  );
}
