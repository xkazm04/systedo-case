/** SPECIMEN — the ranked channel plan as a HISTOGRAM.
 *
 *  Twenty-odd bars, one per curated channel, height = fit (0–100), colour =
 *  effort. The shipped page shows this plan as four bullet points and the
 *  first rebuild as three cards; both hide the shape of the thing, which is
 *  that fit falls off a cliff after the first handful and effort does not
 *  track it. A histogram shows that in one glance. Pure SVG, server-rendered,
 *  no motion of its own — the specimen's `.reveal-on-scroll` is enough. */
import type { OrganicChannel } from "@/lib/organic-channels/types";

const EFFORT_FILL: Record<OrganicChannel["effort"], string> = {
  low: "var(--color-brand-400)",
  medium: "var(--color-coral-400)",
  high: "var(--color-navy-300)",
};

export default function ExhibitHistogram({
  plan,
  legend,
}: {
  plan: OrganicChannel[];
  legend: Record<OrganicChannel["effort"], string>;
}) {
  const bars = [...plan].sort((a, b) => b.fit - a.fit);
  const W = 1000;
  const H = 300;
  const gap = 6;
  const bw = (W - gap * (bars.length - 1)) / bars.length;
  const top = bars[0];

  return (
    <div className="px-5 pt-5">
      <svg viewBox={`0 0 ${W} ${H + 40}`} className="block h-auto w-full" role="img" aria-label={`${bars.length} channels ranked by fit`}>
        {/* baseline rules at 25/50/75/100 */}
        {[25, 50, 75, 100].map((v) => (
          <line
            key={v}
            x1={0}
            x2={W}
            y1={H - (v / 100) * H}
            y2={H - (v / 100) * H}
            stroke="var(--color-onyx-line)"
            strokeWidth={1}
            strokeDasharray={v === 100 ? undefined : "4 6"}
          />
        ))}
        {bars.map((c, i) => {
          const h = (c.fit / 100) * H;
          return (
            <g key={c.id}>
              <rect
                x={i * (bw + gap)}
                y={H - h}
                width={bw}
                height={h}
                fill={EFFORT_FILL[c.effort]}
                opacity={i === 0 ? 1 : 0.82}
                rx={2}
              />
              {i < 3 && (
                <text
                  x={i * (bw + gap) + bw / 2}
                  y={H - h - 10}
                  textAnchor="middle"
                  fontSize="18"
                  fontFamily="var(--font-mono)"
                  fill="var(--color-brand-300)"
                >
                  {c.fit}
                </text>
              )}
            </g>
          );
        })}
        <text x={0} y={H + 30} fontSize="16" fontFamily="var(--font-mono)" fill="var(--color-onyx-muted)">
          01 {top?.name}
        </text>
        <text x={W} y={H + 30} textAnchor="end" fontSize="16" fontFamily="var(--font-mono)" fill="var(--color-onyx-muted)">
          {String(bars.length).padStart(2, "0")} {bars[bars.length - 1]?.name}
        </text>
      </svg>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 pb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-onyx-muted">
        {(Object.keys(EFFORT_FILL) as OrganicChannel["effort"][]).map((e) => (
          <li key={e} className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: EFFORT_FILL[e] }} aria-hidden />
            {legend[e]}
          </li>
        ))}
      </ul>
    </div>
  );
}
