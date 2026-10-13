/** A room: a module opened from its area roof (ADR-0013). It has its own URL,
 *  a breadcrumb back to the roof that is always visible, and Esc returns to the
 *  roof too — browser Back works because the room is a route, not in-page state
 *  (the contest prototype's known flaw). Server component; Esc is a tiny client
 *  island. */
import Link from "next/link";
import type { ReactNode } from "react";
import type { AreaDef } from "@/lib/projects/areas";
import { areaHueVar } from "@/lib/projects/areas";
import EscBack from "./EscBack";

export default function Room({
  area,
  areaName,
  roofHref,
  title,
  lead,
  backLabel,
  aside,
  children,
}: {
  area: AreaDef;
  areaName: string;
  roofHref: string;
  title: string;
  lead?: string;
  /** Accessible name for the breadcrumb, e.g. "Breadcrumb". */
  backLabel: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-8">
      <EscBack href={roofHref} />
      <header className="grid gap-2">
        <nav aria-label={backLabel}>
          <ol className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-muted">
            <li>
              <Link href={roofHref} className="inline-flex items-center gap-2 hover:text-ink">
                <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: areaHueVar(area.key) }} />
                {areaName}
              </Link>
            </li>
            <li aria-hidden>/</li>
            <li aria-current="page" className="text-ink">
              {title}
            </li>
          </ol>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-light leading-none tracking-tight text-ink sm:text-5xl">{title}</h1>
          {aside}
        </div>
        {lead ? <p className="max-w-2xl text-base text-muted">{lead}</p> : null}
      </header>
      {children}
    </div>
  );
}
