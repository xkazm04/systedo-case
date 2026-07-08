"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { External, Logo } from "@/components/icons";
import ProjectSwitcher from "@/components/app/ProjectSwitcher";
import SectionRailNav, { type NavGroup } from "@/components/app/nav/SectionRailNav";
import { useShell } from "@/components/app/shell-context";
import { useProject } from "@/lib/projects/context";
import { modulesFor, sectionLabel, SECTION_ORDER } from "@/lib/projects/modules";
import type { ModuleDef } from "@/lib/projects/modules";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";

const T = {
  cs: { backToWeb: "Zpět na web", closeMenu: "Zavřít menu", system: "Systém" },
  en: { backToWeb: "Back to website", closeMenu: "Close menu", system: "System" },
} as const;

/** Href for a module within a project ("" key = the overview/home). */
function moduleHref(projectId: string, key: string): string {
  return key ? `/app/${projectId}/${key}` : `/app/${projectId}`;
}

function isModuleActive(pathname: string, base: string, key: string): boolean {
  const href = key ? `${base}/${key}` : base;
  return key ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
}

/** The full sidebar content (icon rail + item panel), shared by the desktop rail
 *  and the mobile drawer. */
function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const project = useProject();
  const pathname = usePathname();
  const t = useT(T);
  const { locale } = useLocale();

  const modules = modulesFor(project.type);
  const base = `/app/${project.id}`;
  // The active module key from the path ("" = overview / project home).
  const activeKey = pathname.startsWith(`${base}/`)
    ? pathname.slice(base.length + 1).split("/")[0]!
    : "";

  const groups: NavGroup[] = SECTION_ORDER.map((section) => ({
    section,
    label: sectionLabel(section, locale) || t("system"),
    items: modules.filter((m) => m.section === section),
  })).filter((g) => g.items.length > 0);

  return (
    <SectionRailNav
      groups={groups}
      activeKey={activeKey}
      locale={locale}
      hrefFor={(key) => moduleHref(project.id, key)}
      isActive={(m: ModuleDef) => isModuleActive(pathname, base, m.key)}
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

export default function AppSidebar() {
  const { mobileOpen, setMobileOpen } = useShell();
  const pathname = usePathname();
  const t = useT(T);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <>
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-screen w-[296px] shrink-0 border-r border-line bg-surface md:block">
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
          <aside className="animate-drop fixed inset-y-0 left-0 z-50 w-[300px] border-r border-line bg-surface">
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
