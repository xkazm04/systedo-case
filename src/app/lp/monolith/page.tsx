import type { Metadata } from "next";
import MonolithLanding from "@/components/brand/monolith/MonolithLanding";

/** The Monolith landing rebuild, live and reachable so it can be judged against
 *  the shipped homepage instead of against a screenshot
 *  (docs/ship/2026-09-08-landing-motion-rebuild.md).
 *
 *  `noindex` because this URL is a REVIEW surface with a decision date on it, not
 *  a second homepage — the last set of `/lp` variants was retired for being
 *  permanent and unreachable, and this one is deliberately neither
 *  (docs/roadmap/landing-variants-retired.md). It is absent from `sitemapEntries()`
 *  for the same reason. When the swap happens this route and `/lp` are deleted in
 *  the same diff that repoints `/`. */
export const metadata: Metadata = {
  title: "Monolith landing (review)",
  robots: { index: false, follow: false },
};

export default function MonolithLandingPage() {
  return <MonolithLanding />;
}
