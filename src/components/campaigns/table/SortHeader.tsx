"use client";

import { ChevronDown } from "@/components/icons";
import type { SortKey, SortState } from "./sort";

/** A sortable column header cell for CampaignTable. Extracted subcomponent —
 *  render-only. The `title` string is pre-translated by the parent (which owns
 *  the cs/en dict), so this stays decoupled from the translation table. */
export default function SortHeader({
  col,
  sort,
  onSort,
  title,
}: {
  col: { key: SortKey; label: string; align: "left" | "right" };
  sort: SortState;
  onSort: (key: SortKey) => void;
  /** pre-translated `sortTitle` tooltip for this column */
  title: string;
}) {
  const active = sort.key === col.key;
  const right = col.align === "right";
  return (
    <th
      className={`${right ? "px-3 text-right" : "px-5 text-left"} py-3 font-semibold`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(col.key)}
        title={title}
        className={`group -my-1 inline-flex items-center gap-1 py-1 uppercase tracking-wide transition-colors hover:text-navy-700 ${
          right ? "flex-row-reverse" : ""
        } ${active ? "text-navy-700" : ""}`}
      >
        {col.label}
        <ChevronDown
          width={13}
          height={13}
          aria-hidden
          className={`shrink-0 transition-[transform,opacity] ${
            active ? "text-brand-accent opacity-100" : "opacity-0 group-hover:opacity-50"
          } ${active && sort.dir === "asc" ? "rotate-180" : ""}`}
        />
      </button>
    </th>
  );
}
