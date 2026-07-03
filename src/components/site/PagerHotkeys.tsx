"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Selector for contexts where ←/→ must keep their native/local meaning:
 *  text inputs (caret movement), dialogs (the ⌘K palette), tab strips and
 *  other arrow-driven widgets. */
const IGNORE_CLOSEST =
  'input, textarea, select, [contenteditable], [role="dialog"], [role="tablist"], [role="tab"], [role="listbox"], [role="slider"], [role="menu"]';

/** Null-UI keyboard half of the docs-pager pattern (rendered by the server
 *  TaskPager): plain ArrowLeft/ArrowRight flip to the pager's rel=prev/next
 *  pages. Bails when a modifier is held, when the event was already handled
 *  (e.g. the trend chart's own arrow stepping calls preventDefault), or when
 *  focus sits in a form field / dialog / arrow-driven widget — the /ai-asistent
 *  and /kampane pages host forms. */
export default function PagerHotkeys({
  prevHref,
  nextHref,
}: {
  prevHref?: string;
  nextHref?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const target = e.target;
      if (target instanceof HTMLElement) {
        if (target.isContentEditable || target.closest(IGNORE_CLOSEST)) return;
      }
      const href = e.key === "ArrowLeft" ? prevHref : nextHref;
      if (href) router.push(href);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevHref, nextHref, router]);

  return null;
}
