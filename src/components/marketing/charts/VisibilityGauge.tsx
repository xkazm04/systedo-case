/** VisibilityGauge — a radial "signal strength" dial for map-pack visibility,
 *  sweeping 0 → target on entry. Hand-rolled SVG (a stroked circle with
 *  pathLength=100 so the dash maths is a plain percentage) plus a faint track;
 *  the live % is overlaid in the centre as an animated <Tally>. The arc sweeps
 *  via the `.gauge-sweep` keyframe (globals.css), reduced-motion-safe. */
import { Tally } from "@/components/motion/Kinetics";

export function VisibilityGauge({
  value = 67,
  caption = "viditelnost",
  label = "Map-pack visibility",
}: {
  value?: number;
  caption?: string;
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));

  return (
    <div className="relative h-full w-full" role="img" aria-label={`${label}: ${v}%`}>
      <svg viewBox="0 0 120 120" width="100%" height="100%">
        {/* track */}
        <circle
          cx={60}
          cy={60}
          r={48}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={12}
        />
        {/* value arc — starts at 12 o'clock (rotate -90 around centre) */}
        <circle
          cx={60}
          cy={60}
          r={48}
          fill="none"
          stroke="var(--color-brand-500)"
          strokeWidth={12}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${v} 100`}
          className="gauge-sweep"
          style={{ ["--gauge-arc" as string]: String(v), transform: "rotate(-90deg)", transformOrigin: "60px 60px" }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <Tally
          to={v}
          suffix="%"
          className="tnum text-4xl font-semibold tracking-tight text-brand-accent"
        />
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          {caption}
        </span>
      </div>
    </div>
  );
}
