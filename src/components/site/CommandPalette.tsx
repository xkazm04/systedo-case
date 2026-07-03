"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "@/components/icons";
import { matchNavTargets, navSearchTargets } from "@/lib/nav";
import { useLocale } from "@/lib/i18n/LocaleProvider";

/** Small keyboard-key chip (the palette hint + the Esc affordance). */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted">
      {children}
    </kbd>
  );
}

/** Cmd/Ctrl+K quick-nav palette, driven by the typed nav model (`navSearchTargets`
 *  merges the journey pages, the footer meta pages and `/app` when authed — the
 *  same single source the header/footer render). Hand-rolled, no new dependency:
 *  an APG combobox+listbox — focus stays in the input, ArrowUp/Down move the
 *  active option (aria-activedescendant), Enter navigates, Esc closes. The
 *  desktop header shows a ⌘K/Ctrl K hint chip that opens it by click; the
 *  global shortcut works everywhere. */
export default function CommandPalette({ authed }: { authed: boolean }) {
  const router = useRouter();
  const { locale, messages } = useLocale();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Platform-correct shortcut glyph after hydration; the server renders the
  // Ctrl variant (platform is client-only knowledge).
  useEffect(() => {
    const ua = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
    if (/Mac|iPhone|iPad/i.test(ua)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsMac(true);
    }
  }, []);

  const openPalette = () => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  };
  const close = () => setOpen(false);

  // Global shortcut: Cmd/Ctrl+K toggles, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else openPalette();
      } else if (e.key === "Escape" && open) {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus the input and lock body scroll while the dialog is up.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const targets = navSearchTargets(locale, authed);
  const matches = matchNavTargets(query, targets);
  const active = matches.length ? Math.min(activeIndex, matches.length - 1) : -1;

  const go = (href: string) => {
    close();
    router.push(href);
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      const next = (active + delta + matches.length) % matches.length;
      setActiveIndex(next);
      document.getElementById(`quicknav-item-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      go(matches[active].href);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label={messages.nav.quickNav}
        title={messages.nav.quickNav}
        aria-keyshortcuts="Control+K Meta+K"
        className="hidden h-10 items-center gap-2 rounded-lg px-2.5 text-muted transition-colors hover:bg-navy-50 hover:text-navy-800 md:inline-flex"
      >
        <Search width={15} height={15} aria-hidden />
        <Kbd>{isMac ? "⌘" : "Ctrl"} K</Kbd>
      </button>

      {open && (
        <div
          role="presentation"
          onClick={close}
          className="fixed inset-0 z-[70] flex items-start justify-center bg-onyx/40 px-4 pt-[14vh] backdrop-blur-sm"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={messages.nav.quickNav}
            onClick={(e) => e.stopPropagation()}
            className="animate-drop w-full max-w-md overflow-hidden rounded-card border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center gap-2.5 border-b border-line px-4">
              <Search width={16} height={16} className="shrink-0 text-muted" aria-hidden />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={onInputKeyDown}
                role="combobox"
                aria-expanded="true"
                aria-controls="quicknav-list"
                aria-activedescendant={active >= 0 ? `quicknav-item-${active}` : undefined}
                aria-autocomplete="list"
                placeholder={messages.nav.quickNavPlaceholder}
                className="h-12 w-full bg-transparent text-sm text-navy-800 outline-none placeholder:text-muted"
              />
              <Kbd>Esc</Kbd>
            </div>
            <ul
              id="quicknav-list"
              role="listbox"
              aria-label={messages.nav.quickNav}
              className="max-h-80 overflow-y-auto p-1.5"
            >
              {matches.length === 0 ? (
                <li className="px-3 py-8 text-center text-sm text-muted">
                  {messages.nav.quickNavEmpty}
                </li>
              ) : (
                matches.map((m, i) => (
                  <li key={m.href} role="presentation">
                    <button
                      type="button"
                      role="option"
                      id={`quicknav-item-${i}`}
                      aria-selected={i === active}
                      tabIndex={-1}
                      onClick={() => go(m.href)}
                      onPointerMove={() => setActiveIndex(i)}
                      className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                        i === active ? "bg-brand-50 text-brand-800" : "text-navy-700"
                      }`}
                    >
                      <span className="shrink-0 font-medium">{m.label}</span>
                      <span className="truncate text-xs text-muted">{m.hint || m.href}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
