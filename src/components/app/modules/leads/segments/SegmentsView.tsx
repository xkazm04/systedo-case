"use client";

/** Segmenty — the segment map that opens the module, sitting directly above the
 *  table it filters. It answers "where is the pipeline stuck, and which source is
 *  it stuck in", and the answer is one click from the people it is about.
 *
 *  Everything on screen comes from ONE bounded scan (`GET /crm/summary`): the
 *  source × stage cross-tab, the per-source grade mix, the SLA breach counts. This
 *  surface never fetches a contact — that is the whole point of the direction. A map
 *  that had to page through people to draw itself would be the list again, slower.
 *
 *  Reading and acting are the same gesture: a cell (or a source tile) applies its
 *  filter to the table below and scrolls to it. The selection is DERIVED from that
 *  filter rather than held here, so the matrix, the toolbar selects and the rows can
 *  never disagree about what is being looked at. */
import { useMemo } from "react";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { ContactSummary } from "@/lib/leads/summary";
import type { PipelineStage } from "@/lib/leads/types";
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

/** The table filter this map both reads and writes (the module's `LeadQuery` half
 *  the map has an opinion about). */
export interface SegmentFilter {
  source: string;
  stage: PipelineStage | "";
}

export default function SegmentsView({
  summary,
  loading,
  filter,
  onPick,
}: {
  summary: ContactSummary | null;
  loading: boolean;
  filter: SegmentFilter;
  /** Apply this filter to the table below and bring it into view. */
  onPick: (next: SegmentFilter) => void;
}) {
  const t = useT(T);
  const fmt = useFormatters();

  const rows = summary?.matrix ?? [];
  const selectedRow = useMemo(
    () => rows.find((r) => r.label === filter.source) ?? null,
    [rows, filter.source]
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

  const clear: SegmentFilter = { source: "", stage: "" };
  /** Clicking the active cell again is "unfilter" — the same gesture both ways. */
  const pickCell = (ref: CellRef) =>
    onPick(
      filter.source === ref.source && filter.stage === ref.stage
        ? clear
        : { source: ref.source, stage: ref.stage }
    );
  const pickSource = (label: string) =>
    onPick(filter.source === label && !filter.stage ? clear : { source: label, stage: "" });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start">
        <SegmentMatrix
          rows={rows}
          other={summary.matrixOther}
          selected={filter.stage ? { source: filter.source, stage: filter.stage } : null}
          onSelect={pickCell}
        />
        <div className="flex flex-col gap-4">
          <SourceTreemap
            rows={tiles}
            selected={filter.source && !filter.stage ? filter.source : null}
            onSelect={pickSource}
          />
          <SegmentSelection row={selectedRow} stage={filter.stage || null} />
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
