/** Pure, server-renderable sparkline (no client JS). Maps a number series to an
 *  SVG path with an optional soft area fill. Used in the hero and KPI cards. */

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  /** draw a baseline-anchored area under the line */
  area?: boolean;
  className?: string;
}

export default function Sparkline({
  values,
  width = 120,
  height = 36,
  stroke = "var(--color-brand-500)",
  fill = "var(--color-brand-100)",
  strokeWidth = 2,
  area = true,
  className,
}: SparklineProps) {
  if (values.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = strokeWidth + 1;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const y = pad + (1 - (v - min) / span) * innerH;
    return [x, y] as const;
  });

  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${line} L${pts[pts.length - 1][0].toFixed(2)} ${height - pad} L${pts[0][0].toFixed(
    2
  )} ${height - pad} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      preserveAspectRatio="none"
    >
      {area && <path d={areaPath} fill={fill} opacity={0.6} />}
      <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
