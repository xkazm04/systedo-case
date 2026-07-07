/** RankClimbChart — the signature marketing viz: 90 days of map-pack rank, your
 *  pin climbing #5 → #1 while the top rival drifts. Hand-rolled inline SVG on
 *  design tokens (no charting lib — matches TrendChart's house style), with an
 *  *inverted* rank axis (#1 at the top = best). The line draws in on mount via
 *  the `.chart-draw` keyframe (globals.css); wrap in <ChartReveal> to replay it
 *  on scroll-in. Reduced-motion neutralises the draw (settles to final state).
 *
 *  Data is illustrative of the climb the product sells, not a live series. */

const YOU = [5, 5, 4, 3, 2, 1, 1];
const RIVAL = [2, 2, 2, 3, 3, 3, 3];
const LABELS = ["0", "15", "30", "45", "60", "75", "90"];

const W = 520;
const H = 260;
const PAD = { t: 20, r: 20, b: 34, l: 40 };
const Y_MIN = 1;
const Y_MAX = 5;

const plotW = W - PAD.l - PAD.r;
const plotH = H - PAD.t - PAD.b;

const x = (i: number) => PAD.l + (i / (YOU.length - 1)) * plotW;
// Inverted: rank #1 sits at the top (padT), #5 at the bottom.
const y = (rank: number) => PAD.t + ((rank - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

function linePath(series: number[]): string {
  return series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
}

export function RankClimbChart({ label = "You vs. top rival — map-pack rank" }: { label?: string }) {
  const youLine = linePath(YOU);
  const areaPath = `${youLine} L${x(YOU.length - 1).toFixed(1)} ${(H - PAD.b).toFixed(1)} L${x(0).toFixed(1)} ${(H - PAD.b).toFixed(1)} Z`;
  const rivalLine = linePath(RIVAL);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="100%"
      role="img"
      aria-label={label}
      className="overflow-visible"
    >
      <defs>
        <linearGradient id="rankClimbFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" stopOpacity={0.28} />
          <stop offset="100%" stopColor="var(--color-brand-500)" stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* rank gridlines + axis labels (#1..#5) */}
      {[1, 2, 3, 4, 5].map((rank) => (
        <g key={rank}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={y(rank)}
            y2={y(rank)}
            stroke="var(--color-line)"
            strokeWidth={1}
            strokeDasharray={rank === 1 ? "0" : "3 4"}
          />
          <text
            x={PAD.l - 8}
            y={y(rank) + 3}
            textAnchor="end"
            className="tnum fill-muted"
            style={{ fontSize: 11 }}
          >
            #{rank}
          </text>
        </g>
      ))}

      {/* x labels (days) */}
      {LABELS.map((d, i) => (
        <text
          key={d}
          x={x(i)}
          y={H - 12}
          textAnchor={i === 0 ? "start" : i === LABELS.length - 1 ? "end" : "middle"}
          className="fill-muted"
          style={{ fontSize: 10 }}
        >
          {i === 0 ? "Den 0" : `+${d}`}
        </text>
      ))}

      {/* area under "you" — fades in beneath the drawn line */}
      <path d={areaPath} fill="url(#rankClimbFill)" className="animate-fade-in" />

      {/* rival — muted dashed, drawn slightly after */}
      <path
        d={rivalLine}
        pathLength={1}
        fill="none"
        stroke="var(--color-navy-400)"
        strokeWidth={1.75}
        strokeDasharray="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="chart-draw"
        style={{ animationDelay: "220ms", strokeDasharray: "5 4" }}
      />

      {/* you — brand line, draws #5 → #1 */}
      <path
        d={youLine}
        pathLength={1}
        fill="none"
        stroke="var(--color-brand-500)"
        strokeWidth={2.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="chart-draw"
      />

      {/* reference dot at the moment it reaches #1 (Day 75) */}
      <circle
        cx={x(5)}
        cy={y(1)}
        r={5}
        fill="var(--color-brand-500)"
        stroke="var(--color-surface)"
        strokeWidth={2}
        className="animate-fade-in"
        style={{ animationDelay: "1.2s" }}
      />
    </svg>
  );
}
