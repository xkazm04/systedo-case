import type { Metadata } from "next";
import LocalSeoShowcase from "@/components/marketing/LocalSeoShowcase";

/** Local SEO — the animated marketing surface for the Local SEO project type
 *  (consolidation phase 2). Showcases the ported motion craft (rank-climb hero,
 *  hand-rolled SVG charts) on Adamant's design tokens. Static: all animation is
 *  client-side and locale comes from the client i18n context, so the shell
 *  prerenders and the showcase hydrates. */
export const metadata: Metadata = {
  title: "Lokální SEO",
  description:
    "Pozice v mapovém balíčku, recenze a Google Business Profil napříč pobočkami — v jednom workspace. Animovaná ukázka výstupu v mapě z #4 na #1.",
  alternates: { canonical: "/lokalni-seo" },
};

export default function LokalniSeoPage() {
  return <LocalSeoShowcase />;
}
