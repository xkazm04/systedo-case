"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV_ITEMS } from "@/lib/nav";
import { Close, External, Logo, Menu } from "@/components/icons";
import ThemeToggle from "@/components/site/ThemeToggle";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2.5" aria-label="Systedo — domů">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-onyx text-brand-400 transition-colors group-hover:bg-onyx-soft">
            <Logo width={20} height={20} />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-[15px] font-semibold tracking-tight text-navy-800">
              Systedo
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
              Case study
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "text-navy-800" : "text-muted hover:text-navy-700"
                }`}
              >
                {item.label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-500" />
                )}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://www.systedo.cz/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden items-center gap-1.5 rounded-pill border border-line px-3.5 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent sm:inline-flex"
          >
            systedo.cz
            <External width={15} height={15} />
          </a>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Zavřít menu" : "Otevřít menu"}
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
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center justify-between rounded-lg px-3 py-3 text-[15px] font-medium ${
                    active ? "bg-brand-50 text-brand-800" : "text-navy-700 hover:bg-navy-50"
                  }`}
                >
                  {item.label}
                  {item.task > 0 && (
                    <span className="text-xs font-semibold text-muted">Úkol {item.task}</span>
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
