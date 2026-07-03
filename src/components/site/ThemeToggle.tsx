"use client";

import { useEffect, useRef } from "react";
import { Moon, Sun } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleProvider";

type ThemeMode = "light" | "dark" | "system";

/** Theme control for the header. Fully DOM-driven: the no-flash script in the
 *  layout sets `data-theme` before paint, the icon swap is pure CSS (both glyphs
 *  render, the active one is shown via `[data-theme]` / media-query rules), and
 *  the click handler reads the effective theme straight from the document — so
 *  there is no React state, no hydration mismatch and no first-paint flicker.
 *
 *  Three-state cycle: an unset `data-theme` means "follow the system"
 *  (prefers-color-scheme CSS handles it). From there the first click pins the
 *  OPPOSITE of what is on screen (so it always visibly changes something), then
 *  light → dark → back to system (`localStorage.removeItem`), so a visitor who
 *  peeked at the other palette can re-sync with their OS schedule.
 *
 *  The title/aria-label announce the mode the NEXT click activates. The server
 *  renders a generic label (the stored choice is client-only) and a post-mount
 *  effect + the click handler tighten it — imperatively, matching the file's
 *  no-React-state philosophy. */
export default function ThemeToggle() {
  const { messages } = useLocale();
  const btnRef = useRef<HTMLButtonElement>(null);

  /** The mode the next click will activate, read from the DOM like toggle(). */
  function nextMode(): ThemeMode {
    const stored = document.documentElement.dataset.theme;
    if (stored === "light") return "dark";
    if (stored === "dark") return "system";
    // following the system → pin the opposite of what's currently on screen
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark";
  }

  function labelFor(mode: ThemeMode): string {
    return mode === "light"
      ? messages.nav.themeToLight
      : mode === "dark"
        ? messages.nav.themeToDark
        : messages.nav.themeToSystem;
  }

  /** Point title/aria-label at the mode the next click activates. */
  function announce() {
    const btn = btnRef.current;
    if (!btn) return;
    const label = labelFor(nextMode());
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }

  function toggle() {
    const root = document.documentElement;
    const next = nextMode();
    if (next === "system") {
      // Unset = follow the OS again; the prefers-color-scheme CSS (palette AND
      // icon swap) takes over immediately.
      delete root.dataset.theme;
      try {
        localStorage.removeItem("theme");
      } catch {
        /* private mode / storage disabled — the in-memory change still applies */
      }
    } else {
      root.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch {
        /* private mode / storage disabled — the in-memory change still applies */
      }
    }
    announce();
  }

  // After hydration (and after a locale switch re-renders the generic label),
  // tighten the label to the precise next mode. No deps: it must re-run when a
  // re-render restores the generic JSX attributes.
  useEffect(() => {
    announce();
  });

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={toggle}
      aria-label={messages.nav.themeToggle}
      title={messages.nav.themeToggle}
      className="grid h-10 w-10 place-items-center rounded-lg text-navy-700 transition-colors hover:bg-navy-50 hover:text-navy-800"
    >
      <Sun className="theme-toggle-sun" width={18} height={18} aria-hidden />
      <Moon className="theme-toggle-moon" width={18} height={18} aria-hidden />
    </button>
  );
}
