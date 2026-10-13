/** A half-dial gauge (ADR-0014), drawn for a ratio against a goal — the PNO
 *  gauge is its first tenant. The arc is a hairline, the reading is one stroke in
 *  the caller's tone, and the goal is an engraved tick. The number is printed in
 *  mono under the arc, so the dial is never the only place the value lives. */

const R = 70;
const CX = 90;
const CY = 86;

function point(frac: number): [number, number] {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, frac)));
  return [CX + R * Math.cos(a), CY - R * Math.sin(a)];
}

function arc(from: number, to: number): string {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function Dial({
  value,
  max,
  goal,
  display,
  caption,
  good,
  label,
}: {
  value: number;
  max: number;
  goal?: number;
  /** Pre-formatted reading, e.g. "15.0 %". */
  display: string;
  caption?: string;
  /** Whether the reading is on the good side of the goal. */
  good: boolean;
  /** Accessible name, e.g. "PNO 15 %, goal 15 %". */
  label: string;
}) {
  const frac = max > 0 ? value / max : 0;
  const tone = good ? "var(--color-positive)" : "var(--color-negative)";
  const goalPt = goal !== undefined && max > 0 ? point(goal / max) : null;
  return (
    <figure className="grid justify-items-center gap-1">
      <svg viewBox="0 0 180 100" role="img" aria-label={label} className="optic-art w-full max-w-[15rem]">
        <path className="lo" d={arc(0, 1)} />
        <path className="glow" d={arc(0, frac)} style={{ stroke: tone }} />
        <path className="hue" d={arc(0, frac)} style={{ stroke: tone }} />
        {goalPt ? (
          <path className="ln" d={`M${goalPt[0].toFixed(2)} ${(goalPt[1] - 9).toFixed(2)}v18`} />
        ) : null}
      </svg>
      <figcaption className="grid justify-items-center">
        <span className="font-mono text-2xl tabular-nums text-ink">{display}</span>
        {caption ? <span className="text-sm text-muted">{caption}</span> : null}
      </figcaption>
    </figure>
  );
}
