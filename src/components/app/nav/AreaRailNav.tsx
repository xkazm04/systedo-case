"use client";

/** Two-level sidebar navigation over the six areas (ADR-0013). The narrow rail
 *  holds one lamp per area the project type has — its engraved motif in the
 *  area's spectral hue — plus the settings menu pinned at the bottom. A lamp is a
 *  LINK to the area's roof: the roof is where an area starts. The second panel
 *  lists the area's rooms, so a room is always one click away without the
 *  sidebar growing back into a 26-item list.
 *
 *  The panel follows the current route (it opens the area that owns it);
 *  clicking the settings glyph previews its items without navigating, and a real
 *  navigation snaps the panel back. Shared by the authed AppSidebar and the
 *  public DemoShell — each supplies its groups, hrefs, active test and chrome. */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Cog } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import AreaArt from "@/components/kit/art/AreaArt";
import { AREAS, areaHueVar, type AreaKey } from "@/lib/projects/areas";
import { moduleLabel, type ModuleArea, type ModuleDef } from "@/lib/projects/modules";
import type { SupportedLocale } from "@/lib/format";

export interface NavGroup {
  area: ModuleArea;
  label: string;
  /** The question the area's roof answers, shown under the panel heading. */
  question?: string;
  /** The roof's href; absent for the settings menu, which has no roof. */
  roofHref?: string;
  /** Label of the roof row at the top of the panel, e.g. "Area overview". */
  roofLabel?: string;
  items: ModuleDef[];
}

export default function AreaRailNav({
  groups,
  activeArea,
  isRoofActive,
  hrefFor,
  isActive,
  locale,
  railTop,
  panelHeader,
  panelFooter,
  onNavigate,
}: {
  groups: NavGroup[];
  /** The area the current route belongs to. */
  activeArea: ModuleArea;
  /** True when the current route is the active area's roof itself. */
  isRoofActive: boolean;
  hrefFor: (key: string) => string;
  isActive: (module: ModuleDef) => boolean;
  locale: SupportedLocale;
  railTop?: ReactNode;
  panelHeader?: ReactNode;
  panelFooter?: ReactNode;
  onNavigate?: () => void;
}) {
  // A previewed group (settings click) overrides the route's area until the route
  // changes — reset during render, the sanctioned "adjust state from a prior
  // render" pattern, so the panel follows navigation.
  const [preview, setPreview] = useState<ModuleArea | null>(null);
  const [seenArea, setSeenArea] = useState(activeArea);
  const [seenRoof, setSeenRoof] = useState(isRoofActive);
  if (seenArea !== activeArea || seenRoof !== isRoofActive) {
    setSeenArea(activeArea);
    setSeenRoof(isRoofActive);
    setPreview(null);
  }
  const shown = preview ?? activeArea;
  const shownGroup = groups.find((g) => g.area === shown) ?? groups[0];
  const railGroups = groups.filter((g) => g.area !== "settings");
  const settings = groups.find((g) => g.area === "settings");

  const lamp = (group: NavGroup) => {
    const def = AREAS.find((a) => a.key === group.area);
    const current = group.area === shown;
    const cls = `flex flex-col items-center gap-1 rounded-[2px] px-1 py-2 transition-colors ${
      current ? "bg-white/[0.05] text-ink" : "text-muted hover:bg-white/[0.03] hover:text-ink"
    }`;
    const glyph = def ? (
      <AreaArt motif={def.motif} hue={areaHueVar(def.key)} className={`h-6 w-8 ${current ? "" : "opacity-70"}`} />
    ) : (
      <Cog width={21} height={21} />
    );
    const label = <span className="text-[11px] font-semibold leading-none">{group.label}</span>;
    return group.roofHref ? (
      <Link
        key={group.area}
        href={group.roofHref}
        onClick={onNavigate}
        title={group.question ?? group.label}
        aria-current={current && isRoofActive ? "page" : undefined}
        className={cls}
      >
        {glyph}
        {label}
      </Link>
    ) : (
      <button
        key={group.area}
        type="button"
        onClick={() => setPreview(group.area)}
        aria-pressed={current}
        title={group.label}
        className={cls}
      >
        {glyph}
        {label}
      </button>
    );
  };

  const row = (href: string, label: string, active: boolean, icon: ReactNode, title?: string, key?: string) => (
    <Link
      key={key ?? href}
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={title}
      className={`group relative flex items-center gap-3 rounded-[2px] px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand-50 text-brand-800" : "text-muted hover:bg-white/[0.04] hover:text-ink"
      }`}
    >
      {active && <span className="absolute inset-y-1.5 left-0 w-0.5 bg-amber" aria-hidden />}
      {icon}
      <span className="truncate">{label}</span>
    </Link>
  );

  return (
    <div className="flex h-full">
      <div className="flex w-[74px] shrink-0 flex-col gap-1 border-r border-line bg-room-1 p-2">
        {railTop}
        <nav aria-label="Areas" className="flex flex-1 flex-col gap-1">
          {railGroups.map((g) => lamp(g))}
        </nav>
        <div className="mt-auto flex flex-col gap-1">{settings ? lamp(settings) : null}</div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-room-1">
        {panelHeader}
        <div className="px-4 pb-2 pt-4">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{shownGroup?.label}</p>
          {shownGroup?.question ? <p className="mt-1 text-sm text-muted/80">{shownGroup.question}</p> : null}
        </div>
        <nav key={shown} className="scrollbar-slim flex-1 animate-fade-in space-y-0.5 overflow-y-auto px-2 pb-3">
          {shownGroup?.roofHref && shownGroup.roofLabel
            ? row(
                shownGroup.roofHref,
                shownGroup.roofLabel,
                shownGroup.area === activeArea && isRoofActive,
                <span
                  aria-hidden
                  className="ml-1 mr-0.5 h-2 w-2 rounded-full"
                  style={{ background: areaHueVar(shownGroup.area as AreaKey) }}
                />,
                shownGroup.question,
                "roof"
              )
            : null}
          {shownGroup?.items.map((m) => {
            const active = isActive(m);
            return row(
              hrefFor(m.key),
              moduleLabel(m, locale),
              active,
              <ModuleIcon
                icon={m.icon}
                width={18}
                height={18}
                className={active ? "text-brand-accent" : "text-muted group-hover:text-ink"}
              />,
              locale === "en" ? m.blurbEn : m.blurb,
              m.key || "overview"
            );
          })}
        </nav>
        {panelFooter}
      </div>
    </div>
  );
}
