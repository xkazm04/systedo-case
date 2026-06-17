import { TrendDown, TrendUp } from "@/components/icons";
import { fmtSignedPct } from "@/lib/format";
import type { Significance } from "@/lib/metrics";

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
  const sizeCls = size === "xs" ? "!px-2 !py-1 text-[13px]" : "";
  const iconSize = size === "xs" ? 12 : 14;

  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) {
    return <span className={`pill bg-navy-50 text-muted ${sizeCls}`}>beze změny</span>;
  }

  const Icon = delta > 0 ? TrendUp : TrendDown;

  // Statistically insignificant change → muted, so noise never reads as a trend.
  if (significance === "noise") {
    return (
      <span
        className={`pill bg-navy-50 text-muted ${sizeCls}`}
        title="Změna v rámci běžného kolísání — statisticky nevýznamná"
      >
        <Icon width={iconSize} height={iconSize} />
        <span className="tnum">{fmtSignedPct(delta)}</span>
      </span>
    );
  }

  const improving = goodDirection === "up" ? delta > 0 : delta < 0;
  const tone = improving ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative";

  return (
    <span
      className={`pill ${tone} ${sizeCls}`}
      title={`${improving ? "Zlepšení" : "Zhoršení"} oproti předchozímu období${
        significance === "weak" ? " · slabý signál" : significance === "strong" ? " · významné" : ""
      }`}
    >
      <Icon width={iconSize} height={iconSize} />
      <span className="tnum">{fmtSignedPct(delta)}</span>
    </span>
  );
}
