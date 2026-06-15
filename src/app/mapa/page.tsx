import type { Metadata } from "next";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { NAV_ITEMS } from "@/lib/nav";
import { canonical } from "@/lib/site";

/** Site-map / information-architecture page: the navigation model rendered as a
 *  presented deliverable. Header, footer, home rozcestník, breadcrumbs, sitemap
 *  and this page all read the one NAV_ITEMS source — so links never drift. */
export const metadata: Metadata = {
  title: "Mapa případové studie",
  description:
    "Informační architektura webu — všechny stránky studie v pořadí úkolů, odvozené z jednoho navigačního modelu.",
  alternates: { canonical: "/mapa" },
};

const journey = [...NAV_ITEMS].sort((a, b) => a.task - b.task);

/** Supplementary pages outside the task journey, so every route is reachable
 *  from the map (not just the in-page links that surface them). */
const META_PAGES: { href: string; label: string; blurb: string }[] = [
  {
    href: "/clanek/vykon",
    label: "Datový report",
    blurb: "Automaticky generovaný výkonnostní report — data z dashboardu publikovaná jako strukturovaný článek.",
  },
  {
    href: "/design-system",
    label: "Design system",
    blurb: "Živý přehled sdílených UI primitiv, barevných tokenů, ikon a lokalizace (cs/en).",
  },
];

// SiteNavigation structured data, derived from the same array as the page.
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  name: "Mapa případové studie Systedo",
  itemListElement: journey.map((item, i) => ({
    "@type": "SiteNavigationElement",
    position: i + 1,
    name: item.label,
    description: item.blurb,
    url: canonical(item.href),
  })),
};

export default function MapaPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Container className="max-w-3xl py-12 sm:py-16">
        <Eyebrow>Informační architektura</Eyebrow>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-navy-800 sm:text-[2.4rem]">
          Mapa případové studie
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted">
          Celá studie je řízená jedním typovaným navigačním modelem (<code>NAV_ITEMS</code>) —
          hlavička, patička, domovský rozcestník, drobečky, sitemap i tato mapa čtou stejný
          zdroj, takže odkazy nikdy nerozjedou.
        </p>

        <ol className="mt-8 space-y-3">
          {journey.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex items-start gap-4 rounded-card border border-line bg-surface p-5 transition-colors hover:border-brand-300"
              >
                <span className="tnum grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-50 text-sm font-semibold text-navy-700">
                  {item.task === 0 ? "—" : item.task}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-navy-800">
                    {item.label}
                    <ArrowRight
                      width={15}
                      height={15}
                      className="text-muted transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{item.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>

        {/* supplementary pages */}
        <h2 className="mt-12 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          Doplňkové stránky
        </h2>
        <ul className="mt-4 space-y-3">
          {META_PAGES.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="group flex items-start gap-4 rounded-card border border-line bg-surface p-5 transition-colors hover:border-brand-300"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-50 text-sm font-semibold text-navy-700">
                  +
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-semibold text-navy-800">
                    {item.label}
                    <ArrowRight
                      width={15}
                      height={15}
                      className="text-muted transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{item.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </>
  );
}
