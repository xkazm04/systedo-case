"use client";

/** The aggregate strip above the table. At a thousand contacts the list itself
 *  answers nothing — this does: how many sit in each stage, where they came from,
 *  and how they graded. Stage counts double as the filter control, so reading the
 *  shape and acting on it are the same gesture rather than two.
 *
 *  Every number comes from `GET /crm/summary` (one bounded scan), never from the
 *  page below, and the scan bound is disclosed when it bites. */
import { Pill } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import { PIPELINE_STAGES, type PipelineStage } from "@/lib/leads/types";
import type { ContactSummary } from "@/lib/leads/summary";
import { STAGE_T } from "./copy";

const T = {
  cs: {
    all: "Vše",
    sources: "Zdroje",
    grades: "Skóre",
    regions: "Regiony",
    unscored: "bez skóre",
    capped: "Souhrn počítá z prvních {n} kontaktů — u větších databází jde o výřez.",
    filterBy: "Filtrovat podle fáze: {stage}",
    loading: "Načítám souhrn…",
  },
  en: {
    all: "All",
    sources: "Sources",
    grades: "Score",
    regions: "Regions",
    unscored: "unscored",
    capped: "The summary counts the first {n} contacts — on a larger database that is a slice.",
    filterBy: "Filter by stage: {stage}",
    loading: "Loading the summary…",
  },
} as const;

const TOP_ROWS = 5;

export default function LeadSummaryBar({
  summary,
  activeStage,
  onStage,
}: {
  summary: ContactSummary | null;
  activeStage: PipelineStage | "";
  onStage: (stage: PipelineStage | "") => void;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const fmt = useFormatters();

  if (!summary) {
    return <p className="text-xs text-muted">{t("loading")}</p>;
  }

  const stages = PIPELINE_STAGES.filter((s) => (summary.byStage[s] ?? 0) > 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <StageChip
          label={t("all")}
          count={summary.scanned}
          active={activeStage === ""}
          onClick={() => onStage("")}
          fmt={fmt.fmtInt}
          aria={t("filterBy", { stage: t("all") })}
        />
        {stages.map((s) => (
          <StageChip
            key={s}
            label={stage(s)}
            count={summary.byStage[s] ?? 0}
            active={activeStage === s}
            onClick={() => onStage(activeStage === s ? "" : s)}
            fmt={fmt.fmtInt}
            aria={t("filterBy", { stage: stage(s) })}
          />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Breakdown title={t("sources")} rows={summary.bySource.slice(0, TOP_ROWS)} fmt={fmt.fmtInt} />
        <Breakdown
          title={t("grades")}
          rows={[
            ...(["A", "B", "C", "D"] as const).map((g) => ({
              label: g as string,
              count: summary.byGrade[g],
            })),
            { label: t("unscored"), count: summary.byGrade.none },
          ].filter((r) => r.count > 0)}
          fmt={fmt.fmtInt}
        />
        {summary.byRegion.length > 0 && (
          <Breakdown title={t("regions")} rows={summary.byRegion.slice(0, TOP_ROWS)} fmt={fmt.fmtInt} />
        )}
      </div>

      {summary.capped && (
        <p className="text-xs text-muted">{t("capped", { n: fmt.fmtInt(summary.scanned) })}</p>
      )}
    </div>
  );
}

function StageChip({
  label,
  count,
  active,
  onClick,
  fmt,
  aria,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  fmt: (n: number) => string;
  aria: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={aria}
      className={`inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-brand-400 bg-brand-50 text-brand-800"
          : "border-line text-muted hover:border-brand-300 hover:text-navy-700"
      }`}
    >
      {label}
      <span className="tnum font-semibold">{fmt(count)}</span>
    </button>
  );
}

function Breakdown({
  title,
  rows,
  fmt,
}: {
  title: string;
  rows: { label: string; count: number }[];
  fmt: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{title}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-navy-800">{r.label}</span>
            <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-pill bg-navy-50">
              <span
                className="block h-full rounded-pill bg-brand-400"
                style={{ width: `${Math.round((r.count / max) * 100)}%` }}
              />
            </span>
            <span className="tnum w-8 text-right font-semibold text-navy-800">{fmt(r.count)}</span>
          </li>
        ))}
        {rows.length === 0 && (
          <li>
            <Pill tone="neutral">—</Pill>
          </li>
        )}
      </ul>
    </div>
  );
}
