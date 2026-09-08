import { getServerLocale } from "@/lib/i18n/locale";
import { localizedFeatureNavItems, localizedNavItems } from "@/lib/nav";
import Crossroad from "@/components/brand/crossroad/Crossroad";
import {
  CROSSROAD_HREFS,
  FEATURE_CROSSROAD_HREFS,
  type CrossroadItem,
} from "@/components/brand/crossroad/meta";
import LandingModules from "@/components/brand/landing/LandingModules";
import LandingFaq from "@/components/brand/landing/LandingFaq";
import HomePathWalkthrough from "@/components/marketing/kanaly/HomePathWalkthrough";
import MonolithHero from "./MonolithHero";
import MonolithClaim from "./MonolithClaim";
import MonolithTurntable from "./MonolithTurntable";
import MonolithProof from "./MonolithProof";
import MonolithClosing from "./MonolithClosing";

/* ---------------------------------------------------------------------------
   Adamant — the Monolith landing rebuild (docs/ship/2026-09-08-landing-motion-rebuild.md)

   THIS FILE IS THE COMPOSER and nothing else, the same shape BrandLanding has,
   for the same reason: the last three landing variants this repo tried were
   single files of 412 / 525 / 1126 LOC and were retired partly for it
   (docs/roadmap/landing-variants-retired.md). Every band below is its own
   section component under the 200-LOC rubric.

   THE MOTION BUDGET IS THE STRUCTURE. Five named techniques, and each owns
   exactly ONE band, so only one thing is ever moving:

     hero        layered parallax + the cursor-tracked light   (1 client island)
     claim       scroll-trigger text reveal                    (0 JS)
     turntable   scroll-driven rotation                        (0 JS)
     walkthrough — reused, keeps its own `.reveal-on-scroll`
     proof       stacking cards, one figure at a time          (0 JS)
     modules     deliberately still
     crossroad   deliberately still
     faq         reused
     closing     one fade, and then it stops

   THE DARK HALF ARGUES, THE LIGHT HALF DEMONSTRATES. Three onyx bands make the
   claim, then the page turns to the analytic canvas for the walkthrough, the
   figures, the module grid and the questions — which is DESIGN.md's "onyx
   monument against a cool analytic canvas" used as a page structure rather than
   as a palette note.

   THE ORDER IS THE ARGUMENT, and it is the shipped page's order: what the
   product does for someone with NO budget comes before the paid-performance
   proof (docs/ship/2026-08-28-kanaly-core-path.md §6 C1), the path is WALKED
   before it is proven, and only then do the numbers arrive.

   REUSED VERBATIM: the walkthrough (it carries `id="core-path"`, which the e2e
   suite asserts on, and every panel renders the product's real output), the
   module grid (derived from the registry), the crossroad and the FAQ (its JSON-LD
   is a real SEO surface). Rebuilding those to make the diff look bigger is how a
   variant reaches 1126 LOC.
--------------------------------------------------------------------------- */

export default async function MonolithLanding() {
  const locale = await getServerLocale();

  // Same crossroad model as the shipped homepage: localized labels from the nav,
  // ORDER single-sourced from the href tuples so a nav reorder cannot silently
  // invert it.
  const navByHref = new Map(
    [...localizedNavItems(locale), ...localizedFeatureNavItems(locale)].map((i) => [i.href, i])
  );
  const crossroad: CrossroadItem[] = [];
  for (const href of [...CROSSROAD_HREFS, ...FEATURE_CROSSROAD_HREFS]) {
    const item = navByHref.get(href);
    if (item) crossroad.push(item);
    else if (process.env.NODE_ENV !== "production") {
      console.warn(`[crossroad] no nav item for ${href} — a homepage destination was silently dropped.`);
    }
  }

  return (
    <>
      <MonolithHero />
      <MonolithClaim />
      <MonolithTurntable />
      <HomePathWalkthrough />
      <MonolithProof />
      <LandingModules />
      <Crossroad items={crossroad} />
      <LandingFaq />
      <MonolithClosing />
    </>
  );
}
