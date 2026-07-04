"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { localizedNavItems } from "@/lib/nav";
import { firstUnvisited, readVisited } from "@/lib/journey";
import { buttonClass } from "@/components/ui";
import { ArrowRight, Check, Close, Logo, Menu } from "@/components/icons";
import ThemeToggle from "@/components/site/ThemeToggle";
import LocaleSwitcher from "@/components/site/LocaleSwitcher";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import AuthButton from "@/components/auth/AuthButton";
import UsageMeter from "@/components/usage/UsageMeter";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();
  const { locale, messages } = useLocale();
  const { status } = useSession();
  const navItems = localizedNavItems(locale);
  const [open, setOpen] = useState(false);
  // Journey memory for the mobile menu: which task pages the reviewer has seen
  // (written by TaskPager's JourneyBeacon). Read in the toggle handler — the
  // menu only renders post-interaction, so storage can't cause a hydration
  // mismatch, and re-reading on every open keeps it fresh across navigations.
  const [visited, setVisited] = useState<string[]>([]);
  const authed = status === "authenticated";

  const toggleMenu = () => {
    if (!open) {
      try {
        setVisited(readVisited(window.localStorage));
      } catch {
        setVisited([]);
      }
    }
    setOpen((v) => !v);
  };

  // "Pokračovat" resume target: the first task page not yet visited. The
  // current page is always marked visited by its beacon before the menu can
  // open, so the target is genuinely the next stop.
  const resumeTarget = firstUnvisited(navItems, visited);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Adamant — domů">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-onyx text-brand-400 transition-colors group-hover:bg-onyx-soft">
            <Logo width={20} height={20} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[17px] font-semibold tracking-tight text-navy-800">
              Adamant
            </span>
            <span className="text-[13px] font-medium uppercase tracking-[0.14em] text-muted">
              AI ad intelligence
            </span>
          </span>
        </Link>

        {/* Primary nav lives in the homepage crossroad now, not the header. */}
        <div className="flex items-center gap-2">
          {authed && (
            // Shared Button styling on a Next <Link> via buttonClass; the
            // responsive hide uses max-sm:hidden so it can't fight the base
            // inline-flex display utility.
            <Link href="/app" className={buttonClass("primary", "sm", { className: "max-sm:hidden" })}>
              {messages.nav.openApp}
              <ArrowRight width={15} height={15} />
            </Link>
          )}
          <UsageMeter />
          <AuthButton />
          <LocaleSwitcher />
          <ThemeToggle />
          <button
            type="button"
            onClick={toggleMenu}
            aria-label={open ? messages.nav.closeMenu : messages.nav.openMenu}
            aria-expanded={open}
            className="grid h-10 w-10 place-items-center rounded-lg text-navy-700 hover:bg-navy-50 md:hidden"
          >
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="animate-drop border-t border-line bg-surface md:hidden">
          <div className="mx-auto max-w-6xl px-4 py-3">
            {authed && (
              <Link
                href="/app"
                onClick={() => setOpen(false)}
                className="mb-1 flex items-center justify-between rounded-lg bg-brand-600 px-3 py-3 text-[17px] font-semibold text-white"
              >
                {messages.nav.openApp}
                <ArrowRight width={17} height={17} />
              </Link>
            )}
            {/* resume where the journey left off — one tap to the first unvisited task */}
            {resumeTarget && resumeTarget.href !== pathname && (
              <Link
                href={resumeTarget.href}
                onClick={() => setOpen(false)}
                className="mb-1 flex items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-3 py-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-700">
                    {messages.nav.resume}
                  </span>
                  <span className="truncate text-[17px] font-semibold text-brand-800">
                    {messages.nav.task} {resumeTarget.task} — {resumeTarget.label}
                  </span>
                </span>
                <ArrowRight width={17} height={17} className="shrink-0 text-brand-700" />
              </Link>
            )}
            {navItems.map((item) => {
              const active = isActive(pathname, item.href);
              const seen = item.task > 0 && visited.includes(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3 py-3 text-[17px] font-medium ${
                    active ? "bg-brand-50 text-brand-800" : "text-navy-700 hover:bg-navy-50"
                  }`}
                >
                  {item.label}
                  {item.task > 0 && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                      {seen && (
                        <>
                          <Check width={13} height={13} className="text-brand-600" aria-hidden />
                          <span className="sr-only">{messages.nav.visited}</span>
                        </>
                      )}
                      {messages.nav.task} {item.task}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
}
