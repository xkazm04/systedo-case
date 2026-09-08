/** MONOLITH HERO — technique 1 of 5: LAYERED PARALLAX, plus the cursor-tracked
 *  light that MonolithLight drives.
 *
 *  Three planes at three speeds (globals.css `.mono-plane-{far,mid,near}`), all
 *  driven by page-scroll progress rather than by mount time, because a hero is
 *  already on screen when the page loads and a view() timeline would be finished
 *  before the reader arrived:
 *
 *    far   hero-far.jpg   a lattice receding to a vanishing point   moves 4%
 *    mid   hero-mass.jpg  the monument itself                       moves 9%
 *    near  hero-veil.jpg  haze and dust the reader looks through    moves 18%
 *
 *  All three are Leonardo-generated from prompts in scripts/brand-assets.manifest.json,
 *  and all three arrive on pure black — which is why they composite with `screen`
 *  onto the onyx band instead of needing cut-outs.
 *
 *  The COPY is the shipped hero's, verbatim (LandingHero). This band is a rebuild
 *  of the visual and motion layer, not a re-pitch of the product: changing the
 *  claim and the craft in one diff would make the comparison at /lp unreadable. */
import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight, Sparkles } from "@/components/icons";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import MonolithLight from "./MonolithLight";

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

export default async function MonolithHero() {
  const t = await getT(T);
  const locale = await getServerLocale();

  return (
    <section className="relative isolate overflow-hidden border-b border-onyx-line bg-onyx text-onyx-ink">
      <MonolithLight>
        <div className="absolute inset-0 -z-10" aria-hidden>
          {/* PLANE 1 — the deepest. Barely moves, so it reads as distance. */}
          <div className="mono-plane mono-plane-far absolute inset-0">
            <Image src="/brand/monolith/hero-far.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
          </div>

          {/* PLANE 2 — the monument, and the light that tracks the pointer. The
              glow sits BEHIND the mass and travels four times as far as it does.
              Neither element may wear a Tailwind transform utility: globals.css
              owns their whole transform, unlayered, and would silently drop it.

              On a phone the entire column is text, so a centred 1:1 monument
              renders as a faint smudge behind the headline. It is pushed off the
              right edge instead, oversized and dimmed — a fragment of the
              monument rather than a small picture of one. */}
          <div className="mono-plane mono-plane-mid absolute inset-y-0 -right-[28%] w-[120%] opacity-70 sm:right-0 sm:w-[58%] sm:opacity-100 lg:w-[48%]">
            <div className="mono-glow absolute left-[42%] top-1/2 h-[62%] w-[62%] rounded-full bg-brand-500/40 blur-[80px]" />
            <div className="mono-mass absolute inset-0">
              <Image
                src="/brand/monolith/hero-mass.jpg"
                alt=""
                fill
                priority
                sizes="(max-width: 640px) 100vw, 55vw"
                className="object-contain object-center mix-blend-screen"
              />
            </div>
          </div>

          {/* PLANE 3 — haze the reader looks THROUGH. Moves most, states least. */}
          <div className="mono-plane mono-plane-near absolute inset-0 opacity-30">
            <Image src="/brand/monolith/hero-veil.jpg" alt="" fill sizes="100vw" className="object-cover mix-blend-screen" />
          </div>

          {/* Scrims last: keep the headline side readable, settle the edges into
              the page. Two stops, not a wash — DESIGN.md's anti-reference. */}
          <div className="absolute inset-0 bg-gradient-to-r from-onyx via-onyx/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-onyx/90 via-transparent to-onyx/40" />
        </div>

        <Container className="relative py-20 lg:py-28">
          <div className="stagger w-full lg:w-[64%]">
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

            <span className="mt-8 inline-flex items-center gap-2 rounded-pill border border-onyx-line bg-onyx-soft/60 px-3 py-1.5 text-xs font-semibold text-brand-300">
              <Sparkles width={13} height={13} />
              {t("heroEyebrow")}
            </span>

            <h1 className="mt-5 text-4xl font-semibold leading-[1.03] tracking-tight text-white sm:text-6xl lg:text-7xl">
              {t("heroTitle1")}
              <br />
              <span className="text-brand-300">{t("heroTitle2")}</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-onyx-muted">{t("heroSubhead")}</p>

            <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 shadow-card transition-colors hover:bg-brand-400"
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

            <ul className="mt-7 max-w-lg space-y-1.5 text-sm leading-relaxed text-onyx-muted">
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
      </MonolithLight>
    </section>
  );
}
