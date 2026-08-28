import type { Metadata } from "next";
import FreeChannelsHero from "@/components/marketing/kanaly/FreeChannelsHero";
import FreeChannelsPath from "@/components/marketing/kanaly/FreeChannelsPath";
import SeededPlanTable from "@/components/marketing/kanaly/SeededPlanTable";
import VisibilityPlanBand from "@/components/marketing/kanaly/VisibilityPlanBand";
import FreeChannelsClosing from "@/components/marketing/kanaly/FreeChannelsClosing";
import { freeChannelFacts } from "@/components/marketing/kanaly/facts";
import { getT } from "@/lib/i18n/server";

/** Kanály zdarma — the public feature page for the free-channel (organic
 *  visibility) path. Every other pillar of the product has one (/lokalni-seo,
 *  /socialni, /kampane, /knihovna); this path had none, which is why nothing on
 *  the site said the product does anything for a visitor with no ad budget
 *  (docs/ship/2026-08-28-kanaly-core-path.md §6 C1/C2).
 *
 *  Fully static: the sections are server components over pure fixture data
 *  (`freeChannelFacts`), so the route prerenders with no client JS of its own. */
const T = {
  cs: {
    metaTitle: "Kanály zdarma – kde se zviditelnit bez rozpočtu",
    metaDescription:
      "Zadáte adresu webu a dostanete seřazený plán bezplatných kanálů pro český trh: katalogy, porovnávače, komunity, obsah, PR a partnerství, u každého jak sedí vaší firmě a co udělat jako první.",
  },
  en: {
    metaTitle: "Free channels – where to get seen without a budget",
    metaDescription:
      "Give it a web address and get a ranked plan of free Czech-market channels: directories, marketplaces, communities, content, PR and partnerships, each with how well it fits you and what to do first.",
  },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT(T);
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: "/kanaly-zdarma" },
  };
}

export default function FreeChannelsPage() {
  // Resolved once and threaded down, so the hero's counts and the table's rows
  // are provably the same read of the same catalog.
  const facts = freeChannelFacts();
  return (
    <>
      <FreeChannelsHero facts={facts} />
      <FreeChannelsPath />
      <SeededPlanTable facts={facts} />
      <VisibilityPlanBand />
      <FreeChannelsClosing />
    </>
  );
}
