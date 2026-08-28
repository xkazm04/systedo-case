/** The two presentational parts of the homepage walkthrough, split out so the band
 *  itself stays inside the 200-LOC rubric (AGENTS.md). Both are pure markup over
 *  props — no data, no copy, no locale — so the band keeps every claim and every
 *  derivation in one file (./HomePathWalkthrough).
 *
 *  `Step` is a native `<details name>`: an exclusive accordion with zero
 *  JavaScript, keyboard-operable and present in the server-rendered HTML. Where
 *  `name` is unsupported the steps merely open independently. */
import type { ReactNode } from "react";
import { ChevronDown } from "@/components/icons";

export function Step({
  n,
  title,
  body,
  open,
  children,
}: {
  n: number;
  title: string;
  body: string;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      name="core-path"
      open={open}
      className="group border-b border-line last:border-b-0 open:bg-brand-50/30"
    >
      <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-4 hover:bg-brand-50/40 marker:content-none">
        <span className="tnum text-sm font-semibold text-brand-accent">
          {String(n).padStart(2, "0")}
        </span>
        <span className="flex-1 text-base font-semibold tracking-tight text-navy-800">{title}</span>
        <ChevronDown
          width={17}
          height={17}
          aria-hidden
          className="shrink-0 text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-5 pb-6 pl-14">
        <p className="max-w-2xl text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-4">{children}</div>
      </div>
    </details>
  );
}

/** A labelled row of derived values. Renders NOTHING when the leg is empty — the
 *  honest state for a business the module knows nothing about, and the reason a
 *  broken derivation shows as a missing row rather than as stale marketing copy. */
export function Facet({ label, values }: { label: string; values: readonly string[] }) {
  if (!values.length) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
      </span>
      {values.map((v) => (
        <span
          key={v}
          className="rounded-pill bg-surface px-2.5 py-1 text-xs text-navy-700 ring-1 ring-line"
        >
          {v}
        </span>
      ))}
    </div>
  );
}
