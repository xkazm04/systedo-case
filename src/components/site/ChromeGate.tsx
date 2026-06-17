"use client";

import { usePathname } from "next/navigation";

/** Hides the marketing chrome (header / footer) on the authed product surface.
 *  The app lives under /app with its own sidebar shell, so the case-study top
 *  nav + footer must not wrap it. Everything else (the marketing site, the
 *  client-facing report / microsite) keeps the normal chrome. */
export default function ChromeGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/app" || pathname.startsWith("/app/")) return null;
  return <>{children}</>;
}
