"use client";

import { TrendDown, TrendUp } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import type { Significance } from "@/lib/metrics";

const T = {
  cs: {
    noChange: "beze změny",
    noiseTitle: "Změna v rámci běžného kolísání — statisticky nevýznamná",
    improvingTitle: "Zlepšení oproti předchozímu období",
    worseningTitle: "Zhoršení oproti předchozímu období",
    weakSignal: " · slabý signál",
    strongSignal: " · významné",
  },
  en: {
    noChange: "no change",
    noiseTitle: "Change within normal variance — not statistically significant",
    improvingTitle: "Improvement vs previous period",
    worseningTitle: "Deterioration vs previous period",
    weakSignal: " · weak signal",
    strongSignal: " · significant",
  },
} as const;

/** Coloured change indicator. Knows that for some metrics (cost, PNO) a *drop*
 *  is the good outcome, so the colour reflects "better/worse", not "up/down".
 *  When a `significance` of "noise" is supplied, the change is rendered muted —
 *  it's within normal daily variance and shouldn't read as a real trend. */
export default function DeltaBadge({
  delta,
  goodDirection,
  size = "sm",
  significance,
}: {
  delta: number;
  goodDirection: "up" | "down";
  size?: "sm" | "xs";
  significance?: Significance;
}) {
  const fmt = useFormatters();
  const t = useT(T);

  const sizeCls = size === "xs" ? "!px-2 !py-1 text-[13px]" : "";
  const iconSize = size === "xs" ? 12 : 14;

  // |delta| below this rounds to 0,0 % at one decimal, so render "no change" instead.
  const DELTA_NOISE_FLOOR = 0.0005;
  if (!Number.isFinite(delta) || Math.abs(delta) < DELTA_NOISE_FLOOR) {
    return <span className={`pill bg-navy-50 text-muted ${sizeCls}`}>{t("noChange")}</span>;
  }

  const Icon = delta > 0 ? TrendUp : TrendDown;

  // Statistically insignificant change → muted, so noise never reads as a trend.
  if (significance === "noise") {
    return (
      <span
        className={`pill bg-navy-50 text-muted ${sizeCls}`}
        title={t("noiseTitle")}
      >
        <Icon width={iconSize} height={iconSize} />
        <span className="tnum">{fmt.fmtSignedPct(delta)}</span>
      </span>
    );
  }

  const improving = goodDirection === "up" ? delta > 0 : delta < 0;
  const tone = improving ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative";
  const sigSuffix =
    significance === "weak"
      ? t("weakSignal")
      : significance === "strong"
        ? t("strongSignal")
        : "";

  return (
    <span
      className={`pill ${tone} ${sizeCls}`}
      title={`${improving ? t("improvingTitle") : t("worseningTitle")}${sigSuffix}`}
    >
      <Icon width={iconSize} height={iconSize} />
      <span className="tnum">{fmt.fmtSignedPct(delta)}</span>
    </span>
  );
}
