/** Pure, server-renderable sparkline (no client JS). Maps a number series to an
 *  SVG path with an optional soft area fill, a signature last-point dot, a faint
 *  baseline at the starting value, and a trend-aware `autoColor` mode that picks
 *  the positive/negative tokens from the first→last delta. Opt-in extras cover
 *  what the analytics modules used to hand-roll: `responsive` full-width sizing,
 *  `markPeak`/`markTrough` extremum dots, a `dashFrom` observed→forecast split
 *  and a fixed `domain` for cross-chart comparability. Used in the hero, every
 *  KPI card, the campaign table and the app modules. */

import { fmtSignedPct } from "@/lib/format";

type Direction = "up" | "down";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  /** draw a baseline-anchored area under the line */
  area?: boolean;
  /** opacity of the area fill (default 0.6; the module trend cards use ~0.1) */
  areaOpacity?: number;
  /** mark the last data point with a dot (the Robinhood/Stocks "you are here").
   *  With `dashFrom` set, the dot marks the last MEASURED point instead — the
   *  boundary where the solid line hands over to the dashed forecast. */
  dot?: boolean;
  /** mark the series' highest point with a dot (first occurrence) */
  markPeak?: boolean;
  /** mark the series' lowest point with a dot (first occurrence) */
  markTrough?: boolean;
  /** index where the modelled/forecast tail begins: points up to and including
   *  `dashFrom` render solid (measured), the tail renders dashed at reduced
   *  opacity — the observed/extrapolated shape of the survival sparklines */
  dashFrom?: number;
  /** fixed y-domain [min, max] instead of auto-scaling to the data range, so
   *  curves stay comparable across rows (e.g. retention fractions on [0, 1]) */
  domain?: readonly [number, number];
  /** size via CSS instead of fixed pixels: `width`/`height` become only the
   *  viewBox coordinate system and the svg fills its container (pair with a
   *  className like "h-9 w-full") */
  responsive?: boolean;
  /** draw a faint dashed line at the series' starting value, so the trend reads
   *  against where it began */
  baseline?: boolean;
  /** derive stroke + fill from the first→last delta, honouring `goodDirection`:
   *  a rising "good" series (or a falling one whose good direction is "down",
   *  e.g. a cost or CPA line) renders positive/green; otherwise negative/red.
   *  A flat series keeps the caller's colours. */
  autoColor?: boolean;
  /** which direction counts as a good trend for `autoColor` (default "up") */
  goodDirection?: Direction;
  /** auto-build an aria-label summarising start, end and % change. Combine with
   *  `formatValue` to localise the endpoints. Ignored when `label` is set. */
  describe?: boolean;
  /** format the start/end values inside the generated aria-label */
  formatValue?: (n: number) => string;
  /** explicit aria-label; overrides `describe` and promotes the SVG to an image
   *  in the accessibility tree (otherwise the chart is decorative/aria-hidden) */
  label?: string;
  /** Build the generated aria-label from already-formatted endpoints + percent.
   *  Defaults to a cs-CZ phrasing; pass this (with a locale-aware `formatValue`)
   *  to localise the label — this component is dependency-free and has no locale
   *  of its own, so the single formatting source stays at the call site. */
  describeLabel?: (parts: { start: string; end: string; pct: string }) => string;
  className?: string;
}

const POSITIVE = { stroke: "var(--color-positive)", fill: "var(--color-positive-soft)" };
const NEGATIVE = { stroke: "var(--color-negative)", fill: "var(--color-negative-soft)" };

/** Percent change first→last, guarding a zero baseline. */
function pctChange(first: number, last: number): number {
  if (first === 0) return last === 0 ? 0 : last > 0 ? 100 : -100;
  return ((last - first) / Math.abs(first)) * 100;
}

export default function Sparkline({
  values,
  width = 120,
  height = 36,
  stroke = "var(--color-brand-500)",
  fill = "var(--color-brand-100)",
  strokeWidth = 2,
  area = true,
  areaOpacity = 0.6,
  dot = false,
  markPeak = false,
  markTrough = false,
  dashFrom,
  domain,
  responsive = false,
  baseline = false,
  autoColor = false,
  goodDirection = "up",
  describe = false,
  formatValue,
  label,
  describeLabel,
  className,
}: SparklineProps) {
  if (values.length < 2) {
    return <svg width={responsive ? undefined : width} height={responsive ? undefined : height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden />;
  }

  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;

  // autoColor: a flat series keeps the caller's colours; otherwise the trend's
  // "goodness" (delta sign vs goodDirection) selects the semantic tokens.
  let lineStroke = stroke;
  let areaFill = fill;
  if (autoColor && delta !== 0) {
    const good = delta > 0 === (goodDirection === "up");
    const tone = good ? POSITIVE : NEGATIVE;
    lineStroke = tone.stroke;
    areaFill = tone.fill;
  }

  // Fixed domain keeps curves comparable across rows (retention on [0, 1]);
  // otherwise the y-axis auto-scales to the data range.
  const min = domain ? domain[0] : Math.min(...values);
  const max = domain ? domain[1] : Math.max(...values);
  const span = max - min || 1;
  const pad = strokeWidth + 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const yFor = (v: number) => pad + (1 - (v - min) / span) * innerH;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    return [x, yFor(v)] as const;
  });

  const pathFor = (points: readonly (readonly [number, number])[]): string =>
    points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");

  const line = pathFor(pts);
  const areaPath = `${line} L${pts[pts.length - 1][0].toFixed(2)} ${height - pad} L${pts[0][0].toFixed(
    2
  )} ${height - pad} Z`;

  // Observed→forecast split: solid head up to `dashFrom`, dashed tail after it
  // (they share the boundary vertex so the segments join seamlessly).
  const splitAt =
    dashFrom !== undefined ? Math.max(0, Math.min(Math.trunc(dashFrom), pts.length - 1)) : undefined;
  const hasTail = splitAt !== undefined && splitAt < pts.length - 1;
  const solidLine = hasTail ? pathFor(pts.slice(0, splitAt + 1)) : line;
  const dashedLine = hasTail ? pathFor(pts.slice(splitAt)) : undefined;

  // The "you are here" dot sits on the last MEASURED point when a forecast
  // tail exists, else on the series' last point.
  const [lastX, lastY] = splitAt !== undefined ? pts[splitAt] : pts[pts.length - 1];

  // Extremum markers (first occurrence wins on ties).
  const peakIndex = markPeak ? values.indexOf(Math.max(...values)) : -1;
  const troughIndex = markTrough ? values.indexOf(Math.min(...values)) : -1;

  // accessibility: an explicit label wins; otherwise summarise the trend.
  let a11yLabel = label;
  if (!a11yLabel && describe) {
    const fmt = formatValue ?? ((n: number) => String(n));
    const pct = pctChange(first, last);
    // Route the percent through the shared signed formatter (comma decimal +
    // true minus in cs), matching the default cs phrasing of `describeLabel`.
    const pctStr = fmtSignedPct(pct / 100, Number.isInteger(pct) ? 0 : 1);
    const parts = { start: fmt(first), end: fmt(last), pct: pctStr };
    a11yLabel = describeLabel
      ? describeLabel(parts)
      : `Trend od ${parts.start} do ${parts.end}, změna ${parts.pct}`;
  }

  return (
    <svg
      width={responsive ? undefined : width}
      height={responsive ? undefined : height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role={a11yLabel ? "img" : undefined}
      aria-label={a11yLabel}
      aria-hidden={a11yLabel ? undefined : true}
      preserveAspectRatio="none"
    >
      {area && <path d={areaPath} fill={areaFill} opacity={areaOpacity} />}
      {baseline && (
        <line
          x1={pad}
          y1={yFor(first)}
          x2={width - pad}
          y2={yFor(first)}
          stroke={lineStroke}
          strokeWidth={1}
          strokeDasharray="3 3"
          opacity={0.3}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={solidLine}
        fill="none"
        stroke={lineStroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {dashedLine && (
        <path
          d={dashedLine}
          fill="none"
          stroke={lineStroke}
          strokeWidth={Math.max(1, strokeWidth - 0.25)}
          strokeOpacity={0.45}
          strokeDasharray="2 2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {[
        ...(markPeak && peakIndex >= 0 ? [pts[peakIndex]] : []),
        ...(markTrough && troughIndex >= 0 ? [pts[troughIndex]] : []),
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={strokeWidth + 0.75} fill={lineStroke} />
      ))}
      {dot && (
        <circle
          cx={lastX}
          cy={lastY}
          r={strokeWidth + 1.5}
          fill={lineStroke}
          stroke="var(--color-surface)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
