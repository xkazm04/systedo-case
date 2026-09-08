/** SPECIMENS — the four figures as PLATES, and "works across" as a LEDGER.
 *
 *  Plates: one figure per plate, mono numerals, arriving one at a time (P6,
 *  through `.mono-seq`) — the same four the dashboard renders, labelled demo.
 *  Ledger: the channel support levels as four hairline rows. Both are the
 *  shipped page's facts with the paragraphs taken away. */
import type { Figure } from "./ExhibitHero";

export function ExhibitPlates({ figures }: { figures: Figure[] }) {
  return (
    <div className="mono-seq grid grid-cols-2 gap-px bg-onyx-line">
      {figures.map((f) => (
        <div key={f.label} className="bg-onyx-soft/70 px-5 py-6">
          <p className="tnum font-mono text-3xl text-brand-300 sm:text-4xl">{f.value}</p>
          <p className="mt-2 text-[12px] leading-snug text-onyx-muted">{f.label}</p>
        </div>
      ))}
    </div>
  );
}

export function ExhibitLedger({ rows }: { rows: { name: string; level: string }[] }) {
  return (
    <ul className="divide-y divide-onyx-line px-5 py-2">
      {rows.map((r) => (
        <li key={r.name} className="flex items-baseline justify-between gap-4 py-3">
          <span className="text-sm font-semibold text-white">{r.name}</span>
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-onyx-muted">{r.level}</span>
        </li>
      ))}
    </ul>
  );
}
