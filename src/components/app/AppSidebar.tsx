"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { External, Logo } from "@/components/icons";
import { useFocusTrap } from "@/components/hooks/useFocusTrap";
import ProjectSwitcher from "@/components/app/ProjectSwitcher";
import AreaRailNav, { type NavGroup } from "@/components/app/nav/AreaRailNav";
import { useShell } from "@/components/app/shell-context";
import { useProject } from "@/lib/projects/context";
import { AREA_ORDER, areaHref, areaLabel, areasFor, moduleHref, modulesFor } from "@/lib/projects/modules";
import type { ModuleDef } from "@/lib/projects/modules";
import { AREAS } from "@/lib/projects/areas";
import { navLocation } from "@/lib/projects/nav-location";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: { backToWeb: "Zpět na web", closeMenu: "Zavřít menu", roof: "Přehled oblasti" },
  en: { backToWeb: "Back to website", closeMenu: "Close menu", roof: "Area overview" },
} as const;

/** The full sidebar content (icon rail + item panel), shared by the desktop rail
 *  and the mobile drawer. */
function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const project = useProject();
  const pathname = usePathname();
  const t = useT(T);
  const { locale } = useLocale();

  const modules = modulesFor(project.type);
  const base = `/app/${project.id}`;
  const loc = navLocation(pathname, base, modules);
  const present = new Set<string>([...areasFor(project.type), "settings"]);

  // One group per area the type has. A roof module (Home's overview, Výkon) is
  // reached through the lamp and the roof row, so it is not listed again as a room.
  const groups: NavGroup[] = AREA_ORDER.filter((a) => present.has(a)).map((area) => {
    const def = AREAS.find((x) => x.key === area);
    return {
      area,
      label: areaLabel(area, locale),
      question: def ? (locale === "en" ? def.questionEn : def.question) : undefined,
      roofHref: def ? areaHref(project.id, def.key) : undefined,
      roofLabel: def ? t("roof") : undefined,
      items: modules.filter((m) => m.area === area && moduleHref(project.id, m.key) !== (def ? areaHref(project.id, def.key) : "")),
    };
  });

  return (
    <AreaRailNav
      groups={groups}
      activeArea={loc.area}
      isRoofActive={loc.isRoof}
      locale={locale}
      hrefFor={(key) => moduleHref(project.id, key)}
      isActive={(m: ModuleDef) => !loc.isRoof && loc.module?.key === m.key}
      onNavigate={onNavigate}
      railTop={
        <Link
          href="/app"
          onClick={onNavigate}
          title="Adamant"
          className="mb-1 flex justify-center rounded-xl py-1.5"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-onyx text-brand-300">
            <Logo width={18} height={18} />
          </span>
        </Link>
      }
      panelHeader={
        <div className="border-b border-line p-3">
          <ProjectSwitcher onNavigate={onNavigate} />
        </div>
      }
      panelFooter={
        <div className="border-t border-line p-2">
          <Link
            href="/"
            onClick={onNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-navy-50 hover:text-navy-700"
          >
            <External width={18} height={18} className="text-muted" />
            <span>{t("backToWeb")}</span>
          </Link>
        </div>
      }
    />
  );
}

/** One source of truth for the sidebar width, so the desktop rail and the mobile
 *  drawer can never drift apart (they were 296px vs 300px). */
const RAIL_WIDTH = "w-[296px]";

export default function AppSidebar() {
  const { mobileOpen, setMobileOpen } = useShell();
  const pathname = usePathname();
  const t = useT(T);
  const drawerRef = useRef<HTMLElement>(null);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // While the drawer is open: Escape closes it (parity with Modal/CommandPalette)
  // and body scroll locks so the obscured page can't scroll underneath.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen, setMobileOpen]);

  // Move focus into the drawer, trap Tab inside it, and restore focus to the
  // hamburger on close.
  useFocusTrap(drawerRef, mobileOpen);

  return (
    <>
      {/* Desktop rail */}
      <aside
        className={`sticky top-0 hidden h-screen ${RAIL_WIDTH} shrink-0 border-r border-line bg-surface md:block`}
      >
        <SidebarBody />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden">
          <button
            type="button"
            aria-label={t("closeMenu")}
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-onyx/40 backdrop-blur-sm"
          />
          <aside
            ref={drawerRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={t("closeMenu")}
            className={`animate-drop fixed inset-y-0 left-0 z-50 ${RAIL_WIDTH} border-r border-line bg-surface outline-none`}
          >
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
