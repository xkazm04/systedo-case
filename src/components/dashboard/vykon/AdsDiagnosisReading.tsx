"use client";

/** The rendered READING of an ads-performance diagnosis: the cause + severity pills,
 *  the summary, the one recommended action, the campaigns it names, and the honest
 *  data disclaimer. Split out of AdsDiagnosisPanel so the panel keeps only the run /
 *  persist / lifecycle wiring (and both stay well under the component budget).
 *  Presentational — it owns no state and performs no I/O. */
import { Pill, type PillTone } from "@/components/ui";
import { Bulb, Target, TrendDown } from "@/components/icons";
import {
  adsDiagnosisCauseLabel,
  type AdsDiagnosisCause,
  type AdsDiagnosisResult,
} from "@/lib/ai-types";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    likelyCauseLabel: "Pravděpodobná příčina:",
    recommendedAction: "Doporučená akce",
    affected: "Dotčené kampaně",
    dataDisclaimer:
      "Diagnóza vychází jen z předaných čísel kampaní za posledních 30 dní. Model žádná data nedoplňuje ani nesčítá částky napříč měnami.",
    severityHigh: "Vysoká závažnost",
    severityMedium: "Střední závažnost",
    severityLow: "Nízká závažnost",
  },
  en: {
    likelyCauseLabel: "Likely cause:",
    recommendedAction: "Recommended action",
    affected: "Affected campaigns",
    dataDisclaimer:
      "The diagnosis is based solely on the campaign numbers provided for the last 30 days. The model adds no data and never sums amounts across currencies.",
    severityHigh: "High severity",
    severityMedium: "Medium severity",
    severityLow: "Low severity",
  },
} as const;

const CAUSE_TONE: Record<AdsDiagnosisCause, PillTone> = {
  "waste-zero-conv": "negative",
  "budget-misallocation": "coral",
  "efficiency-drift": "coral",
  "tracking-gap": "negative",
  "platform-imbalance": "neutral",
  healthy: "positive",
};

const SEVERITY_TONE: Record<AdsDiagnosisResult["severity"], PillTone> = {
  high: "negative",
  medium: "coral",
  low: "neutral",
};

export default function AdsDiagnosisReading({ result }: { result: AdsDiagnosisResult }) {
  const t = useT(T);
  const { locale } = useLocale();
  const severityLabel =
    result.severity === "high"
      ? t("severityHigh")
      : result.severity === "medium"
        ? t("severityMedium")
        : t("severityLow");

  return (
    <>
      <div className="rounded-card border border-line bg-surface p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-onyx text-brand-400">
            <TrendDown width={18} height={18} />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{t("likelyCauseLabel")}</span>
              <Pill tone={CAUSE_TONE[result.likelyCause]}>
                {adsDiagnosisCauseLabel(result.likelyCause, locale)}
              </Pill>
              <Pill tone={SEVERITY_TONE[result.severity]}>{severityLabel}</Pill>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-ink">{result.summary}</p>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-card border border-line bg-canvas px-4 py-3.5">
        <Bulb width={18} height={18} className="mt-0.5 shrink-0 text-positive" />
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {t("recommendedAction")}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{result.recommendation}</p>
        </div>
      </div>

      {result.affectedCampaignIds.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-medium uppercase tracking-wide">{t("affected")}</span>
          {result.affectedCampaignIds.map((id) => (
            <Pill key={id} tone="navy">
              {id}
            </Pill>
          ))}
        </p>
      )}

      <div className="flex items-start gap-2 text-xs text-muted">
        <Target width={14} height={14} className="mt-0.5 shrink-0 text-brand-600" />
        <span className="leading-relaxed">{t("dataDisclaimer")}</span>
      </div>
    </>
  );
}
