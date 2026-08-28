/** Homepage hero (Monolith direction) — extracted verbatim from BrandLanding so
 *  the landing can compose sections instead of growing past the 200-LOC rubric
 *  (AGENTS.md; docs/roadmap/component-debt.md). No behaviour change: same markup,
 *  same copy, same key visual — only the file boundary moved. */
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight, Sparkles } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

// Honest support levels: Google Ads is the only live-data connector; Sklik gets
// ad-copy limit checks; Meta/TikTok are social publishing surfaces. The landing
// states each level rather than implying live ingestion from all four.
const CHANNELS: { name: string; level: { cs: string; en: string } }[] = [
  { name: "Google Ads", level: { cs: "živá synchronizace", en: "live sync" } },
  { name: "Sklik", level: { cs: "kontrola inzerátů", en: "ad-copy checks" } },
  { name: "Meta", level: { cs: "publikování", en: "publishing" } },
  { name: "TikTok", level: { cs: "publikování", en: "publishing" } },
];

const T = {
  cs: {
    heroTagline: "AI pro prodej produktu",
    heroEyebrow: "Vzácný druh v adtech",
    heroTitle1: "Stůjte pevně.",
    heroTitle2: "Reklamy, které nepovolí.",
    heroSubhead:
      "AI pro digitální reklamu e-shopů a agentur: najděte kanály zdarma, měřte výkon, třiďte kampaně a generujte reklamy, opřené o vaše živá data z Google Ads.",
    heroSeeDemo: "Podívejte se na živou ukázku",
    heroStartFree: "Začít zdarma",
    heroFreeLine:
      "Během validace zcela zdarma — bez platební brány, bez limitů, které by vás zaskočily.",
    heroByomLine:
      "Vaše modely, vaše data: BYOM včetně lokální Ollamy. Nic odsud samo nevolá domů.",
    heroWorksAcross: "Funguje napříč",
  },
  en: {
    heroTagline: "AI for product sales",
    heroEyebrow: "A rare breed in adtech",
    heroTitle1: "Stand adamant.",
    heroTitle2: "Ads that never crack.",
    heroSubhead:
      "Digital advertising AI for e-shops and agencies: find the free channels, measure performance, triage campaigns and generate the ads, grounded in your live Google Ads data.",
    heroSeeDemo: "See a live example",
    heroStartFree: "Start free",
    heroFreeLine:
      "Completely free during validation — no payment gateway, no surprise limits.",
    heroByomLine:
      "Your models, your data: bring your own model, local Ollama included. Nothing phones home on its own.",
    heroWorksAcross: "Works across",
  },
} as const;

export default async function LandingHero() {
  const t = await getT(T);
  const locale = await getServerLocale();

  return (
    <section className="relative isolate overflow-hidden border-b border-onyx-line bg-onyx text-onyx-ink">
      {/* monolith key visual — background decoration */}
      <div className="absolute inset-0 -z-10" aria-hidden>
        <Image
          src="/brand/hero-monolith.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[right_center]"
        />
        {/* keep the headline side dark + readable, fade the edges into the page */}
        <div className="absolute inset-0 bg-gradient-to-r from-onyx via-onyx/85 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-onyx via-onyx/10 to-onyx/30" />
      </div>

      <Container className="relative py-20 lg:py-28">
        {/* Text column extended across ~70% of the hero on desktop, overlapping
            the monolith so only the right ~30% reads as pure key visual. */}
        <div className="w-full lg:w-[70%]">
          <div className="flex items-center gap-3">
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl ring-1 ring-onyx-line">
              <Image
                src="/brand/logo-monolith.png"
                alt="Adamant logo"
                width={44}
                height={44}
                className="h-full w-full scale-[1.08] object-cover"
              />
            </span>
            <div className="leading-none">
              <p className="text-xl font-semibold tracking-tight text-white">Adamant</p>
              <p className="mt-1 text-[12px] font-medium uppercase tracking-[0.18em] text-onyx-muted">
                {t("heroTagline")}
              </p>
            </div>
          </div>

          <span className="mt-7 inline-flex items-center gap-2 rounded-pill border border-onyx-line bg-onyx-soft/60 px-3 py-1.5 text-xs font-semibold text-brand-300">
            <Sparkles width={13} height={13} />{t("heroEyebrow")}
          </span>

          <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
            {t("heroTitle1")}
            <br />
            <span className="text-brand-300">{t("heroTitle2")}</span>
          </h1>

          <p className="mt-5 max-w-lg text-lg leading-relaxed text-onyx-muted">
            {t("heroSubhead")}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
            {/* Free-during-validation launch: "Start free" → /app is the single
                primary CTA; the no-login demo stays reachable as a text link. */}
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 shadow-card transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99]"
            >
              {t("heroStartFree")}
              <ArrowRight width={17} height={17} />
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium text-onyx-muted underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200"
            >
              {t("heroSeeDemo")}
            </Link>
          </div>

          {/* Local-first proof lines — only what is TRUE today: free during
              validation (elevates what /cena states, no payment gateway is
              wired), and BYOM across 6 vendors incl. a local Ollama with no
              analytics SDK in the tree (src/lib/llm/byom/adapters.ts, README
              "License & self-hosting"). Deliberately NOT an "open source" or
              self-hosting claim — that is a commitment, and self-hosting does
              not work yet. */}
          <ul className="mt-6 max-w-lg space-y-1.5 text-sm leading-relaxed text-onyx-muted">
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 bg-brand-300" />
              {t("heroFreeLine")}
            </li>
            <li className="flex gap-2.5">
              <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 bg-brand-300" />
              {t("heroByomLine")}
            </li>
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-2 text-sm text-onyx-muted">
            <span className="font-medium">{t("heroWorksAcross")}</span>
            {CHANNELS.map((c) => (
              <span
                key={c.name}
                className="rounded-pill border border-onyx-line bg-onyx-soft/40 px-2.5 py-1 text-xs font-medium text-onyx-ink"
              >
                {c.name}
                <span className="ml-1 font-normal text-onyx-muted">· {c.level[locale] ?? c.level.en}</span>
              </span>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
