"use client";

/** Přehled ↔ Jednotlivci — the semantic-zoom scrubber.
 *
 *  A native `<input type="range">` on purpose: it is the one control that is
 *  simultaneously a drag gesture and a full keyboard control (arrows, Home/End),
 *  so the canvas's central interaction needs no separate keyboard alternative. */
import { useT } from "@/lib/i18n/client";
import { Button } from "@/components/ui";

const T = {
  cs: {
    label: "Úroveň přiblížení",
    overview: "Přehled",
    people: "Jednotlivci",
    lassoOn: "Laso: zapnuto",
    lassoOff: "Laso",
    lassoHint: "Tažením myši vyberte body; výběr pak otevřete v tabulce.",
  },
  en: {
    label: "Zoom level",
    overview: "Overview",
    people: "Individuals",
    lassoOn: "Lasso: on",
    lassoOff: "Lasso",
    lassoHint: "Drag to select dots; the selection then opens in the table.",
  },
} as const;

export default function ZoomScrubber({
  zoom,
  onZoom,
  lasso,
  onLasso,
  lassoDisabled,
}: {
  zoom: number;
  onZoom: (z: number) => void;
  lasso: boolean;
  onLasso: (on: boolean) => void;
  lassoDisabled: boolean;
}) {
  const t = useT(T);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-pill border border-line bg-surface px-4 py-2">
      <span className="text-xs text-muted">{t("overview")}</span>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(zoom * 100)}
        aria-label={t("label")}
        onChange={(e) => onZoom(Number(e.target.value) / 100)}
        className="h-1 w-32 accent-brand-700"
      />
      <span className="text-xs text-muted">{t("people")}</span>
      <Button
        size="sm"
        variant={lasso ? "primary" : "secondary"}
        aria-pressed={lasso}
        title={t("lassoHint")}
        disabled={lassoDisabled}
        onClick={() => onLasso(!lasso)}
      >
        {lasso ? t("lassoOn") : t("lassoOff")}
      </Button>
    </div>
  );
}
