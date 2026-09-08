/** THE FIELD, THE LINE, THE FIGURES — scenes 2 to 5 of the stage.
 *
 *  Scene 2 lands the ranked channel plan as a FIELD: a 12-column grid where a
 *  tile's span is its fit band (≥80 → 4, ≥65 → 3, else 2), so the plan reads as
 *  a landscape rather than a list. Scene 3 pulls the top three forward and gives
 *  them a lifecycle strip. Scene 4 compresses the field to a floor and draws the
 *  revenue line across the stage — the line is our own path with
 *  `pathLength="1"`, because the shared Sparkline keeps its path private and the
 *  draw has to be a CSS animation the scene can trigger. Figures arrive one at a
 *  time after it (P6). Every number is derived; nothing is typed. */
import type { CSSProperties } from "react";

export interface FieldData {
  tiles: { name: string; fit: number; effort: string; top: boolean }[];
  stages: string[];
  series: number[];
  figures: { value: string; label: string }[];
}

/** Map a series to an SVG path in a 1000×240 box with a little headroom. */
function linePath(values: number[], w = 1000, h = 240): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - 24 - ((v - min) / span) * (h - 48)).toFixed(1)}`)
    .join(" ");
}

function spanFor(fit: number): string {
  if (fit >= 80) return "col-span-4";
  if (fit >= 65) return "col-span-3";
  return "col-span-2";
}

export default function StoryField({ data }: { data: FieldData }) {
  const d = linePath(data.series);
  const area = `${d} L1000 240 L0 240 Z`;

  return (
    <>
      {/* scene 2/3 — the field */}
      <div data-for="field" className="absolute inset-x-0 top-[17%] mx-auto grid w-full max-w-4xl grid-cols-12 gap-1.5 sm:top-[18%] sm:gap-3">
        {data.tiles.map((t, i) => (
          <div
            key={t.name}
            className={`story-tile ${spanFor(t.fit)} relative rounded-lg border border-onyx-line bg-onyx-soft/85 px-2 py-1.5 shadow-card sm:rounded-card sm:px-3 sm:py-2.5`}
            style={{ "--i": i } as CSSProperties}
            {...(t.top ? { "data-top": "" } : {})}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-[11px] font-semibold text-white sm:text-[13px]">{t.name}</p>
              <p className="tnum shrink-0 font-mono text-[12px] text-brand-300">{t.fit}</p>
            </div>
            <div className="mt-2 h-1 w-full rounded-pill bg-onyx-line">
              <div className="h-1 rounded-pill bg-brand-400" style={{ width: `${t.fit}%` }} />
            </div>
            {/* the lifecycle strip only the pinned three get, at scene 3 */}
            <div className="story-stage-strip mt-2 hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-onyx-muted sm:flex">
              {data.stages.map((s, j) => (
                <span key={s} className={j === 0 ? "text-brand-300" : ""}>
                  {j > 0 && <span className="mr-1.5 text-onyx-line">→</span>}
                  {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* scene 4 — the line */}
      <div data-for="chart" className="absolute inset-x-0 bottom-[6%] mx-auto w-full max-w-4xl">
        <svg viewBox="0 0 1000 240" preserveAspectRatio="none" className="h-28 w-full sm:h-56">
          <path d={area} fill="var(--color-brand-500)" fillOpacity="0.12" />
          <path
            d={d}
            pathLength={1}
            className="story-line"
            fill="none"
            stroke="var(--color-brand-400)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* scene 4 — the figures, one at a time */}
      <div data-for="figures" className="absolute inset-x-0 top-[17%] mx-auto grid w-full max-w-4xl grid-cols-2 gap-x-4 gap-y-3 px-2 sm:top-[16%] sm:grid-cols-4 sm:gap-x-8 sm:gap-y-5">
        {data.figures.map((f) => (
          <div key={f.label} className="story-figure">
            <p className="tnum text-2xl font-semibold tracking-tight text-brand-300 sm:text-4xl">{f.value}</p>
            <p className="mt-1.5 text-[12px] leading-snug text-onyx-muted sm:text-sm">{f.label}</p>
          </div>
        ))}
      </div>
    </>
  );
}
