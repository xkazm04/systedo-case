/** A station: one band of an area roof — Measure, Triage or Act (ADR-0013).
 *  The head is a hairline with a short tick in the area's hue, an engraved
 *  numeral, a display-face title and a one-line purpose. The body is whatever
 *  panels the station holds. Server component; all copy comes from the caller. */
import type { ReactNode } from "react";

export type StationStep = "measure" | "triage" | "act";

const NUMERAL: Record<StationStep, string> = { measure: "I", triage: "II", act: "III" };

export default function Station({
  step,
  eyebrow,
  title,
  purpose,
  hue,
  art,
  id,
  children,
}: {
  step: StationStep;
  /** Short label above the title, e.g. "Measure". */
  eyebrow: string;
  title: string;
  purpose?: string;
  /** CSS colour for the tick, usually `areaHueVar(area)`; amber when omitted. */
  hue?: string;
  /** Optional engraved motif drawn at the right of the head (desktop only). */
  art?: ReactNode;
  id?: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className="grid gap-5">
      <header
        className="optic-station-rule relative grid gap-1"
        style={hue ? ({ "--station-hue": hue } as React.CSSProperties) : undefined}
      >
        <p className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] text-muted">
          <span aria-hidden className="text-ink">
            {NUMERAL[step]}
          </span>
          {eyebrow}
        </p>
        <h2 id={headingId} className="font-display text-4xl font-light leading-none tracking-tight text-ink sm:text-5xl">
          {title}
        </h2>
        {purpose ? <p className="max-w-xl text-base text-muted">{purpose}</p> : null}
        {art ? (
          <div aria-hidden className="pointer-events-none absolute right-0 top-5 hidden w-40 lg:block">
            {art}
          </div>
        ) : null}
      </header>
      {children}
    </section>
  );
}
