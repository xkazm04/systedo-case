"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { External } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import ProjectSwitcher from "@/components/app/ProjectSwitcher";
import { useShell } from "@/components/app/shell-context";
import { useProject } from "@/lib/projects/context";
import {
  modulesFor,
  SECTION_LABELS,
  SECTION_ORDER,
  type ModuleDef,
  type ModuleSection,
} from "@/lib/projects/modules";
import type { Project } from "@/lib/projects/types";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    backToWeb: "Zpět na web",
    closeMenu: "Zavřít menu",
  },
  en: {
    backToWeb: "Back to website",
    closeMenu: "Close menu",
  },
} as const;

/** Href for a module within a project ("" key = the overview/home). */
function moduleHref(projectId: string, key: string): string {
  return key ? `/app/${projectId}/${key}` : `/app/${projectId}`;
}

function isModuleActive(pathname: string, base: string, key: string): boolean {
  const href = key ? `${base}/${key}` : base;
  return key ? pathname === href || pathname.startsWith(`${href}/`) : pathname === base;
}

function NavLink({
  project,
  module,
  pathname,
  onNavigate,
}: {
  project: Project;
  module: ModuleDef;
  pathname: string;
  onNavigate?: () => void;
}) {
  const base = `/app/${project.id}`;
  const active = isModuleActive(pathname, base, module.key);
  return (
    <Link
      href={moduleHref(project.id, module.key)}
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
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-brand-500" aria-hidden />
      )}
      <ModuleIcon
        icon={module.icon}
        width={18}
        height={18}
        className={active ? "text-brand-accent" : "text-muted group-hover:text-navy-600"}
      />
      <span className="truncate">{module.label}</span>
    </Link>
  );
}

/** The full sidebar content (switcher + grouped nav + footer), shared by the
 *  desktop rail and the mobile drawer. */
function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const project = useProject();
  const pathname = usePathname();
  const modules = modulesFor(project.type);
  const t = useT(T);

  // System section (settings) is pinned to the bottom; everything else scrolls.
  const topSections = SECTION_ORDER.filter((s) => s !== "system");
  const systemModules = modules.filter((m) => m.section === "system");
  const bySection = (section: ModuleSection) => modules.filter((m) => m.section === section);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-3">
        <ProjectSwitcher onNavigate={onNavigate} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        {topSections.map((section) => {
          const items = bySection(section);
          if (items.length === 0) return null;
          return (
            <div key={section}>
              {SECTION_LABELS[section] && (
                <p className="px-3 pb-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted/80">
                  {SECTION_LABELS[section]}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((m) => (
                  <NavLink
                    key={m.key || "overview"}
                    project={project}
                    module={m}
                    pathname={pathname}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="space-y-0.5 border-t border-line p-3">
        {systemModules.map((m) => (
          <NavLink
            key={m.key}
            project={project}
            module={m}
            pathname={pathname}
            onNavigate={onNavigate}
          />
        ))}
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-navy-50 hover:text-navy-700"
        >
          <External width={18} height={18} className="text-muted" />
          <span>{t("backToWeb")}</span>
        </Link>
      </div>
    </div>
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
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface md:flex md:flex-col">
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
          <aside className="animate-drop fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface">
            <SidebarBody onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
