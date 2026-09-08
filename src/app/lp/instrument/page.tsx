import type { Metadata } from "next";
import InstrumentLanding from "@/components/brand/instrument/InstrumentLanding";

/** Variant C of the landing research: INTERACTION — pick a business type, the
 *  page re-composes (docs/design/nextgen-landing.md, strategy "Instrument").
 *  Review surface with a decision date, hence noindex; see /lp. */
export const metadata: Metadata = {
  title: "Instrument landing (review)",
  robots: { index: false, follow: false },
};

export default function InstrumentLandingPage() {
  return <InstrumentLanding />;
}
