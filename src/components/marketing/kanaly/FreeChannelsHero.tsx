/** Hero of `/kanaly-zdarma` — the free-channel path stated as the first job the
 *  product does, before any talk of ad spend. Every figure in the stat strip is
 *  derived (see ./facts); nothing here is a typed-in number. Server component:
 *  copy resolves through `getT`, and there is no client JS on this section. */
import Link from "next/link";
import { buttonClass, Container, Eyebrow } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import type { FreeChannelFacts } from "./facts";

const T = {
  cs: {
    eyebrow: "Bez rozpočtu na reklamu",
    heading: "Nejdřív zjistěte, kde vás najdou",
    headingAccent: "zdarma.",
    sub: "Zadáte adresu webu. Adamant si ho projde, pochopí, co prodáváte a komu, a sestaví seřazený plán bezplatných kanálů pro český trh — katalogy, porovnávače, komunity, vlastní obsah, PR a partnerství — u každého s odhadem, jak dobře sedí právě vám, kolik práce dá a co udělat jako první.",
    ctaDemo: "Otevřít živou ukázku",
    ctaStart: "Začít zdarma",
    statFamilies: "rodin kanálů",
    statChannels: "kurátorovaných českých kanálů",
    statTypes: "typů podnikání s vlastním plánem",
    honesty:
      "Placenou reklamu řeší v Adamantu jiné moduly. Tenhle nepočítá s žádným mediálním rozpočtem: každý kanál v plánu je zdarma na vstup.",
  },
  en: {
    eyebrow: "No ad budget required",
    heading: "First find out where people can find you",
    headingAccent: "for free.",
    sub: "You give it a web address. Adamant reads the site, works out what you sell and to whom, and builds a ranked plan of free channels for the Czech market — directories, marketplaces, communities, owned content, PR and partnerships — each with how well it fits you, how much work it takes and what to do first.",
    ctaDemo: "Open the live demo",
    ctaStart: "Start free",
    statFamilies: "channel families",
    statChannels: "curated Czech-market channels",
    statTypes: "business types with their own plan",
    honesty:
      "Paid advertising is other modules' job in Adamant. This one assumes no media budget at all: every channel in the plan is free to enter.",
  },
} as const;

export default async function FreeChannelsHero({ facts }: { facts: FreeChannelFacts }) {
  const t = await getT(T);
  const stats = [
    { value: facts.families, label: t("statFamilies") },
    { value: facts.curatedChannels, label: t("statChannels") },
    { value: facts.businessTypes, label: t("statTypes") },
  ];

  return (
    <section className="border-b border-line">
      <Container className="py-14 lg:py-20">
        <div className="max-w-3xl animate-fade-up">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight text-navy-800 sm:text-5xl">
            {t("heading")} <span className="text-brand-accent">{t("headingAccent")}</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">{t("sub")}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/dashboard?m=kanaly" className={buttonClass("primary", "lg")}>
              {t("ctaDemo")}
              <ArrowRight width={17} height={17} />
            </Link>
            <Link href="/app" className={buttonClass("secondary", "lg")}>
              {t("ctaStart")}
            </Link>
          </div>
        </div>

        {/* Derived counts — see ./facts. A curated channel added or a family
            introduced moves these the same day it moves the product. */}
        <dl className="mt-12 grid grid-cols-1 gap-6 border-t border-line pt-8 sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="tnum text-3xl font-semibold tracking-tight text-brand-accent">
                {s.value}
              </dt>
              <dd className="mt-1.5 text-sm text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-8 max-w-2xl border-l-2 border-brand-300 pl-4 text-sm leading-relaxed text-muted">
          {t("honesty")}
        </p>
      </Container>
    </section>
  );
}
