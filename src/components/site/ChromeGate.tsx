"use client";

import { usePathname } from "next/navigation";

/** Hides the marketing chrome (header / footer) on the authed product surface and
 *  the public /dashboard demo. Both run their own sidebar shell over the full
 *  viewport, so the case-study top nav + footer must not wrap them. Everything
 *  else (the marketing site, the client-facing report / microsite) keeps the
 *  normal chrome. */
export default function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/app" || pathname.startsWith("/app/") || pathname === "/dashboard") return null;
  return <>{children}</>;
}
