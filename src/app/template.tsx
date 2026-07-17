"use client";

import { usePathname } from "next/navigation";

/** Wraps every route's content. Unlike layout.tsx, a template re-mounts on each
 *  navigation — so this opacity fade plays on every page change, easing content
 *  in instead of swapping it instantly. Opacity-only (no transform) keeps the
 *  sticky article TOC and chart tooltips behaving correctly.
 *
 *  The fade is skipped on the data tools — the authed /app workspace and the public
 *  /dashboard demo, INCLUDING their sub-routes — because a 0.4s fade on every click
 *  inside a data tool reads as lag, whereas it feels premium on the marketing pages.
 *  (Reading the path needs a client component; children stay server-rendered.) */
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Match on whole path segments, not raw prefix/exact: `startsWith("/app")` would
  // also swallow a future `/approach`, and an exact `=== "/dashboard"` would miss a
  // future `/dashboard/settings`. `=== base || startsWith(base + "/")` covers each
  // route and its sub-routes without colliding with sibling names.
  const isDataTool = ["/app", "/dashboard"].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
  const fade = !isDataTool;
  return <div className={fade ? "animate-fade-in" : undefined}>{children}</div>;
}
