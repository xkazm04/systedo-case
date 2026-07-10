"use client";

import { useEffect } from "react";

/** Null-UI island that completes the FAQ deep-linking loop: arriving with
 *  `#faq-question-id` (or clicking such a link in-page) auto-opens the matching
 *  closed <details> and scrolls it into view — a hash alone can't reveal
 *  content inside a collapsed accordion. Runs on mount for the initial URL and
 *  on every subsequent `hashchange`. Honors prefers-reduced-motion for the
 *  corrective scroll (the element's own `scroll-mt` offset applies either way). */
export default function FaqHashOpen({ ids }: { ids: string[] }) {
  useEffect(() => {
    const idSet = new Set(ids);

    const openFromHash = () => {
      const raw = window.location.hash.replace(/^#/, "");
      // A malformed percent-escape (a stray "%", e.g. /clanek#50%off or a mangled
      // campaign link) makes decodeURIComponent throw URIError — synchronously inside
      // this effect, which React 19 escalates to the error boundary / tears down the
      // article's client tree. Decode defensively and degrade to a no-op.
      let id: string;
      try {
        id = decodeURIComponent(raw);
      } catch {
        return;
      }
      if (!id || !idSet.has(id)) return;
      const el = document.getElementById(id);
      if (!(el instanceof HTMLDetailsElement)) return;
      const wasOpen = el.open;
      el.open = true;
      // The browser's native anchor jump targeted a collapsed element; once it
      // expands, re-align so the question sits below the sticky header.
      if (!wasOpen) {
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      }
    };

    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [ids]);

  return null;
}
