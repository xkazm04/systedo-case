/** CompetitorBars — share of map-pack clicks across the five businesses in one
 *  pack, your bar lit in brand, the rivals muted. Hand-rolled horizontal SVG
 *  bars (no charting lib) that grow from the axis on entry via the `.bar-grow`
 *  keyframe (scaleX from the left edge, staggered), reduced-motion-safe.
 *  Numbers illustrate the "#1 takes the lion's share of the clicks" dynamic. */

type Row = { name: string; value: number; you?: boolean };

const DATA: Row[] = [
  { name: "Vaše pobočka", value: 34, you: true },
  { name: "Rival A", value: 22 },
  { name: "Rival B", value: 18 },
  { name: "Rival C", value: 15 },
  { name: "Rival D", value: 11 },
];

const W = 520;
const ROW_H = 40;
const PAD = { t: 8, r: 44, b: 8, l: 132 };
const MAX = 40;

export function CompetitorBars({
  data = DATA,
  label = "Share of map-pack clicks",
}: {
  data?: Row[];
  label?: string;
}) {
  const H = PAD.t + PAD.b + data.length * ROW_H;
  const plotW = W - PAD.l - PAD.r;
  const barH = 18;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" role="img" aria-label={label}>
      {data.map((d, i) => {
        const cy = PAD.t + i * ROW_H + ROW_H / 2;
        const w = (d.value / MAX) * plotW;
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
