import Image from "next/image";
import Link from "next/link";
import { Container, Pill } from "@/components/ui";
import { ArrowRight, Check, TrendUp, TrendDown } from "@/components/icons";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact, fmtCZK } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import { localizedNavItems } from "@/lib/nav";
import { PLAN_INFO } from "@/lib/plans";
import { CROSSROAD_HREFS } from "@/components/brand/crossroad/meta";

/* ---------------------------------------------------------------------------
   Adamant — landing VARIANT C: "distilled".

   Hypothesis under test: the incumbent homepage is over-built and under-argued.
   One claim, carried properly, beats four doors.

   REMOVED (nothing here earned its place):
     • the hero brand lockup — the sticky header already renders the identical
       logo + wordmark + tagline ~40px above it;
     • the `<Sparkles/> Vzácný druh v adtech` eyebrow pill — the page's only
       unquantified claim, in a voice PRODUCT.md defines as always quantified;
     • both kicker-above-heading labels ("Pracovní prostor", "Důkaz");
     • the four 48px crossroad PNG chips — four network requests that render as
       indistinguishable dark texture under a 20px icon in both themes;
     • the crossroad's assignment-brief blurbs ("Bonus:", "SQLite", "na Gemini");
     • the verbatim repeat of the hero CTA in the closing CTA.

   The room that bought is spent on the layer the incumbent has no trace of:
   what the product does (the measure → triage → generate loop), how the four
   channels differ, and what it costs. Distillation here means removing what
   does not argue so what remains can argue more.
--------------------------------------------------------------------------- */

/** Honest, tiered channel support (PRODUCT.md hard constraint): Google Ads is
 *  the only live-data connector; Sklik gets ad-copy limit checks; Meta/TikTok
 *  are publishing surfaces. Each level is stated, never implied at parity. */
const CHANNELS = [
  { name: "Google Ads", levelKey: "lvlLive", noteKey: "noteGoogle" },
  { name: "Sklik", levelKey: "lvlCopy", noteKey: "noteSklik" },
  { name: "Meta", levelKey: "lvlPublish", noteKey: "noteMeta" },
  { name: "TikTok", levelKey: "lvlPublish", noteKey: "noteTiktok" },
] as const;

const T = {
  cs: {
    // hero
    heroTitle1: "Stůjte pevně.",
    heroTitle2: "Reklamy, které nepovolí.",
    heroSubhead:
      "Adamant čte vaše živá data z Google Ads, řekne vám, co znamenají, a ze stejných čísel rovnou napíše inzeráty, články a posty. Jeden pracovní prostor místo dashboardu, tabulky a chatovacího okna.",
    heroPrimary: "Podívejte se, jak to funguje",
    heroSecondary: "Začít zdarma",
    heroHint: "Bez registrace — otevře se dashboard s ukázkovým účtem.",

    // loop
    loopHeading: "Měřit, třídit, tvořit. V jednom okruhu.",
    loopIntro:
      "Generování je u nás až třetí krok, ne první. Čte přesně ta data, která zapsalo měření: váš výkon, váš katalog, váš naučený tón hlasu.",
    step1: "Měření",
    step1Body:
      "Konektor Google Ads si data tahá sám, po hodinách. Dashboard z nich počítá PNO, ROAS a obrat proti cíli. Bez ručního exportu a bez tabulky vedle.",
    step2: "Třídění",
    step2Body:
      "Kampaně se seřadí podle toho, kde utíká rozpočet. Anomálie i setrvalé týdenní propady dostanete pojmenované větou, ne jako graf k luštění.",
    step3: "Tvorba",
    step3Body:
      "Inzeráty, články, sociální posty i vizuály vznikají nad stejnými čísly. Odejdete s něčím publikovatelným, ne s dalším grafem.",
    loopClaim:
      "Rozdíl je v tom pořadí. Generátor, který vaše data nevidí, je jiný a slabší produkt.",

    // channels
    chHeading: "O každém kanálu říkáme, kam až sahá",
    chIntro:
      "Podpora kanálů je stupňovaná. Píšeme to sem, protože jinak se to pozná až po připojení účtu, a to je pozdě.",
    lvlLive: "živý sync",
    lvlCopy: "kontrola inzerátů",
    lvlPublish: "publikování",
    noteGoogle: "Připojený účet, hodinová synchronizace, všechna čísla v dashboardu i v generování.",
    noteSklik: "Kontrola limitů a délek textů u inzerátů. Živý sync dat zatím ne.",
    noteMeta: "Plánování a publikování příspěvků. Měření výkonu ne.",
    noteTiktok: "Plánování a publikování příspěvků. Měření výkonu ne.",
    chClaim:
      "Sklik u nás stojí vedle Google Ads jako plnohodnotný kanál, což západní adtech obvykle nedělá.",

    // proof
    proofHeading: "Čísla, která dashboard skutečně vykresluje",
    proofNote:
      "Posledních 90 dní na case-study účtu — e-shop {client} ({domain}). Ilustrativní data případové studie, ne výsledky zákazníka.",
    groupPerf: "Výkon portfolia",
    groupImpact: "Dopad na obrat",
    proofRoas: "ROAS portfolia",
    proofPno: "PNO za období",
    proofPnoGoal: "cíl {goal}",
    proofPnoUnder: "pod cílem",
    proofPnoOver: "nad cílem",
    proofRevenue: "obrat připsaný marketingu",
    proofRevenueDelta: "proti předchozím 90 dnům",

    // price
    priceHeading: "Cena, než se na ni zeptáte",
    priceFree: "Zdarma",
    pricePerMonth: "/ měsíc",
    priceAll: "Celý ceník",
    priceNote:
      "Případová studie: platební brána není napojená, upgrade je tenká vrstva nad polem plánu.",

    // destinations
    destHeading: "Nebo se rovnou podívejte dovnitř",
    destDashboard: "Výkon klienta po metrikách a kanálech, s anomáliemi a projekcí do konce měsíce.",
    destClanek: "Publikovaný článek pro mionelo.cz — struktura, prolinkování, připravený k nasazení.",
    destAsistent: "Tři nástroje nad živými daty: PPC inzeráty, obsahový brief a analýza výkonu.",
    destKampane: "Přehled kampaní z Google Ads, srovnání podle typů a AI vyhodnocení každé z nich.",

    // closing
    closeTitle: "Buďte ve své reklamě neoblomní.",
    closeBody:
      "Připojte účet Google Ads a první vyhodnocení máte za pár minut. Zdarma, bez platební karty.",
    closePrimary: "Založit účet zdarma",
    closeSecondary: "Nejdřív si projít dashboard",
  },
  en: {
    heroTitle1: "Stand adamant.",
    heroTitle2: "Ads that never crack.",
    heroSubhead:
      "Adamant reads your live Google Ads data, tells you what it means, and writes the ads, articles and posts straight off those same numbers. One workspace instead of a dashboard, a spreadsheet and a chat window.",
    heroPrimary: "See it work",
    heroSecondary: "Start free",
    heroHint: "No sign-up — it opens the dashboard on a sample account.",

    loopHeading: "Measure, triage, generate. One loop.",
    loopIntro:
      "Generation is the third step here, not the first. It reads exactly the data the measurement step wrote: your performance, your catalog, your captured brand voice.",
    step1: "Measure",
    step1Body:
      "The Google Ads connector pulls on its own, hourly. The dashboard turns that into PNO, ROAS and revenue against target. No manual export, no spreadsheet on the side.",
    step2: "Triage",
    step2Body:
      "Campaigns sort by where the budget is leaking. Anomalies and sustained weekly drifts arrive named in a sentence, not as a chart to decode.",
    step3: "Generate",
    step3Body:
      "Ads, articles, social posts and creative images are built on those same numbers. You leave with something publishable, not another chart.",
    loopClaim:
      "The order is the difference. A generator that cannot see your data is a different, lesser product.",

    chHeading: "We say how far each channel goes",
    chIntro:
      "Channel support is tiered. We state it here, because otherwise you find out after connecting an account, and that is too late.",
    lvlLive: "live sync",
    lvlCopy: "ad-copy checks",
    lvlPublish: "publishing",
    noteGoogle: "Connected account, hourly sync, every number in the dashboard and in generation.",
    noteSklik: "Character and limit checks on ad copy. No live data sync yet.",
    noteMeta: "Scheduling and publishing posts. No performance measurement.",
    noteTiktok: "Scheduling and publishing posts. No performance measurement.",
    chClaim:
      "Sklik sits beside Google Ads as a first-class channel here, which western adtech generally does not do.",

    proofHeading: "The numbers the dashboard actually renders",
    proofNote:
      "Last 90 days on the case-study account — the e-shop {client} ({domain}). Illustrative case-study data, not customer results.",
    groupPerf: "Portfolio performance",
    groupImpact: "Revenue impact",
    proofRoas: "portfolio ROAS",
    proofPno: "PNO for the period",
    proofPnoGoal: "target {goal}",
    proofPnoUnder: "under target",
    proofPnoOver: "over target",
    proofRevenue: "revenue attributed to marketing",
    proofRevenueDelta: "against the prior 90 days",

    priceHeading: "The price, before you have to ask",
    priceFree: "Free",
    pricePerMonth: "/ month",
    priceAll: "Full pricing",
    priceNote:
      "Case study: no payment gateway is wired up — upgrading is a thin layer over the plan field.",

    destHeading: "Or look inside right away",
    destDashboard: "Client performance by metric and channel, with anomalies and an end-of-month projection.",
    destClanek: "A published article for mionelo.cz — structure, internal links, ready to ship.",
    destAsistent: "Three tools over live data: PPC ad copy, a content brief and a performance read.",
    destKampane: "Google Ads campaigns, compared by type, each with an AI verdict.",

    closeTitle: "Be adamant about your ads.",
    closeBody:
      "Connect a Google Ads account and the first read lands within minutes. Free, no card.",
    closePrimary: "Create a free account",
    closeSecondary: "Walk the dashboard first",
  },
} as const;

/** Localized blurbs authored for the landing page. The nav model's own blurbs are
 *  assignment-brief language ("Bonus:", "SQLite", "Tři marketingové nástroje na
 *  Gemini") — correct for an internal directory, wrong in customer-facing copy. */
const DEST_BLURB_KEY = {
  "/dashboard": "destDashboard",
  "/clanek": "destClanek",
  "/ai-asistent": "destAsistent",
  "/kampane": "destKampane",
} as const;

export default async function LandingDistilled() {
  const t = await getT(T);
  const locale = await getServerLocale();

  // Labels stay single-sourced from the nav model (so a rename can't drift);
  // order is single-sourced from CROSSROAD_HREFS; blurbs are authored above.
  const navByHref = new Map(localizedNavItems(locale).map((i) => [i.href, i]));
  const destinations = CROSSROAD_HREFS.map((href) => ({
    href,
    label: navByHref.get(href)?.label ?? href,
    blurb: t(DEST_BLURB_KEY[href]),
  }));

  // The real snapshot the dashboard computes — never hardcoded figures.
  const snap = buildSnapshot("90d");
  const pnoBeatsGoal = snap.current.pno < snap.goalPno; // lower PNO is better
  const revenueUp = snap.delta.revenue >= 0;
  const RevenueTrend = revenueUp ? TrendUp : TrendDown;

  const plans = PLAN_INFO.map((p) => ({
    id: p.id,
    name: p.name,
    price: p.priceCzk === 0 ? t("priceFree") : fmtCZK(p.priceCzk),
    suffix: p.priceCzk === 0 ? "" : t("pricePerMonth"),
  }));

  return (
    <>
      {/* ------------------------------------------------------------- Hero
          One claim, no lockup, no eyebrow pill. The header 40px above already
          carries the logo, the wordmark and the tagline. */}
      <section className="relative isolate overflow-hidden border-b border-onyx-line bg-onyx text-onyx-ink">
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

        <Container className="relative py-20 lg:py-32">
          {/* The one authored entrance on the page. */}
          <div className="animate-fade-up w-full lg:w-[68%]">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {t("heroTitle1")}
              <br />
              <span className="text-brand-300">{t("heroTitle2")}</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-onyx-muted">{t("heroSubhead")}</p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 shadow-card transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99]"
              >
                {t("heroPrimary")}
                <ArrowRight width={17} height={17} aria-hidden />
              </Link>
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-pill border border-onyx-line bg-onyx-soft/40 px-5 py-3 text-sm font-semibold text-onyx-ink transition-colors hover:border-brand-400 hover:text-brand-200"
              >
                {t("heroSecondary")}
              </Link>
            </div>

            <p className="mt-4 text-sm text-onyx-muted">{t("heroHint")}</p>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------- What it does (loop)
          The layer the incumbent page has none of: no what, no how, no
          differentiation. Three steps in the order that IS the positioning. */}
      <section className="border-b border-line">
        <Container className="py-20 sm:py-24">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
            {t("loopHeading")}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">{t("loopIntro")}</p>

          <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-3">
            {[
              { title: t("step1"), body: t("step1Body") },
              { title: t("step2"), body: t("step2Body") },
              { title: t("step3"), body: t("step3Body") },
            ].map((step) => (
              <li key={step.title}>
                {/* The step rule is an element, not a border: globals.css sets
                    `* { border-color: var(--color-line) }` UNLAYERED, which beats
                    Tailwind's layered `border-brand-500` utility — a border here
                    would silently render as a hairline. */}
                <span className="block h-0.5 w-full rounded-pill bg-brand-500" aria-hidden />
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-navy-800">{step.title}</h3>
                <p className="mt-2.5 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>

          <p className="mt-14 max-w-2xl text-xl font-medium leading-relaxed tracking-tight text-navy-800">
            {t("loopClaim")}
          </p>
        </Container>
      </section>

      {/* ------------------------------------------------------- Channel tiers
          A tonal step (surface over canvas) so the honesty band reads as its own
          material rather than another stripe of the same page. */}
      <section className="border-b border-line bg-surface">
        <Container className="py-16 sm:py-20">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <h2 className="max-w-lg text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              {t("chHeading")}
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted">{t("chIntro")}</p>
          </div>

          <dl className="mt-10 divide-y divide-line border-y border-line">
            {CHANNELS.map((c) => (
              <div
                key={c.name}
                className="flex flex-col gap-1.5 py-4 sm:flex-row sm:items-baseline sm:gap-6 sm:py-5"
              >
                <dt className="flex shrink-0 items-center gap-3 sm:w-64">
                  <span className="text-base font-semibold text-navy-800">{c.name}</span>
                  <Pill tone="brand">{t(c.levelKey)}</Pill>
                </dt>
                <dd className="min-w-0 text-sm leading-relaxed text-muted">{t(c.noteKey)}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-8 max-w-2xl text-sm leading-relaxed text-navy-700">{t("chClaim")}</p>
        </Container>
      </section>

      {/* ------------------------------------------------------------- Proof
          Four figures, three kinds of number. LEVELS (a multiple, an absolute)
          are set large; RELATIONAL figures (against a target, against a prior
          period) are set one step down and carry their comparator inline, so the
          reader is never asked to infer that 14,2 % is measured against 15 %.
          Direction is carried by a word + a glyph, never by color alone. */}
      <section className="border-b border-line bg-brand-50/40">
        <Container className="py-16 sm:py-20">
          <h2 className="max-w-xl text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
            {t("proofHeading")}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
            {t("proofNote", { client: snap.client.name, domain: snap.client.domain })}
          </p>

          <div className="mt-12 grid gap-x-12 gap-y-12 sm:grid-cols-2">
            {/* group 1 — performance */}
            <div>
              <p className="text-sm font-medium text-navy-700">{t("groupPerf")}</p>
              <dl className="mt-5 flex flex-wrap items-end gap-x-12 gap-y-7">
                <div>
                  <dt className="tnum text-4xl font-semibold tracking-tight text-brand-accent sm:text-5xl">
                    {fmtMultiple(snap.current.roas)}
                  </dt>
                  <dd className="mt-2 text-sm text-muted">{t("proofRoas")}</dd>
                </div>
                <div>
                  <dt className="flex flex-wrap items-baseline gap-x-2.5">
                    <span className="tnum text-3xl font-semibold tracking-tight text-navy-800">
                      {fmtPct(snap.current.pno)}
                    </span>
                    <span className="tnum text-sm font-medium text-muted">
                      {t("proofPnoGoal", { goal: fmtPct(snap.goalPno, 0) })}
                    </span>
                  </dt>
                  <dd className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                    <span>{t("proofPno")}</span>
                    <span className="inline-flex items-center gap-1 font-medium text-navy-700">
                      {pnoBeatsGoal ? (
                        <Check width={14} height={14} className="text-positive" aria-hidden />
                      ) : (
                        <TrendUp width={14} height={14} className="text-negative" aria-hidden />
                      )}
                      {pnoBeatsGoal ? t("proofPnoUnder") : t("proofPnoOver")}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            {/* group 2 — impact */}
            <div>
              <p className="text-sm font-medium text-navy-700">{t("groupImpact")}</p>
              <dl className="mt-5 flex flex-wrap items-end gap-x-12 gap-y-7">
                <div>
                  <dt className="tnum text-4xl font-semibold tracking-tight text-brand-accent sm:text-5xl">
                    {fmtCZKCompact(snap.current.revenue)}
                  </dt>
                  <dd className="mt-2 text-sm text-muted">{t("proofRevenue")}</dd>
                </div>
                <div>
                  <dt
                    className={`flex items-center gap-2 text-3xl font-semibold tracking-tight ${
                      revenueUp ? "text-positive" : "text-negative"
                    }`}
                  >
                    <RevenueTrend width={22} height={22} aria-hidden />
                    <span className="tnum">{fmtSignedPct(snap.delta.revenue)}</span>
                  </dt>
                  <dd className="mt-2 text-sm text-muted">{t("proofRevenueDelta")}</dd>
                </div>
              </dl>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------- Price + destinations
          Price was reachable only through a 7-link footer. It is one line here. */}
      <section className="border-b border-line">
        <Container className="py-16 sm:py-20">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              {t("priceHeading")}
            </h2>
            <Link
              href="/cena"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent hover:underline"
            >
              {t("priceAll")}
              <ArrowRight width={15} height={15} aria-hidden />
            </Link>
          </div>

          <dl className="mt-8 flex flex-wrap gap-x-12 gap-y-5">
            {plans.map((p) => (
              <div key={p.id} className="flex items-baseline gap-2">
                <dt className="text-base font-semibold text-navy-800">{p.name}</dt>
                <dd className="tnum text-base text-muted">
                  {p.price}
                  {p.suffix ? <span className="text-sm"> {p.suffix}</span> : null}
                </dd>
              </div>
            ))}
          </dl>

          <p className="mt-5 max-w-2xl text-sm text-muted">{t("priceNote")}</p>

          <h3 className="mt-16 text-lg font-semibold tracking-tight text-navy-800">
            {t("destHeading")}
          </h3>
          <ul className="mt-5 divide-y divide-line border-y border-line">
            {destinations.map((d) => (
              <li key={d.href}>
                <Link
                  href={d.href}
                  className="group flex items-center gap-4 py-4 transition-colors hover:text-brand-accent sm:gap-6"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-navy-800 group-hover:text-brand-accent">
                      {d.label}
                    </span>
                    {/* line-clamp, never truncate: at 390px a single-line truncate
                        showed 15–43% of the sentence. */}
                    <span className="mt-1 line-clamp-2 block text-sm leading-relaxed text-muted">
                      {d.blurb}
                    </span>
                  </span>
                  <ArrowRight
                    width={18}
                    height={18}
                    aria-hidden
                    className="shrink-0 text-muted transition-[color,transform] group-hover:translate-x-1 group-hover:text-brand-accent"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* ------------------------------------------------------- Closing CTA
          A different ask than the hero: the hero sends you to look, this one
          asks for the account, and says what happens after you click.

          `-mb-24` is the page's terminus fix: the site footer carries a `mt-24`,
          which left a 96px empty canvas band between the closing CTA and the
          footer — the page ended in nothing. Cancelling it here (inside this
          variant only, since the footer is shared chrome) lets the onyx CTA and
          the onyx footer meet as one closing mass. */}
      <section className="-mb-24 border-t border-onyx-line bg-onyx">
        <Container className="py-20 sm:py-24">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                {t("closeTitle")}
              </h2>
              <p className="mt-4 text-base leading-relaxed text-onyx-muted">{t("closeBody")}</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
              >
                {t("closePrimary")}
                <ArrowRight width={17} height={17} aria-hidden />
              </Link>
              <Link
                href="/dashboard"
                className="text-sm font-semibold text-onyx-ink underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200 hover:decoration-brand-400"
              >
                {t("closeSecondary")}
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
