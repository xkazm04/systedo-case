/** THE PLAN AND THE SHEET — what this type is told to do first, and how its
 *  overview speaks. Rows re-sort on switch; the fit bar is the only graphic. */
import type { TypeView } from "./derive";

export function InstrumentPlan({ view, title, fitLabel }: { view: TypeView; title: string; fitLabel: string }) {
  return (
    <section className="rounded-card border border-onyx-line bg-onyx-soft/40 p-5 sm:p-6">
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-brand-300">{title}</p>
      <ol key={view.type} className="stagger mt-4 divide-y divide-onyx-line">
        {view.plan.map((c, i) => (
          <li key={c.name} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 py-2.5">
            <span className="tnum font-mono text-[12px] text-onyx-muted">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{c.name}</p>
              <div className="mt-1.5 h-1 w-full rounded-pill bg-onyx-line">
                <div className="h-1 rounded-pill bg-brand-400" style={{ width: `${c.fit}%` }} />
              </div>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-onyx-muted">
              <span className="tnum text-brand-300">{c.fit}</span> {fitLabel} · {c.effort}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function InstrumentSheet({ view, labels }: { view: TypeView; labels: { lead: string; focus: string } }) {
  return (
    <section key={view.type} className="stagger grid grid-cols-1 gap-px overflow-hidden rounded-card border border-onyx-line bg-onyx-line sm:grid-cols-2">
      <div className="bg-onyx-soft/60 p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-onyx-muted">{labels.lead}</p>
        <p className="mt-2 text-sm leading-relaxed text-white">{view.lead}</p>
      </div>
      <div className="bg-onyx-soft/60 p-5">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-onyx-muted">{labels.focus}</p>
        <p className="mt-2 text-sm leading-relaxed text-white">{view.focus}</p>
      </div>
    </section>
  );
}
