"use client";

/** "Uzavřené · N" — the closed records, kept OFF the canvas's foreground and one
 *  disclosure away.
 *
 *  They are not hidden: a closed contact still draws as a settled (navy) dot in
 *  its cluster, because dropping it would make every cluster count disagree with
 *  the summary bar above the database. What the drawer adds is the way IN — the
 *  three terminal stages, each a filter into the table. */
import { useState } from "react";
import { Button } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { ContactSummary } from "@/lib/leads/summary";
import type { ContactQuery } from "@/lib/leads/store-filter";
import type { PipelineStage } from "@/lib/leads/types";
import { STAGE_T } from "../copy";

const T = {
  cs: { title: "Uzavřené · {n}", expand: "rozbalit", collapse: "sbalit", open: "Otevřít v tabulce" },
  en: { title: "Closed · {n}", expand: "expand", collapse: "collapse", open: "Open in table" },
} as const;

const CLOSED: PipelineStage[] = ["won", "lost", "disqualified"];

export default function ClosedDrawer({
  summary,
  onOpenInTable,
}: {
  summary: ContactSummary | null;
  onOpenInTable: (q: Partial<ContactQuery>) => void;
}) {
  const t = useT(T);
  const stage = useT(STAGE_T);
  const { fmtInt } = useFormatters();
  const [open, setOpen] = useState(false);
  if (!summary) return null;

  const rows = CLOSED.map((s) => ({ stage: s, count: summary.byStage[s] ?? 0 }));
  const total = rows.reduce((n, r) => n + r.count, 0);
  if (total === 0) return null;

  return (
    <div className="rounded-card border border-line bg-surface p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tnum text-xs text-muted hover:text-ink"
      >
        {t("title", { n: fmtInt(total) })} · {open ? t("collapse") : t("expand")}
      </button>
      {open && (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.stage} className="flex items-center justify-between gap-3 text-xs">
              <span className="tnum text-ink">
                {stage(r.stage)} · {fmtInt(r.count)}
              </span>
              <Button size="sm" variant="secondary" onClick={() => onOpenInTable({ stage: r.stage })}>
                {t("open")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
