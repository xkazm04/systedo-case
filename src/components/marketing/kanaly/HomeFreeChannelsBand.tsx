/** The free-channel path on the HOMEPAGE, placed ahead of the paid proof band.
 *
 *  Why it sits there: the first job Adamant can do for someone who has not spent
 *  a koruna on ads is tell them where they can be found for free. Until this
 *  section shipped, every marketing surface opened on measure → triage → generate
 *  (paid Google Ads data), which meant the one path a URL-first visitor can walk
 *  on day one was invisible (impact analysis §6 C1).
 *
 *  The named channels are read out of the seeded plan (./facts) rather than typed
 *  here, so the homepage cannot name a channel the product does not curate. */
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import { freeChannelFacts } from "./facts";

/** How many channel names the band shows as evidence. */
const NAMED = 4;

const T = {
  cs: {
    eyebrow: "Začněte bez rozpočtu",
    heading: "Nejdřív kanály zdarma, teprve pak placené kliky.",
    sub: "Zadáte adresu webu a dostanete seřazený plán míst, kde se dá zviditelnit bez rozpočtu na reklamu: {families} rodin kanálů a {channels} kurátorovaných českých kanálů, u každého jak dobře sedí vaší firmě, kolik dá práce a co udělat jako první.",
    namedLead: "Například",
    cta: "Jak kanály zdarma fungují",
    ctaDemo: "Živá ukázka",
  },
  en: {
    eyebrow: "Start with no budget",
    heading: "Free channels first, paid clicks second.",
    sub: "Give it a web address and get a ranked plan of places you can be found without an ad budget: {families} channel families and {channels} curated Czech-market channels, each with how well it fits you, how much work it takes and what to do first.",
    namedLead: "For example",
    cta: "How free channels work",
    ctaDemo: "Live demo",
  },
} as const;

export default async function HomeFreeChannelsBand() {
  const t = await getT(T);
  const facts = freeChannelFacts();
  const named = facts.demo.plan.slice(0, NAMED).map((c) => c.name);

  return (
    <section className="border-b border-line bg-surface">
      <Container className="py-14 lg:py-16">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              {t("heading")}
            </h2>
            <p className="mt-4 max-w-xl leading-relaxed text-muted">
              {t("sub", {
                families: String(facts.families),
                channels: String(facts.curatedChannels),
              })}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/kanaly-zdarma"
                className="inline-flex items-center gap-2 rounded-pill bg-onyx px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-onyx-soft"
              >
                {t("cta")}
                <ArrowRight width={17} height={17} />
              </Link>
              <Link
                href="/dashboard?m=kanaly"
                className="text-sm font-medium text-muted underline decoration-line underline-offset-4 transition-colors hover:text-brand-accent"
              >
                {t("ctaDemo")}
              </Link>
            </div>
          </div>

          {/* Evidence, read from the curated catalog — never a hand-typed list. */}
          <div className="rounded-card border border-line bg-brand-50/40 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-accent">
              {t("namedLead")}
            </p>
            <ul className="mt-3 space-y-2">
              {named.map((name) => (
                <li key={name} className="flex items-start gap-2.5 text-sm text-navy-700">
                  <span
                    aria-hidden
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 bg-brand-400"
                  />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </section>
  );
}
