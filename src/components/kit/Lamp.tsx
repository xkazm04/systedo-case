/** A lamp: the entry to one area (ADR-0013). Its engraved motif glows in the
 *  area's spectral line; the name and the area's status sit under it. The whole
 *  tile is one link. The status line is the roof's own summary (a metric or an
 *  "attention" count), passed in by the caller — the lamp invents nothing. */
import Link from "next/link";
import type { AreaDef } from "@/lib/projects/areas";
import { areaHueVar } from "@/lib/projects/areas";
import AreaArt from "./art/AreaArt";

export default function Lamp({
  area,
  href,
  name,
  status,
  attention = false,
}: {
  area: AreaDef;
  href: string;
  name: string;
  status?: string;
  /** True when the area has something that needs the operator. */
  attention?: boolean;
}) {
  const hue = areaHueVar(area.key);
  return (
    <Link
      href={href}
      className="group optic-panel grid content-start gap-3 px-4 pb-4 pt-3 transition-colors hover:bg-white/[0.03] focus-visible:outline-offset-4"
    >
      <AreaArt
        motif={area.motif}
        hue={hue}
        className="h-20 w-full opacity-80 transition-opacity duration-300 group-hover:opacity-100"
      />
      <span className="flex items-center gap-2">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: hue }} />
        <span className="text-base font-semibold text-ink">{name}</span>
        {attention ? (
          <span className="ml-auto font-mono text-xs uppercase tracking-[0.08em] text-brand-accent">●</span>
        ) : null}
      </span>
      {status ? <span className="text-sm text-muted">{status}</span> : null}
    </Link>
  );
}
