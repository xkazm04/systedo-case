import type { Metadata } from "next";
import StoryLanding from "@/components/brand/story/StoryLanding";

/** Variant A of the landing research: TIME — one project, the scroll is the film
 *  (docs/design/nextgen-landing.md, strategy "Story"). Review surface with a
 *  decision date, hence noindex; see /lp. */
export const metadata: Metadata = {
  title: "Story landing (review)",
  robots: { index: false, follow: false },
};

export default function StoryLandingPage() {
  return <StoryLanding />;
}
