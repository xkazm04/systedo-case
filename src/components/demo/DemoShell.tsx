"use client";

/** Public demo shell for /dashboard — a visual twin of the authed AppShell
 *  (left rail + slim topbar over a scrollable content column), but driven by the
 *  `?m=` query param instead of /app routing, and seeded with a mock project so
 *  no auth is required. It provides ProjectProvider around the (server-rendered)
 *  module content so client leaves that read useProject() resolve correctly, and
 *  owns its own mobile-drawer state (the app's shell-context isn't in scope). */
import { useState } from "react";
import Link from "next/link";
import { External, Logo, Menu } from "@/components/icons";
import { ModuleIcon } from "@/components/app/icon-map";
import ThemeToggle from "@/components/site/ThemeToggle";
import LocaleSwitcher from "@/components/site/LocaleSwitcher";
import { ProjectProvider } from "@/lib/projects/context";
import {
  MODULES,
  moduleBlurb,
  moduleLabel,
  sectionLabel,
  SECTION_ORDER,
  type ModuleDef,
  type ModuleSection,
} from "@/lib/projects/modules";
import { projectTypeMeta, type Project } from "@/lib/projects/types";
import { demoHref } from "@/lib/demo/projects";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import type { SupportedLocale } from "@/lib/format";

const T = {
  cs: {
    demo: "Živá ukázka",
    demoNote: "Ukázkový režim bez přihlášení — každý modul ukazujeme na projektu, pro který se hodí.",
    backToWeb: "Zpět na web",
    startFree: "Vyzkoušet zdarma",
    openMenu: "Otevřít menu",
    closeMenu: "Zavřít menu",
  },
  en: {
    demo: "Live demo",
    demoNote: "Demo mode, no sign-in — each module is shown on a project type that fits it.",
    backToWeb: "Back to website",
    startFree: "Start free",
    openMenu: "Open menu",
    closeMenu: "Close menu",
  },
} as const;

type TFn = (key: keyof typeof T.cs) => string;

function DemoNavLink({
  module,
  active,
  locale,
  onNavigate,
}: {
  module: ModuleDef;
  active: boolean;
  locale: SupportedLocale;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={demoHref(module.key)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={moduleBlurb(module, locale)}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active ? "bg-brand-50 text-brand-800" : "text-muted hover:bg-navy-50 hover:text-navy-700"
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
      <span className="truncate">{moduleLabel(module, locale)}</span>
    </Link>
  );
}

function SidebarBody({
  activeKey,
  project,
  locale,
  t,
  onNavigate,
}: {
  activeKey: string;
  project: Project;
  locale: SupportedLocale;
  t: TFn;
  onNavigate?: () => void;
}) {
  const topSections = SECTION_ORDER.filter((s) => s !== "system");
  const systemModules = MODULES.filter((m) => m.section === "system");
  const bySection = (section: ModuleSection) => MODULES.filter((m) => m.section === section);
  const typeLabel = projectTypeMeta(project.type, locale).label;

  return (
    <div className="flex h-full flex-col">
      {/* brand + demo badge */}
      <div className="flex items-center gap-2.5 border-b border-line p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-onyx text-brand-300">
          <Logo width={18} height={18} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-tight text-navy-800">Adamant</p>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-accent">
            {t("demo")}
          </p>
        </div>
      </div>

      {/* active demo project (reflects the current module's fitting business type) */}
      <div className="border-b border-line px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-canvas px-3 py-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: project.accentColor }}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-navy-800">{project.name}</p>
            <p className="truncate text-xs text-muted">
              {typeLabel}
              {project.domain ? ` · ${project.domain}` : ""}
            </p>
          </div>
        </div>
        <p className="mt-2 px-1 text-[11px] leading-snug text-muted/80">{t("demoNote")}</p>
      </div>

      {/* grouped module nav (all modules, not filtered by type) */}
      <nav className="scrollbar-slim flex-1 space-y-6 overflow-y-auto p-3">
        {topSections.map((section) => {
          const items = bySection(section);
          if (items.length === 0) return null;
          const heading = sectionLabel(section, locale);
          return (
            <div key={section}>
              {heading && (
                <p className="px-3 pb-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted/80">
                  {heading}
                </p>
              )}
              <div className="space-y-0.5">
                {items.map((m) => (
                  <DemoNavLink
                    key={m.key || "overview"}
                    module={m}
                    active={m.key === activeKey}
                    locale={locale}
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* settings + back to the marketing site */}
      <div className="space-y-0.5 border-t border-line p-3">
        {systemModules.map((m) => (
          <DemoNavLink
            key={m.key}
            module={m}
            active={m.key === activeKey}
            locale={locale}
            onNavigate={onNavigate}
          />
        ))}
        <Link
          href="/"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-navy-50 hover:text-navy-700"
        >
          <External width={18} height={18} className="text-muted" />
          <span>{t("backToWeb")}</span>
        </Link>
      </div>
    </div>
  );
}

export default function DemoShell({
  activeKey,
  project,
  projects,
  children,
}: {
  activeKey: string;
  project: Project;
  projects: Project[];
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const t = useT(T);
  const { locale } = useLocale();
  const active = MODULES.find((m) => m.key === activeKey) ?? MODULES[0]!;
  const title = moduleLabel(active, locale);
  const typeLabel = projectTypeMeta(project.type, locale).label;

  return (
    <ProjectProvider project={project} projects={projects}>
      <div className="flex min-h-screen bg-canvas">
        {/* desktop rail */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-line bg-surface md:flex md:flex-col">
          <SidebarBody activeKey={activeKey} project={project} locale={locale} t={t} />
        </aside>

        {/* mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden">
            <button
              type="button"
              aria-label={t("closeMenu")}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-onyx/40 backdrop-blur-sm"
            />
            <aside className="animate-drop fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface">
              <SidebarBody
                activeKey={activeKey}
                project={project}
                locale={locale}
                t={t}
                onNavigate={() => setMobileOpen(false)}
              />
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* topbar */}
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label={t("openMenu")}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-navy-700 hover:bg-navy-50 md:hidden"
              >
                <Menu />
              </button>
              <h1 className="truncate text-[17px] font-semibold tracking-tight text-navy-800">
                {title}
              </h1>
              <span className="hidden shrink-0 rounded-pill bg-navy-50 px-2.5 py-0.5 text-xs font-medium text-muted sm:inline-block">
                {typeLabel}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/app"
                className="hidden rounded-pill bg-brand-500 px-3.5 py-1.5 text-xs font-semibold text-navy-900 transition-colors hover:bg-brand-400 sm:inline-block"
              >
                {t("startFree")}
              </Link>
              <LocaleSwitcher />
              <ThemeToggle />
            </div>
          </header>

          {/* facet lattice behind the content, echoing the site-wide texture the
              old /dashboard inherited from <main> (the shell's solid canvas would
              otherwise cover it). */}
          <div className="flex-1 bg-facets">{children}</div>
        </div>
      </div>
    </ProjectProvider>
  );
}
