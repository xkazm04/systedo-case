import { TrendDown, TrendUp } from "@/components/icons";
import { fmtSignedPct } from "@/lib/format";

/** Coloured change indicator. Knows that for some metrics (cost, PNO) a *drop*
 *  is the good outcome, so the colour reflects "better/worse", not "up/down". */
export default function DeltaBadge({
  delta,
  goodDirection,
  size = "sm",
}: {
  delta: number;
  goodDirection: "up" | "down";
  size?: "sm" | "xs";
}) {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0005) {
    return (
      <span className={`pill bg-navy-50 text-muted ${size === "xs" ? "!px-2 !py-1 text-[11px]" : ""}`}>
        beze změny
      </span>
    );
  }

  const improving = goodDirection === "up" ? delta > 0 : delta < 0;
  const Icon = delta > 0 ? TrendUp : TrendDown;
  const tone = improving ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative";

  return (
    <span
      className={`pill ${tone} ${size === "xs" ? "!px-2 !py-1 text-[11px]" : ""}`}
      title={`${improving ? "Zlepšení" : "Zhoršení"} oproti předchozímu období`}
    >
      <Icon width={size === "xs" ? 12 : 14} height={size === "xs" ? 12 : 14} />
      <span className="tnum">{fmtSignedPct(delta)}</span>
    </span>
  );
}
