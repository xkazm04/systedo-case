import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/ui";
import { ArrowRight, Check, TrendUp, TrendDown } from "@/components/icons";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact, fmtCZKCompactA11y, fmtDecimal } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { localizedNavItems } from "@/lib/nav";
import { CROSSROAD_HREFS, CROSSROAD_META } from "@/components/brand/crossroad/meta";

/* ---------------------------------------------------------------------------
   Adamant — landing VARIANT A ("bolder" + "typeset"), served at /lp/bolder.

   Same brand, same facts, more conviction. Three deliberate moves:

   1. THE MONUMENT RUNS PAST THE FOLD. The incumbent drops out of the Monolith
      world at the hero's lower edge into a default light SaaS page. Here the
      onyx mass continues into the proof ledger (a tonal step to `onyx-soft`,
      not a cut), the crossroad carries an onyx header band so it reads as one
      carved object, and the closing block returns to `onyx`. Dark → light
      instrument panel → dark: a rhythm, not an abandonment.

   2. TWO FAMILIES, ONE RULE: SANS SPEAKS, MONO MEASURES. Geist Mono is already
      loaded in layout.tsx and bound to --font-mono, and DESIGN.md sanctions it
      for "spec labels" and literal values — but the incumbent page never uses
      it. Every computed figure, every channel support level, and the crossroad
      ordinals are set in mono with `tnum`; all prose and headings stay Geist
      Sans. The hierarchy is carried by family + tracking + color, not by size.

   3. THE FOUR PROOF FIGURES ARE FOUR DIFFERENT KINDS OF NUMBER, so they are
      typeset as four different kinds of number: a multiple, a ratio measured
      against a target, an absolute volume, and a signed change. Each column
      declares its kind in a mono spec label; the PNO carries the derived
      distance from its goal (it is BEATING it, which nothing marked before);
      the delta is the only figure allowed a semantic color, at display size so
      the ≥3:1 large-text floor applies.

   Removed on purpose: the `<Sparkles/> Vzácný druh v adtech` pill (the page's
   only unquantified claim, and sparkles-means-AI is the category's most tired
   signifier), the duplicated brand lockup 40px under the identical one in the
   sticky header, both kicker-above-heading pairs, and the verbatim repeat of
   the hero CTA at the foot of the page.
--------------------------------------------------------------------------- */

/** Honest support levels — Google Ads is the only live-data connector; Sklik
 *  gets ad-copy limit checks; Meta/TikTok are publishing surfaces. `live` marks
 *  the one tier that gets the brand color, so the strip states the hierarchy
 *  visually as well as in words instead of implying parity. */
const CHANNELS: { name: string; live?: boolean; level: { cs: string; en: string } }[] = [
  { name: "Google Ads", live: true, level: { cs: "živá synchronizace", en: "live sync" } },
  { name: "Sklik", level: { cs: "kontrola inzerátů", en: "ad-copy checks" } },
  { name: "Meta", level: { cs: "publikování", en: "publishing" } },
  { name: "TikTok", level: { cs: "publikování", en: "publishing" } },
];

const T = {
  cs: {
    heroTitle1: "Stůjte pevně.",
    heroTitle2: "Reklamy, které nepovolí.",
    heroSubhead:
      "AI pro digitální reklamu e-shopů a agentur: měřte výkon, třiďte kampaně a generujte reklamy, opřené o vaše živá data z Google Ads.",
    heroSeeItWork: "Podívejte se, jak to funguje",
    heroStartFree: "Začít zdarma",
    channelsLabel: "Kanály a úroveň podpory",
    channelsNote: "Úroveň uvádíme u každého kanálu zvlášť. Živou synchronizaci má zatím jen Google Ads.",

    proofHeadline: "Důkaz: case-study účet, posledních 90 dní",
    proofNote:
      "Stejná čísla, jaká dashboard vykresluje pro {client} ({domain}). Výsledky, ne sliby. Ilustrativní case-study data.",
    kindMultiple: "násobek",
    kindRatio: "poměr",
    kindVolume: "objem",
    kindChange: "změna",
    proofRoas: "ROAS portfolia",
    proofPno: "PNO portfolia",
    proofPnoUnder: "{gap} p.b. pod cílem {goal}",
    proofPnoOver: "{gap} p.b. nad cílem {goal}",
    proofRevenue: "obrat připsaný marketingu",
    proofRevenueDelta: "obrat vs. předchozí období",

    crossroadHeading: "Vyberte si cíl v pracovním prostoru",
    crossroadNote:
      "Případová studie ve čtyřech zastávkách. Každá je reálná část produktu, opřená o stejná klientská data.",

    closingTitle: "Buďte ve své reklamě neoblomní.",
    closingNote:
      "Živá synchronizace běží zatím jen nad Google Ads. Čísla výše jsou ilustrativní data case-study klienta.",
  },
  en: {
    heroTitle1: "Stand adamant.",
    heroTitle2: "Ads that never crack.",
    heroSubhead:
      "Digital advertising AI for e-shops and agencies: measure performance, triage campaigns and generate the ads, grounded in your live Google Ads data.",
    heroSeeItWork: "See it work",
    heroStartFree: "Start free",
    channelsLabel: "Channels and support level",
    channelsNote: "We state the level per channel. Live sync is Google Ads only, for now.",

    proofHeadline: "Proof: the case-study account, last 90 days",
    proofNote:
      "The same numbers the dashboard renders for {client} ({domain}). Outcomes, not claims. Illustrative case-study data.",
    kindMultiple: "multiple",
    kindRatio: "ratio",
    kindVolume: "volume",
    kindChange: "change",
    proofRoas: "Portfolio ROAS",
    proofPno: "Portfolio PNO",
    proofPnoUnder: "{gap} pp under target {goal}",
    proofPnoOver: "{gap} pp over target {goal}",
    proofRevenue: "revenue attributed to marketing",
    proofRevenueDelta: "revenue vs. prior period",

    crossroadHeading: "Pick a destination in the workspace",
    crossroadNote:
      "The case study in four stops. Each is a real product surface, grounded in the same client data.",

    closingTitle: "Be adamant about your ads.",
    closingNote:
      "Live sync runs on Google Ads only, for now. The figures above are illustrative case-study data.",
  },
} as const;

/** The mono spec label: uppercase, tracked, the one role that never carries
 *  prose. Used for the ledger column kinds and the channel support levels. */
const SPEC = "font-mono text-xs uppercase tracking-[0.14em]";

export default async function LandingBolder() {
  const t = await getT(T);
  const locale = await getServerLocale();

  const navByHref = new Map(localizedNavItems(locale).map((i) => [i.href, i]));
  const crossroad = CROSSROAD_HREFS.map((href) => navByHref.get(href)).filter((i) => i != null);

  const snap = buildSnapshot("90d");
  const revenue = fmtCZKCompactA11y(snap.current.revenue);
  const pnoUnderGoal = snap.current.pno <= snap.goalPno;
  // Derived from the same real figures the dashboard renders: how far the
  // period's PNO sits from its goal, in percentage points.
  const pnoGap = fmtDecimal(Math.abs(snap.goalPno - snap.current.pno) * 100, 1);
  const revenueUp = snap.delta.revenue >= 0;
  const DeltaIcon = revenueUp ? TrendUp : TrendDown;

  return (
    <>
      {/* ------------------------------------------------------------- Hero */}
      <section className="relative isolate overflow-hidden bg-onyx text-onyx-ink">
        <div className="absolute inset-0 -z-10" aria-hidden>
          <Image
            src="/brand/hero-monolith.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[right_center]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-onyx via-onyx/85 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-onyx via-onyx/10 to-onyx/30" />
        </div>

        <Container className="relative py-20 lg:py-28">
          {/* `stagger` is the page's one authored motion moment (globals.css):
              each direct child eases up in sequence, neutralised wholesale by
              the global reduced-motion block. No other section animates. */}
          <div className="stagger w-full lg:w-[72%]">
            {/* No brand lockup here: the sticky header already carries the
                identical logo + wordmark ~40px above this point. The page opens
                on the headline, which is the only thing worth repeating. */}
            <h1 className="max-w-[16ch] text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.03em] text-balance text-white sm:text-6xl lg:text-7xl">
              {t("heroTitle1")}
              <br />
              <span className="text-brand-300">{t("heroTitle2")}</span>
            </h1>

            <p className="mt-6 max-w-[54ch] text-lg leading-relaxed text-onyx-muted">
              {t("heroSubhead")}
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
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

            {/* The support strip replaces the incumbent's row of identical
                pills, which flattened four different levels of support into one
                shape. Name in sans, level in mono — and only the live connector
                gets the brand color, so the tiering is legible before it is
                read. */}
            <div className="mt-12 border-t border-onyx-line pt-5">
              <p className={`${SPEC} text-onyx-muted`}>{t("channelsLabel")}</p>
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
                {CHANNELS.map((c) => (
                  <li key={c.name}>
                    <span className="block text-base font-semibold leading-tight text-onyx-ink">
                      {c.name}
                    </span>
                    <span
                      className={`mt-1.5 block ${SPEC} ${c.live ? "text-brand-300" : "text-onyx-muted"}`}
                    >
                      {c.level[locale] ?? c.level.en}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-5 max-w-[58ch] text-sm leading-relaxed text-onyx-muted">
                {t("channelsNote")}
              </p>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------ Proof */}
      {/* A tonal step inside the same monument rather than a cut to a light
          band — the proof reads as the base the hero stands on. */}
      <section className="border-y border-onyx-line bg-onyx-soft text-onyx-ink">
        <Container className="py-14 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            {/* The incumbent's "Důkaz" eyebrow is folded into the heading. */}
            <h2 className="max-w-[22ch] text-2xl font-semibold tracking-tight text-balance text-white sm:text-3xl">
              {t("proofHeadline")}
            </h2>
            <p className="max-w-[46ch] text-sm leading-relaxed text-onyx-muted">
              {t("proofNote", { client: snap.client.name, domain: snap.client.domain })}
            </p>
          </div>

          <dl className="mt-10 grid grid-cols-1 gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1 — a multiple */}
            <div className="border-t border-onyx-line pt-4">
              <dt>
                <span className={`block ${SPEC} text-onyx-muted`}>{t("kindMultiple")}</span>
                <span className="tnum mt-3 block font-mono text-3xl font-medium tracking-tight text-brand-300">
                  {fmtMultiple(snap.current.roas)}
                </span>
              </dt>
              <dd className="mt-2 text-sm leading-snug text-onyx-muted">{t("proofRoas")}</dd>
            </div>

            {/* 2 — a ratio measured against a target: the only figure with a
                   reference value, so it is the only one that gets a second
                   line stating how far it is beating that target. */}
            <div className="border-t border-onyx-line pt-4">
              <dt>
                <span className={`block ${SPEC} text-onyx-muted`}>{t("kindRatio")}</span>
                <span className="tnum mt-3 block font-mono text-3xl font-medium tracking-tight text-white">
                  {fmtPct(snap.current.pno)}
                </span>
              </dt>
              <dd className="mt-2 text-sm leading-snug text-onyx-muted">
                {t("proofPno")}
                <span className="mt-2 flex items-start gap-1.5 text-onyx-ink">
                  {pnoUnderGoal ? (
                    <Check width={15} height={15} className="mt-0.5 shrink-0 text-positive" />
                  ) : (
                    <TrendUp width={15} height={15} className="mt-0.5 shrink-0 text-negative" />
                  )}
                  <span className="tnum font-mono text-xs">
                    {t(pnoUnderGoal ? "proofPnoUnder" : "proofPnoOver", {
                      goal: fmtPct(snap.goalPno, 0),
                      gap: pnoGap,
                    })}
                  </span>
                </span>
              </dd>
            </div>

            {/* 3 — an absolute volume */}
            <div className="border-t border-onyx-line pt-4">
              <dt>
                <span className={`block ${SPEC} text-onyx-muted`}>{t("kindVolume")}</span>
                <span className="tnum mt-3 block font-mono text-3xl font-medium tracking-tight text-white">
                  <span aria-hidden>{revenue.text}</span>
                  <span className="sr-only">{revenue.label}</span>
                </span>
              </dt>
              <dd className="mt-2 text-sm leading-snug text-onyx-muted">{t("proofRevenue")}</dd>
            </div>

            {/* 4 — a signed change: direction is carried by an icon and the
                   word, not by the `+` glyph and a color alone. Semantic color
                   is used only at display size, where the ≥3:1 large-text
                   contrast floor applies on the onyx surface. */}
            <div className="border-t border-onyx-line pt-4">
              <dt>
                <span className={`block ${SPEC} text-onyx-muted`}>{t("kindChange")}</span>
                <span
                  className={`tnum mt-3 flex items-center gap-2 font-mono text-3xl font-medium tracking-tight ${
                    revenueUp ? "text-positive" : "text-negative"
                  }`}
                >
                  <DeltaIcon width={22} height={22} className="shrink-0" aria-hidden />
                  {fmtSignedPct(snap.delta.revenue)}
                </span>
              </dt>
              <dd className="mt-2 text-sm leading-snug text-onyx-muted">{t("proofRevenueDelta")}</dd>
            </div>
          </dl>
        </Container>
      </section>

      {/* -------------------------------------------------------- Crossroad */}
      <Container className="py-16 sm:py-20">
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          {/* The heading lives INSIDE the slab on an onyx band, so the section
              is one carved object instead of a heading floating over a card —
              and the Monolith world keeps running through the light half of
              the page. The incumbent's "Pracovní prostor" eyebrow is folded
              into the heading. */}
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 bg-onyx px-5 py-7 sm:px-7">
            <h2 className="max-w-[20ch] text-2xl font-semibold tracking-tight text-balance text-white sm:text-3xl">
              {t("crossroadHeading")}
            </h2>
            <p className="max-w-[46ch] text-sm leading-relaxed text-onyx-muted">
              {t("crossroadNote")}
            </p>
          </div>

          <ol>
            {crossroad.map((item, i) => {
              const meta = CROSSROAD_META[item.href as keyof typeof CROSSROAD_META];
              if (!meta) return null;
              const Icon = meta.icon;
              return (
                <li key={item.href} className="border-t border-line">
                  <Link
                    href={item.href}
                    className="group flex items-center gap-4 p-4 transition-colors hover:bg-brand-50/60 sm:gap-6 sm:p-5"
                  >
                    {/* Ordinals are real sequence information — the copy calls
                        this a case study "in four stops" — and they are digits,
                        so they take the mono/tabular role like every other
                        figure on the page. */}
                    <span className="tnum hidden shrink-0 font-mono text-sm text-muted sm:block">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-onyx text-brand-300 ring-1 ring-onyx-line">
                      {/* image is optional in CROSSROAD_META */ meta.image && <Image src={meta.image} alt="" fill sizes="48px" className="object-cover opacity-70" />}
                      <Icon width={20} height={20} className="relative" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-navy-800">{item.label}</span>
                      {/* line-clamp, never a single-line truncate: at 390px the
                          incumbent showed 15–43% of each sentence. */}
                      {/* NB: no `block` here — Tailwind's display utility wins
                          the cascade over line-clamp's `display:-webkit-box`
                          and silently disables the clamp. */}
                      <span className="mt-1 line-clamp-2 text-sm leading-snug text-muted">
                        {item.blurb}
                      </span>
                    </span>
                    <ArrowRight
                      width={18}
                      height={18}
                      className="shrink-0 text-muted transition-[color,transform] group-hover:translate-x-1 group-hover:text-brand-accent"
                    />
                  </Link>
                </li>
              );
            })}
          </ol>
        </div>
      </Container>

      {/* ------------------------------------------------------- Closing CTA */}
      {/* Not a repeat of the hero: the pair is inverted, so the page's last
          impression is the commitment (`/app`) rather than the same "see it
          work" link it opened with, and the honest tiering is restated at the
          exact point someone decides. */}
      <section className="border-t border-onyx-line bg-onyx">
        <Container className="py-16">
          <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="max-w-[18ch] text-3xl font-semibold leading-[1.1] tracking-tight text-balance text-white sm:text-4xl">
                {t("closingTitle")}
              </h2>
              <p className="mt-4 max-w-[52ch] text-sm leading-relaxed text-onyx-muted">
                {t("closingNote")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 shadow-card transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99]"
              >
                {t("heroStartFree")}
                <ArrowRight width={17} height={17} />
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-pill border border-onyx-line bg-onyx-soft/40 px-5 py-3 text-sm font-semibold text-onyx-ink transition-colors hover:border-brand-400 hover:text-brand-200"
              >
                {t("heroSeeItWork")}
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
