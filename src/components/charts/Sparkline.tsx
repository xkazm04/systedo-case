/** Pure, server-renderable sparkline (no client JS). Maps a number series to an
 *  SVG path with an optional soft area fill, a signature last-point dot, a faint
 *  baseline at the starting value, and a trend-aware `autoColor` mode that picks
 *  the positive/negative tokens from the first→last delta. Opt-in extras cover
 *  what the analytics modules used to hand-roll: `responsive` full-width sizing,
 *  `markPeak`/`markTrough` extremum dots, a `dashFrom` observed→forecast split
 *  and a fixed `domain` for cross-chart comparability. Used in the hero, every
 *  KPI card, the campaign table and the app modules. */

import { createFormatters, DEFAULT_LOCALE, type SupportedLocale } from "@/lib/format";
import { trendAriaLabel } from "./trendLabel";

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
  /** Locale for the generated aria-label's phrasing AND its percent formatting
   *  (comma vs. dot decimal). Defaults to cs so existing callers are unchanged;
   *  pass `"en"` (with a locale-aware `formatValue` for the endpoints) so an
   *  en-locale screen reader doesn't hear a Czech sentence. Ignored when an
   *  explicit `label` or `describeLabel` is supplied. */
  locale?: SupportedLocale;
  /** Override the generated aria-label from already-formatted endpoints +
   *  percent. When omitted, the label is built by `trendAriaLabel(locale, …)`. */
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

/** A resolution-independent marker dot: a zero-length, round-capped stroke renders
 *  as a perfect circle of `diameter` SCREEN pixels no matter how the SVG is scaled.
 *  A real <circle> would smear into an ellipse under `preserveAspectRatio="none"`
 *  (non-uniform scaling of its viewBox-unit radius); the non-scaling stroke cap
 *  keeps the signature dot round on any container aspect ratio. */
function Dot({ x, y, diameter, color }: { x: number; y: number; diameter: number; color: string }) {
  const p = `M${x.toFixed(2)} ${y.toFixed(2)} L${x.toFixed(2)} ${y.toFixed(2)}`;
  return (
    <path
      d={p}
      fill="none"
      stroke={color}
      strokeWidth={diameter}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  );
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
  locale = DEFAULT_LOCALE,
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
    // Route the percent through the locale's signed formatter (comma decimal +
    // true minus in cs; dot + ASCII minus in en) so it matches the phrasing.
    const pctStr = createFormatters(locale).fmtSignedPct(
      pct / 100,
      Number.isInteger(pct) ? 0 : 1
    );
    const parts = { start: fmt(first), end: fmt(last), pct: pctStr };
    a11yLabel = describeLabel ? describeLabel(parts) : trendAriaLabel(locale, parts);
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
        // radius strokeWidth + 0.75 → diameter 2*strokeWidth + 1.5
        <Dot key={i} x={cx} y={cy} diameter={2 * strokeWidth + 1.5} color={lineStroke} />
      ))}
      {dot && (
        // The "you are here" dot: a surface-coloured ring (radius r + 0.75) under a
        // filled core (radius r = strokeWidth + 1.5), both as non-scaling round dots.
        <>
          <Dot x={lastX} y={lastY} diameter={2 * strokeWidth + 4.5} color="var(--color-surface)" />
          <Dot x={lastX} y={lastY} diameter={2 * strokeWidth + 3} color={lineStroke} />
        </>
      )}
    </svg>
  );
}
