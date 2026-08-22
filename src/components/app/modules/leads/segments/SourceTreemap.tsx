"use client";

/** Sources as a treemap: AREA = how many contacts the source produced, TINT = the
 *  share of them graded A or B. Two encodings, but only one hue — the teal ramp is
 *  a magnitude scale, not a set of categories, and the semantic colours stay
 *  reserved for the SLA axis in the matrix beside it.
 *
 *  A treemap rather than a bar list because the question here is proportion ("half
 *  of everything comes from one source"), which an area answers at a glance and a
 *  bar list makes you compute. The layout itself is pure and unit-tested
 *  (`treemap.ts`); this file only paints it. */
import { useMemo } from "react";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { SourceGradeRow } from "@/lib/leads/summary";
import { squarify } from "./treemap";

const T = {
  cs: {
    title: "Zdroje podle objemu",
    legend: "plocha = počet · sytost = podíl A/B",
    tile: "{label}: {n} kontaktů, {p} se známkou A nebo B",
    empty: "Žádné zdroje k zobrazení.",
  },
  en: {
    title: "Sources by volume",
    legend: "area = count · saturation = A/B share",
    tile: "{label}: {n} contacts, {p} graded A or B",
    empty: "No sources to show.",
  },
} as const;

/** How many sources the map draws. Below ~2 % of the area a tile is a sliver whose
 *  area encodes nothing readable, so the tail is left out of the picture rather
 *  than drawn as a lie; the matrix's footer already discloses the remainder. */
const TILE_CAP = 10;

/** One hue, five steps — a sequential ramp. Every step pairs a background token
 *  with a text token that flips WITH it, so the tile stays legible in dark mode
 *  (brand-700 is a deliberately stable dark teal, hence white on it). */
function ramp(share: number): string {
  if (share >= 0.6) return "bg-brand-700 text-white";
  if (share >= 0.45) return "bg-brand-200 text-brand-900";
  if (share >= 0.3) return "bg-brand-100 text-brand-900";
  if (share > 0) return "bg-brand-50 text-brand-900";
  return "bg-navy-50 text-navy-800";
}

export default function SourceTreemap({
  rows,
  selected,
  onSelect,
}: {
  rows: SourceGradeRow[];
  selected: string | null;
  onSelect: (label: string) => void;
}) {
  const t = useT(T);
  const fmt = useFormatters();

  const tiles = useMemo(
    () =>
      squarify(
        rows.slice(0, TILE_CAP).map((r) => ({ key: r.label, value: r.count })),
        100,
        100
      ),
    [rows]
  );
  const byLabel = useMemo(() => new Map(rows.map((r) => [r.label, r])), [rows]);

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy-800">{t("title")}</h3>
        <span className="text-xs text-muted">{t("legend")}</span>
      </div>

      {tiles.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <div className="relative aspect-[4/3] w-full">
          {tiles.map((tile) => {
            const row = byLabel.get(tile.key);
            const share = row?.abShare ?? 0;
            const isSelected = selected === tile.key;
            const roomy = tile.w >= 18 && tile.h >= 16;
            return (
              <button
                key={tile.key}
                type="button"
                onClick={() => onSelect(tile.key)}
                aria-pressed={isSelected}
                aria-label={t("tile", {
                  label: tile.key,
                  n: fmt.fmtInt(tile.value),
                  p: fmt.fmtPct(share, 0),
                })}
                title={`${tile.key} · ${fmt.fmtInt(tile.value)} · A/B ${fmt.fmtPct(share, 0)}`}
                style={{
                  position: "absolute",
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.w}%`,
                  height: `${tile.h}%`,
                }}
                className={`flex flex-col justify-between overflow-hidden rounded-card border p-2 text-left ${ramp(
                  share
                )} ${isSelected ? "border-brand-500 shadow-card" : "border-surface"}`}
              >
                <span className="truncate text-[11px] leading-tight opacity-90">{tile.key}</span>
                <span className="truncate text-xs font-semibold">
                  <span className="tnum">{fmt.fmtInt(tile.value)}</span>
                  {roomy ? <span className="font-normal opacity-90"> · A/B {fmt.fmtPct(share, 0)}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
