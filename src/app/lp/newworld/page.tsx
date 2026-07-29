import type { Metadata } from "next";
import LandingNewWorld from "@/components/brand/variants/LandingNewWorld";

/** Landing-page comparison, VARIANT B — "The Level Run".
 *
 *  A replacement visual world for the Adamant homepage: the page is staged as a
 *  surveyor's levelling run (measure → misclosure → setting out), which is the
 *  product's own measure → triage → generate loop used as structure rather than
 *  as a claim. Reads the locale cookie via getT/getServerLocale, which the root
 *  layout already wraps in a Suspense boundary (Cache Components), exactly as the
 *  incumbent homepage does. */
export const metadata: Metadata = {
  title: "Adamant — nejdřív změřit, pak vytyčit",
  robots: { index: false, follow: false },
};

export default function NewWorldLandingPage() {
  return <LandingNewWorld />;
}
