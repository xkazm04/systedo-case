"use client";

/** The heat matrix: SOURCE (rows) × PIPELINE STAGE (columns).
 *
 *  `byStage` and `bySource` side by side cannot answer the one question an
 *  operator actually has — *which* source is stuck in *which* stage — so this
 *  renders the cross-tab the summary computes on its single scan.
 *
 *  Colour carries ONE meaning: the share of the cell's contacts that are past
 *  their SLA deadline. Volume is the number, not the tint — a grid tinted by two
 *  variables at once is a grid nobody can read. Every filled cell is a button:
 *  it selects, and the selection card next to it drills into the table. */
import { useFormatters, useT } from "@/lib/i18n/client";
import type { TFn } from "@/lib/i18n/interpolate";
import type { MatrixRow } from "@/lib/leads/summary";
import { MATRIX_STAGES } from "@/lib/leads/summary";
import type { PipelineStage } from "@/lib/leads/types";
import { STAGE_T } from "../copy";

const T = {
  cs: {
    title: "Zdroj × fáze",
    legend: "barva = podíl po SLA · číslo = počet",
    afterSla: "{n} po SLA",
    withinLimit: "v limitu",
    win: "úspěšnost {p}",
    ab: "A/B {n}",
    none: "—",
    cell: "{source} · {stage}: {n} kontaktů, {b} po SLA",
    other: "Další zdroje mimo matici: {s} · {n} kontaktů",
    terminal: "Prohráno / vyřazeno: {n}",
    empty: "Zatím žádné kontakty k rozřazení.",
  },
  en: {
    title: "Source × stage",
    legend: "colour = share past SLA · number = count",
    afterSla: "{n} past SLA",
    withinLimit: "within target",
    win: "win rate {p}",
    ab: "A/B {n}",
    none: "—",
    cell: "{source} · {stage}: {n} contacts, {b} past SLA",
    other: "Sources outside the matrix: {s} · {n} contacts",
    terminal: "Lost / disqualified: {n}",
    empty: "No contacts to break down yet.",
  },
} as const;

type TKey = keyof typeof T.cs;

/** Tint steps for the ONE semantic axis. Neutral is not "good", it is "no clock
 *  running here" — which is why a settled stage stays quiet rather than green. */
function tint(share: number, count: number): string {
  if (count === 0) return "bg-canvas text-muted";
  if (share <= 0) return "bg-navy-50 text-navy-800";
  if (share <= 0.2) return "bg-coral-soft text-coral-600";
  return "bg-negative-soft text-negative";
}

export interface CellRef {
  source: string;
  stage: PipelineStage;
}

export default function SegmentMatrix({
  rows,
  other,
  selected,
  onSelect,
}: {
  rows: MatrixRow[];
  other: { sources: number; count: number };
  selected: CellRef | null;
  onSelect: (ref: CellRef) => void;
}) {
  const t = useT(T);
  const stageName = useT(STAGE_T);
  const fmt = useFormatters();
  const terminal = rows.reduce((s, r) => s + r.terminal, 0);

  if (rows.length === 0) {
    return (
      <div className="card p-5">
        <p className="text-sm text-muted">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy-800">{t("title")}</h3>
        <span className="text-xs text-muted">{t("legend")}</span>
      </div>

      <div className="overflow-x-auto">
        <div
          className="grid min-w-[30rem] gap-1.5"
          style={{ gridTemplateColumns: `6.5rem repeat(${MATRIX_STAGES.length}, minmax(0, 1fr))` }}
        >
          <div />
          {MATRIX_STAGES.map((s) => (
            <div key={s} className="truncate px-1 py-1 text-[11px] font-medium text-muted">
              {stageName(s)}
            </div>
          ))}

          {rows.map((row) => (
            <Row
              key={row.label}
              row={row}
              selected={selected}
              onSelect={onSelect}
              t={t}
              stageName={stageName}
              fmt={fmt}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-muted">
        {t("terminal", { n: fmt.fmtInt(terminal) })}
        {other.sources > 0
          ? ` · ${t("other", { s: fmt.fmtInt(other.sources), n: fmt.fmtInt(other.count) })}`
          : ""}
      </p>
    </div>
  );
}

function Row({
  row,
  selected,
  onSelect,
  t,
  stageName,
  fmt,
}: {
  row: MatrixRow;
  selected: CellRef | null;
  onSelect: (ref: CellRef) => void;
  t: TFn<TKey>;
  stageName: (s: PipelineStage) => string;
  fmt: ReturnType<typeof useFormatters>;
}) {
  return (
    <>
      <div className="flex min-w-0 items-center pr-1 text-xs font-medium text-navy-800">
        <span className="truncate" title={row.label}>
          {row.label}
        </span>
      </div>
      {MATRIX_STAGES.map((stage) => {
        const cell = row.cells[stage];
        const share = cell.count > 0 ? cell.breached / cell.count : 0;
        const isSelected = selected?.source === row.label && selected.stage === stage;

        if (cell.count === 0) {
          return (
            <div
              key={stage}
              aria-hidden
              className="rounded-card border border-dashed border-line px-2 py-2 text-xs text-muted"
            >
              {t("none")}
            </div>
          );
        }

        return (
          <button
            key={stage}
            type="button"
            onClick={() => onSelect({ source: row.label, stage })}
            aria-pressed={isSelected}
            aria-label={t("cell", {
              source: row.label,
              stage: stageName(stage),
              n: fmt.fmtInt(cell.count),
              b: fmt.fmtInt(cell.breached),
            })}
            className={`flex min-h-[3.75rem] flex-col justify-between rounded-card border px-2 py-2 text-left transition-shadow ${tint(
              share,
              cell.count
            )} ${isSelected ? "border-brand-500 shadow-card" : "border-transparent hover:border-brand-300"}`}
          >
            <span className="tnum text-lg font-bold leading-none">{fmt.fmtInt(cell.count)}</span>
            <span className="truncate text-[11px]">{secondary(row, stage, cell, t, fmt)}</span>
          </button>
        );
      })}
    </>
  );
}

/** The second fact each column earns: the clock early on, money (when a deal tier
 *  supplies it) at the offer stage, and the win rate at the end. */
function secondary(
  row: MatrixRow,
  stage: PipelineStage,
  cell: MatrixRow["cells"][PipelineStage],
  t: TFn<TKey>,
  fmt: ReturnType<typeof useFormatters>
): string {
  if (cell.breached > 0) return t("afterSla", { n: fmt.fmtInt(cell.breached) });
  if (stage === "won") {
    return row.winRate === null ? t("none") : t("win", { p: fmt.fmtPct(row.winRate, 0) });
  }
  if (stage === "opportunity") {
    if (cell.value !== null) return fmt.fmtCZKCompact(cell.value);
    return cell.ab > 0 ? t("ab", { n: fmt.fmtInt(cell.ab) }) : t("none");
  }
  return t("withinLimit");
}
