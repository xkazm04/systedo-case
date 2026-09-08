/** MONOLITH CLAIM — technique 2 of 5: SCROLL-TRIGGER TEXT REVEAL.
 *
 *  The lead claim does not exist until the reader reaches it. Each line sits in
 *  its own `overflow: hidden` mask and rises through it, one after another, on a
 *  view() timeline (globals.css `.mono-reveal-line`) — so the sentence assembles
 *  at the reader's pace rather than having already played before they arrived.
 *  Zero JavaScript; with no scroll-timeline support the lines are simply there.
 *
 *  It is the lead claim, and it stays the lead claim: the free-channel path is
 *  the first job the product can do for a visitor who has never bought a click
 *  (docs/ship/2026-08-28-kanaly-core-path.md §6 C1). Only the delivery changed.
 *
 *  The named channels are read out of the seeded plan (marketing/kanaly/facts),
 *  never typed here, so this band cannot name a channel the product does not
 *  curate — the same rule the shipped band already holds itself to. */
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import { freeChannelFacts } from "@/components/marketing/kanaly/facts";

/** How many channel names the band shows as evidence. */
const NAMED = 4;

const T = {
  cs: {
    eyebrow: "Začněte bez rozpočtu",
    line1: "Nejdřív kanály zdarma,",
    line2: "teprve pak placené kliky.",
    sub: "Zadáte adresu webu a dostanete seřazený plán míst, kde se dá zviditelnit bez rozpočtu na reklamu: {families} rodin kanálů a {channels} kurátorovaných českých kanálů, u každého jak dobře sedí vaší firmě, kolik dá práce a co udělat jako první.",
    namedLead: "Například",
    cta: "Jak kanály zdarma fungují",
    ctaDemo: "Živá ukázka",
  },
  en: {
    eyebrow: "Start with no budget",
    line1: "Free channels first,",
    line2: "paid clicks second.",
    sub: "Give it a web address and get a ranked plan of places you can be found without an ad budget: {families} channel families and {channels} curated Czech-market channels, each with how well it fits you, how much work it takes and what to do first.",
    namedLead: "For example",
    cta: "How free channels work",
    ctaDemo: "Live demo",
  },
} as const;

export default async function MonolithClaim() {
  const t = await getT(T);
  const facts = freeChannelFacts();
  const named = facts.demo.plan.slice(0, NAMED).map((c) => c.name);

  return (
    <section className="relative isolate overflow-hidden border-b border-onyx-line bg-onyx text-onyx-ink">
      {/* Many threads resolving into one point — the band's own claim, drawn.
          Held well back: it is the argument's backdrop, not the argument. */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <Image
          src="/brand/monolith/band-claim.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover opacity-40 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-onyx via-onyx/80 to-onyx/40" />
        <div className="absolute inset-0 bg-gradient-to-b from-onyx via-transparent to-onyx" />
      </div>

      <Container className="py-20 lg:py-28">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <div>
            <p className="mono-reveal-line text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-300">
              <span>{t("eyebrow")}</span>
            </p>

            <h2 className="mt-5 text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">
              <span className="mono-reveal-line">
                <span>{t("line1")}</span>
              </span>
              <span className="mono-reveal-line text-brand-300">
                <span>{t("line2")}</span>
              </span>
            </h2>

            <p className="mono-reveal-line mt-6 max-w-xl text-base leading-relaxed text-onyx-muted">
              <span>
                {t("sub", {
                  families: String(facts.families),
                  channels: String(facts.curatedChannels),
                })}
              </span>
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/kanaly-zdarma"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
              >
                {t("cta")}
                <ArrowRight width={17} height={17} />
              </Link>
              <Link
                href="/dashboard?m=kanaly"
                className="text-sm font-medium text-onyx-muted underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200"
              >
                {t("ctaDemo")}
              </Link>
            </div>
          </div>

          {/* Evidence, read from the curated catalog — never a hand-typed list. */}
          <div className="rounded-card border border-onyx-line bg-onyx-soft/50 p-6 backdrop-blur-[2px]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              {t("namedLead")}
            </p>
            <ul className="mono-seq mt-4 space-y-2.5">
              {named.map((name) => (
                <li key={name} className="flex items-start gap-2.5 text-sm text-onyx-ink">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 bg-brand-400" />
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
