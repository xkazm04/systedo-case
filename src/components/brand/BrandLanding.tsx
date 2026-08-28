import { getServerLocale } from "@/lib/i18n/locale";
import { localizedFeatureNavItems, localizedNavItems } from "@/lib/nav";
import Crossroad from "@/components/brand/crossroad/Crossroad";
import {
  CROSSROAD_HREFS,
  FEATURE_CROSSROAD_HREFS,
  type CrossroadItem,
} from "@/components/brand/crossroad/meta";
import LandingHero from "@/components/brand/landing/LandingHero";
import LandingProof from "@/components/brand/landing/LandingProof";
import LandingClosing from "@/components/brand/landing/LandingClosing";
import HomeFreeChannelsBand from "@/components/marketing/kanaly/HomeFreeChannelsBand";

/* ---------------------------------------------------------------------------
   Adamant — homepage (Monolith direction)
   The chosen brand direction: an unbreakable obsidian monument. This file is the
   COMPOSER: each band lives in its own section component (brand/landing/*, and
   the free-channel band under marketing/kanaly/), which is what keeps the page
   editable without growing a single file past the 200-LOC rubric. The site-wide
   subtle facet pattern lives on <main> (see globals.css .bg-facets).

   Section order is the story: what the product does for someone with no budget
   comes BEFORE the paid-performance proof band, because the free-channel path is
   the first job it can do for a visitor who has never bought a click
   (docs/ship/2026-08-28-kanaly-core-path.md §6 C1).
--------------------------------------------------------------------------- */

export default async function BrandLanding() {
  const locale = await getServerLocale();

  // The homepage crossroad: the four case-study destinations that used to live in
  // the header nav, plus the public feature pages. Localized labels/blurbs come
  // from the shared nav model, but ORDER is single-sourced from the href tuples,
  // so a nav reorder can't silently invert the crossroad. Each card's icon and
  // illustration join on the client (see crossroad/meta).
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
      <LandingHero />
      <HomeFreeChannelsBand />
      <LandingProof />
      <Crossroad items={crossroad} />
      <LandingClosing />
    </>
  );
}
