import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

/* ---------------------------------------------------------------------------
   /lp — landing-page variant comparison index.

   An internal review surface, not a marketing page: it exists so the three
   Impeccable-built alternatives and the incumbent can be opened side by side
   at the same viewport. Deliberately plain — the variants supply the design,
   this page must not compete with them. noindex, and linked from nowhere.

   Detector counts are the verified numbers from a re-scan of each route at
   1440x900 and 390x844, not the builders' self-reported figures. "Actionable"
   excludes three verified false-positive families (ai-color-palette on the
   documented brand teal, .bg-facets analytic-gradient contrast, shadow-card's
   negative spread) and the shared Nav's own AA failure, which every route
   inherits and none of them caused.
--------------------------------------------------------------------------- */

export const metadata: Metadata = {
  title: "Varianty landing page — srovnání",
  robots: { index: false, follow: false },
};

type Variant = {
  href: string;
  lane: string;
  name: { cs: string; en: string };
  note: { cs: string; en: string };
  total: number;
  actionable: number;
};

const INCUMBENT: Variant = {
  href: "/",
  lane: "—",
  name: { cs: "Současná stránka", en: "Incumbent" },
  note: {
    cs: "Monolith. Výchozí stav, proti kterému se ostatní měří.",
    en: "Monolith. The baseline the others are measured against.",
  },
  total: 43,
  actionable: 6,
};

const VARIANTS: Variant[] = [
  {
    href: "/lp/bolder",
    lane: "bolder + typeset",
    name: { cs: "Zesílená", en: "Amplified" },
    note: {
      cs: "Zachovává Monolith a dotahuje ho pod fold. Geist Mono konečně nese čísla — 72 % sans / 28 % mono.",
      en: "Keeps Monolith and carries it past the fold. Geist Mono finally carries the figures — 72% sans / 28% mono.",
    },
    total: 32,
    actionable: 0,
  },
  {
    href: "/lp/newworld",
    lane: "new-work",
    name: { cs: "Nivelační pořad", en: "The Level Run" },
    note: {
      cs: "Nový vizuální svět: geodetická nivelace. Struktura stránky je měření → odchylka → vytyčení.",
      en: "A replacement world: geodetic levelling. The page's structure is measure → deviation → setting-out.",
    },
    total: 11,
    actionable: 0,
  },
  {
    href: "/lp/distilled",
    lane: "distill + layout",
    name: { cs: "Destilovaná", en: "Distilled" },
    note: {
      cs: "Méně prvků, víc argumentu: smyčka, úrovně kanálů a ceny přímo na stránce.",
      en: "Fewer elements, more argument: the loop, the channel tiers, and pricing on the page itself.",
    },
    total: 28,
    // 1, not 0: `single-font` still fires here. Variant C kept one typeface on
    // purpose, citing DESIGN.md's "don't add a second face" — a deliberate
    // divergence, not an oversight, but counting it as zero would be dishonest.
    actionable: 1,
  },
];

const T = {
  cs: {
    title: "Varianty landing page",
    lead: "Tři alternativy postavené přes Impeccable, každá jinou cestou, plus současná stránka. Otevřete je ve stejné šířce okna — jinak srovnáváte viewporty, ne návrhy.",
    lane: "Postup",
    findings: "Nálezy detektoru",
    actionable: "z toho k řešení",
    open: "Otevřít",
    footnote:
      "Počty jsou z nezávislého přeměření každé routy, ne z hlášení autorů. „K řešení“ nezahrnuje tři ověřené kategorie falešných poplachů ani chybu kontrastu ve sdílené navigaci, kterou dědí všechny varianty.",
  },
  en: {
    title: "Landing page variants",
    lead: "Three alternatives built through Impeccable, each down a different lane, plus the incumbent. Open them at the same window width — otherwise you are comparing viewports, not designs.",
    lane: "Lane",
    findings: "Detector findings",
    actionable: "actionable",
    open: "Open",
    footnote:
      "Counts come from an independent re-scan of each route, not from the builders' self-reports. “Actionable” excludes three verified false-positive families and the shared navigation's own contrast failure, which every variant inherits.",
  },
} as const;

export default async function VariantIndexPage() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const rows = [INCUMBENT, ...VARIANTS];

  return (
    <Container className="py-16 lg:py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-navy-800 sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{t("lead")}</p>

      <ul className="mt-12 flex flex-col gap-px overflow-hidden rounded-card bg-line">
        {rows.map((v) => (
          <li key={v.href}>
            <Link
              href={v.href}
              className="group flex flex-col gap-4 bg-surface p-6 transition-colors hover:bg-brand-50/50 sm:flex-row sm:items-center sm:gap-8"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-lg font-semibold tracking-tight text-navy-800">
                    {v.name[locale] ?? v.name.en}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-[0.14em] text-brand-accent">
                    {v.lane}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {v.note[locale] ?? v.note.en}
                </p>
              </div>

              <dl className="flex shrink-0 items-center gap-6 sm:gap-8">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">
                    {t("findings")}
                  </dt>
                  <dd className="tnum mt-0.5 text-2xl font-semibold tracking-tight text-navy-800">
                    {v.total}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.12em] text-muted">
                    {t("actionable")}
                  </dt>
                  <dd
                    className={`tnum mt-0.5 text-2xl font-semibold tracking-tight ${
                      v.actionable === 0 ? "text-positive" : "text-coral-600"
                    }`}
                  >
                    {v.actionable}
                  </dd>
                </div>
                <ArrowRight
                  width={18}
                  height={18}
                  className="text-muted transition-transform group-hover:translate-x-1"
                />
              </dl>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-2xl text-xs leading-relaxed text-muted">{t("footnote")}</p>
    </Container>
  );
}
