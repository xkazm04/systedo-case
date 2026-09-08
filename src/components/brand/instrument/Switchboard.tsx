/** THE SWITCHBOARD — 29 modules as keys on a board; the chosen type lights its own.
 *
 *  This is the honesty claim "an e-shop does not see what a lead-gen site sees"
 *  as an object you can operate. Every key is always present so the board's
 *  shape never changes; only its light does, staggered by `--i` so a switch
 *  reads as a board waking up rather than a list re-rendering. Under reduced
 *  motion the universal rule collapses the transitions and it simply re-lights.
 *  The pointer light (PointerLight, `--mx/--my`) plays across it as a highlight. */
import type { CSSProperties } from "react";
import type { InstrumentPayload } from "./derive";

export default function Switchboard({
  board,
  lit,
  sectionLabels,
  litLine,
}: {
  board: InstrumentPayload["board"];
  lit: string[];
  sectionLabels: Record<string, string>;
  litLine: string;
}) {
  const litSet = new Set(lit);
  let i = 0;
  return (
    <div className="switchboard relative isolate overflow-hidden rounded-card border border-onyx-line bg-onyx-soft/40 p-5 sm:p-6">
      <div className="sb-light pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <p className="mb-5 font-mono text-[12px] uppercase tracking-[0.18em] text-brand-300">{litLine}</p>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {board.map((s) => (
          <div key={s.section}>
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-onyx-muted">{sectionLabels[s.section]}</p>
            <ul className="flex flex-col gap-1.5">
              {s.keys.map((k) => {
                const on = litSet.has(k.key);
                const idx = i++;
                return (
                  <li
                    key={k.key || "overview"}
                    data-lit={on ? "1" : "0"}
                    className="sb-key flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px]"
                    style={{ "--i": idx } as CSSProperties}
                  >
                    <span className="sb-lamp inline-block h-1.5 w-1.5 shrink-0 rounded-full" aria-hidden />
                    <span className="truncate">{k.label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
