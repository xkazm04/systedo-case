"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link } from "@/components/icons";
import { announceSection } from "./section-store";
import { useT } from "@/lib/i18n/client";

const T = {
  cs: {
    copyLinkAria: "Kopírovat odkaz na sekci: {text}",
    copyLinkTitle: "Kopírovat odkaz na sekci",
    copiedToast: "Odkaz na sekci zkopírován",
  },
  en: {
    copyLinkAria: "Copy link to section: {text}",
    copyLinkTitle: "Copy link to section",
    copiedToast: "Section link copied",
  },
} as const;

/** Padding/typography for each heading level, kept identical to the inline
 *  versions ArticleBody used to render so this island is a drop-in swap. The
 *  vertical padding moves to the wrapper (so the reveal button can sit on the
 *  heading's baseline) while `scroll-mt-24` and the id stay on the heading
 *  itself — that's the element anchor links scroll to. */
const WRAP = { h2: "pt-6", h3: "pt-2" } as const;
const HEADING = {
  h2: "scroll-mt-24 text-2xl font-semibold tracking-tight text-navy-800",
  h3: "scroll-mt-24 text-lg font-semibold text-navy-800",
} as const;

/** A heading that reveals a "#" permalink button on hover/focus (the
 *  GitHub/Docusaurus/Notion pattern). Clicking copies a deep link
 *  (origin + path + #id) to the clipboard, reflects it in the address bar,
 *  flashes a toast, and tells the sticky TOC to highlight this section.
 *
 *  The button is a sibling of the heading — not a descendant — so it never
 *  pollutes the heading's accessible name, and it is gated on hover-capable
 *  pointers so touch readers don't get an invisible, unrevealable control. */
export default function HeadingAnchor({
  level,
  id,
  text,
}: {
  level: "h2" | "h3";
  id: string;
  text: string;
}) {
  const t = useT(T);
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const Tag = level;

  // Clear any pending toast timer on unmount.
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copyLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}#${id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for browsers without the async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* clipboard unavailable — nothing more we can do */
      }
      document.body.removeChild(ta);
    }

    // Reflect the permalink in the address bar (no scroll jump — the heading is
    // already in view) and slide the TOC highlight to the copied section.
    history.replaceState(null, "", `#${id}`);
    announceSection(id);

    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className={`group/anchor relative flex items-center gap-2 ${WRAP[level]}`}>
      <Tag id={id} className={HEADING[level]}>
        {text}
      </Tag>

      <button
        type="button"
        onClick={copyLink}
        aria-label={t("copyLinkAria", { text })}
        title={t("copyLinkTitle")}
        className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:text-brand-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 group-hover/anchor:opacity-100 [@media(hover:hover)]:inline-flex"
      >
        {copied ? (
          <Check width={15} height={15} className="text-positive" />
        ) : (
          <Link width={15} height={15} />
        )}
      </button>

      {/* Confirmation toast — a sibling of the heading (never a descendant) so it
          stays out of the heading's accessible name. role=status announces it. */}
      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4"
        >
          <span className="animate-drop inline-flex items-center gap-2 rounded-pill bg-onyx px-4 py-2.5 text-sm font-medium text-white shadow-pop">
            <Check width={16} height={16} className="text-brand-400" />
            {t("copiedToast")}
          </span>
        </div>
      )}
    </div>
  );
}
