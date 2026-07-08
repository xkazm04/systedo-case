"use client";

/** Two-level sidebar navigation (design "Variant B"): a narrow icon rail holding
 *  the first-level groups (Přehled, Akvizice, Tvorba, Analýza, Systém) and a
 *  second panel that shows only the selected group's modules — so a workspace
 *  with ~20 modules never stacks them into one tall column.
 *
 *  The panel follows the current route by default (it opens the group that owns
 *  the active module); clicking a rail group previews that group's items without
 *  navigating, and a real navigation snaps the panel back to the active group.
 *  Shared by the authed AppSidebar and the public DemoShell — each supplies its
 *  own groups, link builder, active test and header/footer chrome. */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Chart, Cog, Grid, Megaphone, Palette } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import { moduleLabel, type ModuleDef, type ModuleSection } from "@/lib/projects/modules";
import type { SupportedLocale } from "@/lib/format";

type IconComp = (props: { width?: number; height?: number; className?: string }) => React.ReactElement;

/** First-level group glyphs — one per section, distinct from the module icons. */
const SECTION_ICON: Record<ModuleSection, IconComp> = {
  main: Grid,
  growth: Megaphone,
  studio: Palette,
  insights: Chart,
  system: Cog,
};

export interface NavGroup {
  section: ModuleSection;
  /** resolved group label (with a "Systém"/"System" fallback for the unlabeled system section) */
  label: string;
  items: ModuleDef[];
}

export default function SectionRailNav({
  groups,
  activeKey,
  hrefFor,
  isActive,
  locale,
  railTop,
  panelHeader,
  panelFooter,
  onNavigate,
}: {
  groups: NavGroup[];
  /** key of the module the current route points at ("" = overview) */
  activeKey: string;
  hrefFor: (key: string) => string;
  isActive: (module: ModuleDef) => boolean;
  locale: SupportedLocale;
  /** brand mark pinned to the top of the icon rail */
  railTop?: ReactNode;
  /** header at the top of the item panel (project switcher / brand chip) */
  panelHeader?: ReactNode;
  /** footer at the bottom of the item panel (back-to-website) */
  panelFooter?: ReactNode;
  onNavigate?: () => void;
}) {
  // The group that owns the active route — the panel's default.
  const activeSection =
    groups.find((g) => g.items.some((m) => m.key === activeKey))?.section ?? groups[0]?.section;

  // A previewed group (rail click) overrides the default until the route changes.
  // Reset the preview during render when the active route moves (the sanctioned
  // "adjust state from a prior render" pattern) so the panel follows navigation.
  const [openSection, setOpenSection] = useState<ModuleSection | null>(null);
  const [seenKey, setSeenKey] = useState(activeKey);
  if (seenKey !== activeKey) {
    setSeenKey(activeKey);
    setOpenSection(null);
  }
  const shown = openSection ?? activeSection;
  const shownGroup = groups.find((g) => g.section === shown) ?? groups[0];

  const railGroups = groups.filter((g) => g.section !== "system");
  const systemGroup = groups.find((g) => g.section === "system");

  const groupButton = (group: NavGroup, pinned = false) => {
    const Icon = SECTION_ICON[group.section];
    const current = group.section === shown;
    return (
      <button
        key={group.section}
        type="button"
        onClick={() => setOpenSection(group.section)}
        aria-pressed={current}
        title={group.label}
        className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors ${
          pinned ? "mt-auto" : ""
        } ${
          current
            ? "bg-brand-50 text-brand-800"
            : "text-muted hover:bg-navy-50 hover:text-navy-700"
        }`}
      >
        <Icon width={21} height={21} className={current ? "text-brand-accent" : "text-current"} />
        <span className="text-[10.5px] font-semibold leading-none">{group.label}</span>
      </button>
    );
  };

  return (
    <div className="flex h-full">
      {/* first level — icon rail */}
      <div className="flex w-[74px] shrink-0 flex-col gap-1 border-r border-line bg-surface p-2">
        {railTop}
        <div className="flex flex-1 flex-col gap-1">{railGroups.map((g) => groupButton(g))}</div>
        {systemGroup && groupButton(systemGroup, true)}
      </div>

      {/* second level — items of the selected group */}
      <div className="flex min-w-0 flex-1 flex-col bg-surface">
        {panelHeader}
        <p className="px-4 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted/80">
          {shownGroup?.label}
        </p>
        <nav
          key={shown}
          className="scrollbar-slim flex-1 animate-fade-in space-y-0.5 overflow-y-auto px-2 pb-3"
        >
          {shownGroup?.items.map((module) => {
            const active = isActive(module);
            return (
              <Link
                key={module.key || "overview"}
                href={hrefFor(module.key)}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                title={module.blurb}
                className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-800"
                    : "text-muted hover:bg-navy-50 hover:text-navy-700"
                }`}
              >
                {active && (
                  <span
                    className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-500"
                    aria-hidden
                  />
                )}
                <ModuleIcon
                  icon={module.icon}
                  width={18}
                  height={18}
                  className={active ? "text-brand-accent" : "text-muted group-hover:text-navy-600"}
                />
                <span className="truncate">{moduleLabel(module, locale)}</span>
              </Link>
            );
          })}
        </nav>
        {panelFooter}
      </div>
    </div>
  );
}
