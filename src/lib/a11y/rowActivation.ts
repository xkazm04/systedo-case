import type { KeyboardEvent } from "react";

/** True when a keyboard event on a `role="button"` element should trigger its
 *  action. Per WAI-ARIA, a button activates on Enter or Space (older engines
 *  report Space as "Spacebar"). Pure so it can be unit-tested without a DOM. */
export function isRowActivationKey(key: string): boolean {
  return key === "Enter" || key === " " || key === "Spacebar";
}

/** Props that turn a click-only `<tr onClick>` into a keyboard- and AT-reachable
 *  control: it announces as a button, is a Tab stop, and fires the same action on
 *  Enter/Space (Space also `preventDefault`s so the page doesn't scroll). Spread
 *  onto the row: `<tr {...interactiveRowProps(open, label)}>`. Shared so the app's
 *  three "row opens a modal" tables all behave identically. */
export function interactiveRowProps(onActivate: () => void, ariaLabel: string) {
  return {
    role: "button" as const,
    tabIndex: 0,
    "aria-label": ariaLabel,
    onClick: onActivate,
    onKeyDown: (e: KeyboardEvent) => {
      if (isRowActivationKey(e.key)) {
        e.preventDefault();
        onActivate();
      }
    },
  };
}
