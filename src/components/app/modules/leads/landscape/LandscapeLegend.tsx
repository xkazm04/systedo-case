"use client";

/** What the canvas's two encodings mean. Stated in words next to the map rather
 *  than left to be inferred — a colour nobody can decode is decoration. */
import { useT } from "@/lib/i18n/client";
import { SLA_COLOR, SLA_T } from "./labels";

const T = {
  cs: { radial: "střed = nejnovější, okraj = nejstarší", ring: "prstenec = mix fází" },
  en: { radial: "centre = newest, rim = oldest", ring: "ring = stage mix" },
} as const;

const PHASES = ["ontrack", "warning", "breached"] as const;

export default function LandscapeLegend() {
  const t = useT(T);
  const sla = useT(SLA_T);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-pill border border-line bg-surface px-4 py-2 text-xs text-muted">
      {PHASES.map((p) => (
        <span key={p} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-pill"
            style={{ background: SLA_COLOR[p] }}
          />
          {sla(p)}
        </span>
      ))}
      <span>· {t("radial")}</span>
      <span>· {t("ring")}</span>
    </div>
  );
}
