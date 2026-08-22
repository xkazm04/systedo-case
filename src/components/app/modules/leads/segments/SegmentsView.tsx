"use client";

/** Segmenty — the aggregate overview that answers "where is the pipeline stuck,
 *  and which source is it stuck in".
 *
 *  Everything on screen comes from ONE bounded scan (`GET /crm/summary`): the
 *  source × stage cross-tab, the per-source grade mix, the SLA breach counts. This
 *  view never fetches a contact — that is the whole point of the direction. A map
 *  that had to page through people to draw itself would be the list again, slower.
 *
 *  Reading and acting are the same gesture: every cell is a filter, and the
 *  selection card hands that filter to the database view. */
import { useMemo, useState } from "react";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { PipelineStage } from "@/lib/leads/types";
import type { AggregateViewProps } from "../view-props";
import SegmentMatrix, { type CellRef } from "./SegmentMatrix";
import SourceTreemap from "./SourceTreemap";
import SegmentSelection from "./SegmentSelection";

const T = {
  cs: {
    empty: "Zatím tu nejsou žádné kontakty, ze kterých by šlo mapu segmentů složit.",
    scanned: "Mapa počítá z {n} kontaktů.",
    capped: "Mapa počítá z prvních {n} kontaktů — u větší databáze jde o výřez, ne o celek.",
  },
  en: {
    empty: "There are no contacts yet to build a segment map from.",
    scanned: "The map is computed over {n} contacts.",
    capped: "The map counts the first {n} contacts — on a larger database that is a slice, not the whole.",
  },
} as const;

export default function SegmentsView({ summary, loading, onOpenInTable }: AggregateViewProps) {
  const t = useT(T);
  const fmt = useFormatters();
  const [selected, setSelected] = useState<{ source: string; stage: PipelineStage | null } | null>(
    null
  );

  const rows = summary?.matrix ?? [];
  const selectedRow = useMemo(
    () => rows.find((r) => r.label === selected?.source) ?? null,
    [rows, selected]
  );
  /** The treemap draws the sources the matrix also has a row for, so a tile can
   *  never select something the selection card cannot describe. What the cap left
   *  out is disclosed in the matrix footer, not silently dropped. */
  const tiles = useMemo(
    () => (summary?.bySourceGrade ?? []).filter((g) => rows.some((r) => r.label === g.label)),
    [summary, rows]
  );

  if (loading && !summary) return <SectionSkeleton />;
  if (!summary || rows.length === 0) {
    return (
      <div className="card p-6">
        <p className="text-sm text-muted">{t("empty")}</p>
      </div>
    );
  }

  const pickCell = (ref: CellRef) =>
    setSelected((prev) =>
      prev?.source === ref.source && prev.stage === ref.stage ? null : { source: ref.source, stage: ref.stage }
    );
  const pickSource = (label: string) =>
    setSelected((prev) => (prev?.source === label && prev.stage === null ? null : { source: label, stage: null }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <SegmentMatrix
          rows={rows}
          other={summary.matrixOther}
          selected={selected?.stage ? { source: selected.source, stage: selected.stage } : null}
          onSelect={pickCell}
        />
        <div className="flex flex-col gap-4">
          <SourceTreemap
            rows={tiles}
            selected={selected?.stage === null ? selected.source : null}
            onSelect={pickSource}
          />
          <SegmentSelection
            row={selectedRow}
            stage={selected?.stage ?? null}
            onOpen={(source, stage) =>
              onOpenInTable({ source, ...(stage ? { stage } : {}) })
            }
          />
        </div>
      </div>

      <p className="text-xs text-muted">
        {summary.capped
          ? t("capped", { n: fmt.fmtInt(summary.scanned) })
          : t("scanned", { n: fmt.fmtInt(summary.scanned) })}
      </p>
    </div>
  );
}
