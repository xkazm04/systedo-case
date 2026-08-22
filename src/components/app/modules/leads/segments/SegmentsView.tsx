"use client";

/** Segmenty — aggregate overview prototype (direction E). Placeholder until the
 *  builder lands the heat matrix + treemap; keeps the view reachable and typed. */
import { useT } from "@/lib/i18n/client";
import type { AggregateViewProps } from "../view-props";

const T = {
  cs: { pending: "Mapa segmentů se připravuje." },
  en: { pending: "The segment map is being built." },
} as const;

export default function SegmentsView({ summary }: AggregateViewProps) {
  const t = useT(T);
  return (
    <div className="rounded-card border border-line bg-surface p-6 text-sm text-muted">
      {t("pending")}
      {summary ? ` (${Object.keys(summary.bySource ?? {}).length})` : ""}
    </div>
  );
}
