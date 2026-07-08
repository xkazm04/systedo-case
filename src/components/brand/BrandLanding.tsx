import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight, Sparkles } from "@/components/icons";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { localizedNavItems } from "@/lib/nav";
import Crossroad from "@/components/brand/crossroad/Crossroad";
import { CROSSROAD_HREFS, type CrossroadItem } from "@/components/brand/crossroad/meta";

/* ---------------------------------------------------------------------------
   Adamant — homepage (Monolith direction)
   The chosen brand direction: an unbreakable obsidian monument. The hero uses
   the wide monolith key visual as a full-bleed background decoration, faded so
   the headline stays legible. Below, the real product surfaces. The site-wide
   subtle facet pattern lives on <main> (see globals.css .bg-facets).
--------------------------------------------------------------------------- */

// Honest support levels: Google Ads is the only live-data connector; Sklik gets
// ad-copy limit checks; Meta/TikTok are social publishing surfaces. The landing
// states each level rather than implying live ingestion from all four.
const CHANNELS: { name: string; level: { cs: string; en: string } }[] = [
  { name: "Google Ads", level: { cs: "živý sync", en: "live sync" } },
  { name: "Sklik", level: { cs: "kontrola inzerátů", en: "ad-copy checks" } },
  { name: "Meta", level: { cs: "publikování", en: "publishing" } },
  { name: "TikTok", level: { cs: "publikování", en: "publishing" } },
];

const T = {
  cs: {
    proofRoas: "ROAS portfolia",
    proofPno: "PNO · cíl {goal}",
    proofRevenue: "obrat připsaný marketingu",
    proofRevenueDelta: "obrat vs. předchozí období",
    heroTagline: "AI inteligence pro reklamu",
    heroEyebrow: "Vzácný druh v adtech",
    heroTitle1: "Stůjte pevně.",
    heroTitle2: "Reklamy, které nepovolí.",
    heroSubhead:
      "AI inteligence pro reklamu pro e-shopy a agentury — měřte výkon, třiďte kampaně a generujte reklamy, opřené o vaše živá data z Google Ads.",
    heroSeeItWork: "Podívejte se, jak to funguje",
    heroStartFree: "Začít zdarma",
    heroWorksAcross: "Funguje napříč",
    proofLabel: "Důkaz",
    proofHeadline: "Na case-study účtu, posledních 90 dní",
    proofNote: "Stejná čísla, jaká dashboard vykresluje pro {client} ({domain}) — výsledky, ne sliby. Ilustrativní case-study data.",
    closingTitle: "Buďte ve své reklamě neoblomní.",
  },
  en: {
    proofRoas: "Portfolio ROAS",
    proofPno: "PNO · target {goal}",
    proofRevenue: "revenue attributed to marketing",
    proofRevenueDelta: "revenue vs. prior period",
    heroTagline: "AI ad intelligence",
    heroEyebrow: "A rare breed in adtech",
    heroTitle1: "Stand adamant.",
    heroTitle2: "Ads that never crack.",
    heroSubhead:
      "AI ad intelligence for e-shops and agencies — measure performance, triage campaigns and generate the ads, grounded in your live Google Ads data.",
    heroSeeItWork: "See it work",
    heroStartFree: "Start free",
    heroWorksAcross: "Works across",
    proofLabel: "Proof",
    proofHeadline: "On the case-study account, last 90 days",
    proofNote: "The same numbers the dashboard renders for {client} ({domain}) — outcomes, not claims. Illustrative case-study data.",
    closingTitle: "Be adamant about your ads.",
  },
} as const;

export default async function BrandLanding() {
  const t = await getT(T);
  const locale = await getServerLocale();

  // The four case-study destinations that used to live in the header nav, now
  // surfaced as the homepage crossroad. Localized labels/blurbs come from the
  // shared nav model, filtered + ordered to the crossroad set; each card's icon
  // and illustration join on the client (see crossroad/meta).
  const crossroad: CrossroadItem[] = localizedNavItems(locale).filter((i) =>
    (CROSSROAD_HREFS as readonly string[]).includes(i.href)
  );

  // Quantified case-study results for the proof band — the exact numbers the
  // dashboard renders (illustrative data), so the homepage shows outcomes, not
  // just claims. Honest framing: it's the case-study account, not a customer
  // testimonial (there are no real customers to quote).
  const snap = buildSnapshot("90d");
  const proof = [
    { value: fmtMultiple(snap.current.roas), label: t("proofRoas") },
    { value: fmtPct(snap.current.pno), label: t("proofPno", { goal: fmtPct(snap.goalPno, 0) }) },
    { value: fmtCZKCompact(snap.current.revenue), label: t("proofRevenue") },
    { value: fmtSignedPct(snap.delta.revenue), label: t("proofRevenueDelta") },
  ];

  return (
    <>
      {/* ------------------------------------------------------------- Hero */}
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

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* Primary = the frictionless, no-login look (a prospect wants to see it
                  before signing in); "Start free" → the app is the secondary action. */}
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 shadow-card transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99]"
              >
                {t("heroSeeItWork")}
                <ArrowRight width={17} height={17} />
              </Link>
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-pill border border-onyx-line bg-onyx-soft/40 px-5 py-3 text-sm font-semibold text-onyx-ink transition-colors hover:border-brand-400 hover:text-brand-200"
              >
                {t("heroStartFree")}
              </Link>
            </div>

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

      {/* -------------------------------------- Crossroad (nav destinations) */}
      <Crossroad items={crossroad} />

      {/* ----------------------------------------------------------- Proof */}
      <section className="border-y border-line bg-brand-50/40">
        <Container className="py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-accent">
                {t("proofLabel")}
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
                {t("proofHeadline")}
              </h2>
            </div>
            <p className="max-w-md text-sm text-muted">
              {t("proofNote", { client: snap.client.name, domain: snap.client.domain })}
            </p>
          </div>
          <dl className="mt-9 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {proof.map((p) => (
              <div key={p.label}>
                <dt className="tnum text-3xl font-semibold tracking-tight text-brand-accent sm:text-4xl">
                  {p.value}
                </dt>
                <dd className="mt-1.5 text-sm text-muted">{p.label}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* ------------------------------------------------------- Closing CTA */}
      <section className="border-t border-onyx-line bg-onyx">
        <Container className="py-14">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="max-w-xl text-2xl font-semibold leading-snug tracking-tight text-white">
              {t("closingTitle")}
            </h2>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
            >
              {t("heroSeeItWork")}
              <ArrowRight width={17} height={17} />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
