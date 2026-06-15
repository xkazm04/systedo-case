"use client";

import { Moon, Sun } from "@/components/icons";

/** Light/dark toggle for the header. Fully DOM-driven: the no-flash script in
 *  the layout sets `data-theme` before paint, the icon swap is pure CSS (both
 *  glyphs render, the active one is shown via `[data-theme]` rules), and the
 *  click handler reads the effective theme straight from the document — so there
 *  is no React state, no hydration mismatch and no first-paint icon flicker.
 *
 *  Leaving `data-theme` unset means "follow the system" (handled by the
 *  prefers-color-scheme media query); the first explicit click pins a choice. */
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const current =
      root.dataset.theme ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* private mode / storage disabled — the in-memory change still applies */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Přepnout světlý a tmavý režim"
      title="Přepnout světlý a tmavý režim"
      className="grid h-10 w-10 place-items-center rounded-lg text-navy-700 transition-colors hover:bg-navy-50 hover:text-navy-800"
    >
      <Sun className="theme-toggle-sun" width={18} height={18} aria-hidden />
      <Moon className="theme-toggle-moon" width={18} height={18} aria-hidden />
    </button>
  );
}
