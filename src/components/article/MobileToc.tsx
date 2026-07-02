"use client";

import { useRef } from "react";
import { announceSection } from "./section-store";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: { summary: "Obsah článku" },
  en: { summary: "Table of contents" },
} as const;

interface TocItem {
  id: string;
  text: string;
}

/** Collapsible in-page navigation for viewports below `lg`, where the sticky
 *  TOC rail simply doesn't exist (`hidden lg:block`). Mobile readers — the
 *  majority of content traffic — get the same section list as the desktop rail,
 *  fed by the same `tableOfContents(article)` data. The jump itself is plain
 *  `<a href="#id">` (no JS needed); the only scripting is polish: collapse the
 *  panel after a tap and announce the section via the shared section-store so
 *  the copy-permalink / TOC-highlight contract stays in sync everywhere. */
export default function MobileToc({ items }: { items: TocItem[] }) {
  const t = useT(T);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const onNavigate = (id: string) => {
    // The browser performs the anchor scroll itself; we only collapse the
    // panel (so it doesn't cover the target section) and share the choice.
    detailsRef.current?.removeAttribute("open");
    announceSection(id);
  };

  if (items.length === 0) return null;

  return (
    <details
      ref={detailsRef}
      className="group rounded-card border border-line bg-surface lg:hidden [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-navy-800">
        {t("summary")}
        <span
          aria-hidden
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-600 transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <nav aria-label={t("summary")} className="border-t border-line px-5 py-3">
        {items.map((item, i) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            onClick={() => onNavigate(item.id)}
            className="flex items-baseline gap-3 py-2 text-sm text-navy-700 transition-colors hover:text-brand-accent"
          >
            <span className="tnum w-4 shrink-0 text-xs font-semibold text-muted">{i + 1}</span>
            {item.text}
          </a>
        ))}
      </nav>
    </details>
  );
}
