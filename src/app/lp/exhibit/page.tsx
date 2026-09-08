import type { Metadata } from "next";
import ExhibitLanding from "@/components/brand/exhibit/ExhibitLanding";

/** Variant B of the landing research: SPACE — every fact a numbered specimen in
 *  a gallery (docs/design/nextgen-landing.md, strategy "Exhibit"). Review
 *  surface with a decision date, hence noindex; see /lp. */
export const metadata: Metadata = {
  title: "Exhibit landing (review)",
  robots: { index: false, follow: false },
};

export default function ExhibitLandingPage() {
  return <ExhibitLanding />;
}
