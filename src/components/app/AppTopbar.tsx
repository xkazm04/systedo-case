"use client";

import { usePathname } from "next/navigation";
import { Menu } from "@/components/icons";
import { useShell } from "@/components/app/shell-context";
import { useProject } from "@/lib/projects/context";
import { modulesFor, moduleLabel } from "@/lib/projects/modules";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import ThemeToggle from "@/components/site/ThemeToggle";
import LocaleSwitcher from "@/components/site/LocaleSwitcher";
import AuthButton from "@/components/auth/AuthButton";
import UsageMeter from "@/components/usage/UsageMeter";
import FeedbackButton from "@/components/app/FeedbackButton";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { openMenu: "Otevřít menu" },
  en: { openMenu: "Open menu" },
} as const;

/** The active module's label for the current route, so the topbar names the page
 *  the same way the sidebar does (single source of truth = the module registry). */
function useActiveModuleLabel(): string {
  const project = useProject();
  const pathname = usePathname();
  const { locale } = useLocale();
  const base = `/app/${project.id}`;
  const rest = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, "") : "";
  const key = rest.split("/")[0] ?? "";
  const active = modulesFor(project.type).find((m) => m.key === key);
  // Localise via moduleLabel() — the same accessor the sidebar uses — so the
  // heading and the highlighted nav item name the page in the same language.
  return active ? moduleLabel(active, locale) : project.name;
}

export default function AppTopbar() {
  const { setMobileOpen } = useShell();
  const title = useActiveModuleLabel();
  const t = useT(T);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={t("openMenu")}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-navy-700 hover:bg-navy-50 md:hidden"
        >
          <Menu />
        </button>
        <h1 className="truncate text-[17px] font-semibold tracking-tight text-navy-800">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <FeedbackButton source="app" />
        <UsageMeter />
        <AuthButton />
        <LocaleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
