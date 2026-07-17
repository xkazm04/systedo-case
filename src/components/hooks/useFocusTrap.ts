"use client";

import { useEffect, type RefObject } from "react";
import { FOCUSABLE_SELECTOR, focusTrapWrapIndex } from "@/lib/a11y/focusTrap";

/** Modal focus management for a hand-rolled dialog/overlay. While `active`:
 *  (1) remembers the element that had focus, (2) moves focus into the container
 *  (an explicit `initialFocusRef`, else the container itself), (3) wraps
 *  Tab/Shift+Tab within the container's focusable elements, and (4) restores
 *  focus to the opener on teardown. Pairs with `role="dialog"`/`aria-modal` to
 *  make the "background is inert" claim actually true for keyboard users.
 *
 *  No dependency — the tab-target math lives in the pure `focusTrapWrapIndex`. */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  initialFocusRef?: RefObject<HTMLElement | null>
) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus in: an explicit target, else the container itself.
    (initialFocusRef?.current ?? container)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      const activeIndex = focusables.indexOf(document.activeElement as HTMLElement);
      const wrapTo = focusTrapWrapIndex(focusables.length, activeIndex, e.shiftKey);
      if (wrapTo === null) return;
      e.preventDefault();
      focusables[wrapTo]?.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Restore focus to the opener so keyboard/AT users don't land on <body>.
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef, initialFocusRef]);
}
