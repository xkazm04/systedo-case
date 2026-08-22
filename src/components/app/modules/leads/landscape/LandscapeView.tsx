"use client";

/** Krajina — aggregate overview prototype (direction F). Placeholder until the
 *  builder lands the semantic-zoom canvas; keeps the view reachable and typed. */
import { useT } from "@/lib/i18n/client";
import type { AggregateViewProps } from "../view-props";

const T = {
  cs: { pending: "Krajina leadů se připravuje." },
  en: { pending: "The lead landscape is being built." },
} as const;

export default function LandscapeView({ summary }: AggregateViewProps) {
  const t = useT(T);
  return (
    <div className="rounded-card border border-line bg-surface p-6 text-sm text-muted">
      {t("pending")}
      {summary ? ` (${Object.keys(summary.bySource ?? {}).length})` : ""}
    </div>
  );
}
