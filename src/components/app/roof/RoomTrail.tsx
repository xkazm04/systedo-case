"use client";
/** The way back from a room to its area roof (ADR-0013): a breadcrumb in the
 *  area's hue, and Esc. Rendered by ModulePage for every module that is a room;
 *  Home and settings modules have no roof, so they render nothing. */
import Link from "next/link";
import { useParams } from "next/navigation";
import EscBack from "@/components/kit/EscBack";
import { areaByKey, areaHueVar, type AreaKey } from "@/lib/projects/areas";
import { MODULES, ROOF_MODULE, areaHref } from "@/lib/projects/modules";
import { useLocale } from "@/lib/i18n/LocaleProvider";

export default function RoomTrail({ moduleKey }: { moduleKey: string }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { locale } = useLocale();
  const m = MODULES.find((x) => x.key === moduleKey);
  if (!m || !projectId || m.area === "home" || m.area === "settings") return null;
  const area = m.area as AreaKey;
  if (ROOF_MODULE[area] === m.key) return null;
  const def = areaByKey(area);
  const href = areaHref(projectId, area);
  return (
    <nav aria-label={locale === "en" ? "Breadcrumb" : "Drobečková navigace"} className="mb-3">
      <EscBack href={href} />
      <Link
        href={href}
        className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.1em] text-muted hover:text-ink"
      >
        <span aria-hidden>←</span>
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: areaHueVar(area) }} />
        {locale === "en" ? def.labelEn : def.label}
      </Link>
    </nav>
  );
}
