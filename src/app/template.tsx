"use client";

import { usePathname } from "next/navigation";

/** Wraps every route's content. Unlike layout.tsx, a template re-mounts on each
 *  navigation — so this opacity fade plays on every page change, easing content
 *  in instead of swapping it instantly. Opacity-only (no transform) keeps the
 *  sticky article TOC and chart tooltips behaving correctly.
 *
 *  The fade is skipped under the authed /app workspace: a 0.4s fade on every click
 *  inside a data tool reads as lag, whereas it feels premium on the marketing pages.
 *  (Reading the path needs a client component; children stay server-rendered.) */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fade = !pathname.startsWith("/app");
  return <div className={fade ? "animate-fade-in" : undefined}>{children}</div>;
}
