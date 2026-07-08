"use client";

import Link from "next/link";
import { ArrowRight } from "@/components/icons";
import Segmented from "./Segmented";
import { dayWord } from "./plural";
import { periodLabel, PERIODS, type PeriodDef } from "@/lib/metrics";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: {
    periodLabel: "Období:",
    periodLast: "posledních {n}",
    periodCompare: "· srovnání s předchozím stejně dlouhým obdobím",
    periodTruncated: "zkráceno na {days}",
    truncatedTitle:
      "Datová řada je kratší než zvolené období — okno i srovnávací období se zkrátily na stejně dlouhý dostupný úsek.",
    dataReport: "Datový report",
    periodSelector: "Výběr období",
  },
  en: {
    periodLabel: "Period:",
    periodLast: "last {n}",
    periodCompare: "· compared with the previous period of equal length",
    periodTruncated: "shortened to {days}",
    truncatedTitle:
      "The data series is shorter than the selected period — the window and its comparison were capped to the equal-length span available.",
    dataReport: "Data report",
    periodSelector: "Period selector",
  },
} as const;

/** The period selector row: the „posledních 90 dní" summary line, the „Datový
 *  report" link, and the sliding period Segmented. Owns the too-short-series
 *  truncation hint. */
export default function PeriodHeader({
  period,
  periodKey,
  onPeriodChange,
  truncated,
  actualDays,
  reportHref,
}: {
  period: PeriodDef;
  periodKey: string;
  onPeriodChange: (key: string) => void;
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
        <Link
          href={reportHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-accent hover:underline"
        >
          {t("dataReport")} <ArrowRight width={14} height={14} />
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2">
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
