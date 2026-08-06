"use client";

/** CompetitorBars — share of map-pack clicks across the five businesses in one
 *  pack, your bar lit in brand, the rivals muted. Hand-rolled horizontal SVG
 *  bars (no charting lib) that grow from the axis on entry via the `.bar-grow`
 *  keyframe (scaleX from the left edge, staggered), reduced-motion-safe.
 *  Numbers illustrate the "#1 takes the lion's share of the clicks" dynamic. */
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    you: "Vaše pobočka",
    defaultLabel: "Podíl na proklicích v map packu",
  },
  en: {
    you: "Your location",
    defaultLabel: "Share of map-pack clicks",
  },
} as const;

type Row = { name: string; value: number; you?: boolean };

const RIVALS: Omit<Row, "name">[] = [
  { value: 22 },
  { value: 18 },
  { value: 15 },
  { value: 11 },
];
const RIVAL_NAMES = ["Rival A", "Rival B", "Rival C", "Rival D"];

const W = 520;
const ROW_H = 40;
const PAD = { t: 8, r: 44, b: 8, l: 132 };

export function CompetitorBars({
  data,
  label,
  max,
}: {
  data?: Row[];
  label?: string;
  /** Scale ceiling. Defaults to the local max × 1.15 (headroom for the value label),
   *  so bars scale to the largest value in THIS dataset rather than a fixed 40 — a
   *  caller passing a share above the old constant no longer overflows the plot. Bars
   *  are thus scaled to the local max, not to 100%. */
  max?: number;
}) {
  const t = useT(T);
  const rows =
    data ??
    [
      { name: t("you"), value: 34, you: true },
      ...RIVALS.map((r, i) => ({ ...r, name: RIVAL_NAMES[i] })),
    ];
  const chartLabel = label ?? t("defaultLabel");
  const H = PAD.t + PAD.b + rows.length * ROW_H;
  const plotW = W - PAD.l - PAD.r;
  const barH = 18;
  const scaleMax = max ?? Math.max(1, ...rows.map((d) => d.value)) * 1.15;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label={chartLabel}>
      {rows.map((d, i) => {
        const cy = PAD.t + i * ROW_H + ROW_H / 2;
        const w = (d.value / scaleMax) * plotW;
        return (
          <g key={d.name}>
            {/* label */}
            <text
              x={PAD.l - 12}
              y={cy + 4}
              textAnchor="end"
              className={d.you ? "fill-navy-800 font-semibold" : "fill-muted"}
              style={{ fontSize: 12 }}
            >
              {d.name}
            </text>
            {/* track */}
            <rect
              x={PAD.l}
              y={cy - barH / 2}
              width={plotW}
              height={barH}
              rx={3}
              fill="var(--color-line)"
              opacity={0.4}
            />
            {/* value bar — grows from the left, staggered per row */}
            <rect
              x={PAD.l}
              y={cy - barH / 2}
              width={w}
              height={barH}
              rx={3}
              fill={d.you ? "var(--color-brand-500)" : "var(--color-navy-400)"}
              className="bar-grow"
              style={{ animationDelay: `${i * 90}ms` }}
            />
            {/* value label */}
            <text
              x={PAD.l + w + 8}
              y={cy + 4}
              className={d.you ? "tnum fill-brand-accent font-semibold" : "tnum fill-muted"}
              style={{ fontSize: 12 }}
            >
              {d.value}%
            </text>
          </g>
        );
      })}
    </svg>
  );
}
