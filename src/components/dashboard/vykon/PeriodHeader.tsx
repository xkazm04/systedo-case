"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import Segmented from "./Segmented";
import { dayWord } from "./plural";
import { periodLabel, PERIODS, type PeriodBaseline, type PeriodDef } from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    periodLabel: "Období:",
    periodLast: "posledních {n}",
    periodCompare: "· srovnání s předchozím stejně dlouhým obdobím",
    periodTruncated: "zkráceno na {days}",
    truncatedTitle:
      "Datová řada je kratší než zvolené období. Okno i srovnávací období se zkrátily na stejně dlouhý dostupný úsek.",
    dataReport: "Datový report",
    periodSelector: "Výběr období",
    baselineSelector: "Srovnávací základna",
    baselinePrevious: "Předchozí",
    baselineYoy: "Rok zpět",
    yoyDisabledTitle:
      "Pro toto období není dost historie na srovnání rok zpět (chybí data zpřed roku).",
  },
  en: {
    periodLabel: "Period:",
    periodLast: "last {n}",
    periodCompare: "· compared with the previous period of equal length",
    periodTruncated: "shortened to {days}",
    truncatedTitle:
      "The data series is shorter than the selected period. The window and its comparison were capped to the equal-length span available.",
    dataReport: "Data report",
    periodSelector: "Period selector",
    baselineSelector: "Comparison baseline",
    baselinePrevious: "Previous",
    baselineYoy: "Year ago",
    yoyDisabledTitle:
      "Not enough history for a year-over-year comparison of this period (no data from a year back).",
  },
} as const;

/** The period selector row: the „posledních 90 dní" summary line, the „Datový
 *  report" link, and the sliding period Segmented. Owns the too-short-series
 *  truncation hint. */
export default function PeriodHeader({
  period,
  periodKey,
  onPeriodChange,
  baseline,
  onBaselineChange,
  yoySupported,
  truncated,
  actualDays,
  reportHref,
}: {
  period: PeriodDef;
  periodKey: string;
  onPeriodChange: (key: string) => void;
  /** the comparison baseline currently in effect (reflects the yoy fallback) */
  baseline: PeriodBaseline;
  onBaselineChange: (b: PeriodBaseline) => void;
  /** whether the series can support a year-over-year comparison for this window;
   *  when false the yoy option is disabled with an honest tooltip */
  yoySupported: boolean;
  truncated: boolean;
  actualDays: number;
  reportHref: string;
}) {
  const fmt = useFormatters();
  const t = useT(T);
  const { locale } = useLocale();

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-sm text-muted">
          {t("periodLabel")}{" "}
          <span className="font-medium text-navy-700">{t("periodLast", { n: periodLabel(period, locale) })}</span>
          <span className="text-muted"> {t("periodCompare")}</span>
          {/* the series was too short for the requested window — say so instead
              of letting „12 měsíců" silently mean a shorter span */}
          {truncated && (
            <span className="text-coral-600" title={t("truncatedTitle")}>
              {" "}
              ·{" "}
              {t("periodTruncated", {
                days: `${fmt.fmtInt(actualDays)} ${dayWord(actualDays, locale)}`,
              })}
            </span>
          )}
        </p>
        {/* Carry the dashboard's active period into the report so it opens on the
            same window the user is looking at (the report validates it, default 90d). */}
        <Link
          href={`${reportHref}${reportHref.includes("?") ? "&" : "?"}period=${periodKey}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline"
        >
          {t("dataReport")} <ArrowRight width={14} height={14} />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<PeriodBaseline>
          ariaLabel={t("baselineSelector")}
          options={[
            { value: "previous", label: t("baselinePrevious") },
            {
              value: "yoy",
              label: t("baselineYoy"),
              disabled: !yoySupported,
              title: yoySupported ? undefined : t("yoyDisabledTitle"),
            },
          ]}
          value={baseline}
          onChange={onBaselineChange}
        />
        <Segmented
          ariaLabel={t("periodSelector")}
          options={PERIODS.map((p) => ({ value: p.key, label: periodLabel(p, locale) }))}
          value={periodKey}
          onChange={onPeriodChange}
        />
      </div>
    </div>
  );
}
