"use client";

/** What a lasso selection can actually do.
 *
 *  `ContactQuery` can express a stage and a free-text needle — nothing else. So a
 *  mixed-stage marquee has NO filter that provably lands on the same people, and
 *  this bar says so and disables the drill rather than opening a table quietly
 *  showing a different set (`selectionQuery` is the pure rule, unit-tested). */
import { Button } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import { selectionQuery, type LandscapePoint } from "@/lib/leads/landscape";
import type { ContactQuery } from "@/lib/leads/store-filter";

const T = {
  cs: {
    selected: "Vybráno {n}",
    open: "Otevřít výběr v tabulce",
    noFilter: "Výběr míchá víc fází — tabulka pro něj nemá filtr, který by ho přesně pokryl.",
    clear: "Zrušit výběr",
  },
  en: {
    selected: "{n} selected",
    open: "Open the selection in the table",
    noFilter: "The selection mixes stages — the table has no filter that covers it exactly.",
    clear: "Clear selection",
  },
} as const;

export default function SelectionBar({
  points,
  onOpenInTable,
  onClear,
}: {
  points: readonly LandscapePoint[];
  onOpenInTable: (q: Partial<ContactQuery>) => void;
  onClear: () => void;
}) {
  const t = useT(T);
  const { fmtInt } = useFormatters();
  if (points.length === 0) return null;
  const query = selectionQuery(points);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-2">
      <span className="tnum text-xs font-semibold text-ink">
        {t("selected", { n: fmtInt(points.length) })}
      </span>
      {query ? (
        <Button size="sm" onClick={() => onOpenInTable(query)}>
          {t("open")}
        </Button>
      ) : (
        <span className="text-xs text-muted">{t("noFilter")}</span>
      )}
      <Button size="sm" variant="ghost" onClick={onClear}>
        {t("clear")}
      </Button>
    </div>
  );
}
