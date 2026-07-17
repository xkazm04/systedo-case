/** Focus-trap math + selector, kept dependency-free so the wrap logic is unit
 *  testable without a DOM. Consumed by the `useFocusTrap` hook that the app's
 *  hand-rolled overlays (Modal, CommandPalette, mobile drawer) share. */

/** CSS selector for the elements a Tab loop should cycle through. Excludes
 *  `tabindex="-1"` (programmatic-only focus targets, e.g. a dialog panel) and
 *  disabled controls. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** Given the number of focusable elements in a trap, the index of the currently
 *  focused one (`-1` when focus is on the container itself / outside the list),
 *  and whether Shift is held, return the index to wrap focus to — or `null` when
 *  the browser's native Tab order already keeps focus inside the trap and no
 *  intervention is needed.
 *
 *  - focus outside the list  → first (Tab) / last (Shift+Tab)
 *  - on the last, Tab        → wrap to first
 *  - on the first, Shift+Tab → wrap to last
 *  - anywhere in the middle  → `null` (let the browser move focus natively) */
export function focusTrapWrapIndex(
  count: number,
  activeIndex: number,
  shift: boolean
): number | null {
  if (count === 0) return null;
  if (activeIndex < 0) return shift ? count - 1 : 0;
  if (shift && activeIndex === 0) return count - 1;
  if (!shift && activeIndex === count - 1) return 0;
  return null;
}
