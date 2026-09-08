/** THE READOUT — the chosen type's own four KPIs and its own line, first (P3).
 *
 *  Nothing above it but the h1, and the h1 is the type's name: the page opens
 *  on what this kind of business would actually see on screen one of the app
 *  (KPI_PRESETS — "Signups / CAC" for an app, "Revenue / ROAS" for a shop). The
 *  line re-draws on every switch because the path is keyed by type: a remount
 *  re-runs `.chart-draw`, which is the existing house keyframe. */
import type { TypeView } from "./derive";

function linePath(values: number[], w = 1000, h = 220): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = w / (values.length - 1);
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)} ${(h - 20 - ((v - min) / span) * (h - 40)).toFixed(1)}`).join(" ");
}

export default function InstrumentHero({ view, kicker, demoNote }: { view: TypeView; kicker: string; demoNote: string }) {
  const d = linePath(view.series);
  return (
    <section className="rounded-card border border-onyx-line bg-onyx-soft/40 p-5 sm:p-8">
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-brand-300">{kicker}</p>
      <h1 key={view.type} className="animate-fade-up mt-3 text-4xl font-semibold leading-[1.02] tracking-tight text-white sm:text-6xl">
        {view.label}
      </h1>
      <p className="mt-3 max-w-xl text-base text-onyx-muted">{view.goal}</p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
        <svg key={view.type} viewBox="0 0 1000 220" preserveAspectRatio="none" className="h-40 w-full sm:h-52" role="img" aria-label={view.seriesLabel}>
          <path d={`${d} L1000 220 L0 220 Z`} fill="var(--color-brand-500)" fillOpacity="0.12" />
          <path
            d={d}
            pathLength={1}
            className="chart-draw"
            fill="none"
            stroke="var(--color-brand-400)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <dl key={`${view.type}-kpis`} className="stagger grid grid-cols-2 gap-x-6 gap-y-5">
          {view.kpis.map((k) => (
            <div key={k.label}>
              <dt className="tnum min-w-0 break-words font-mono text-xl text-white sm:text-2xl">{k.value}</dt>
              <dd className="mt-1 text-[12px] uppercase tracking-[0.12em] text-onyx-muted">{k.label}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-onyx-muted">
        {view.seriesLabel} · {demoNote}
      </p>
    </section>
  );
}
