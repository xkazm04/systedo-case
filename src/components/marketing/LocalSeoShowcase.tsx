"use client";

/** LocalSeoShowcase — the animated marketing surface for the Local SEO project
 *  type (consolidation phase 2). Assembles the ported motion craft: the
 *  interactive rank-climb hero, a signals marquee, and the three hand-rolled SVG
 *  charts revealed on scroll-in. Wrapped in <MotionProvider> so the Kinetics
 *  primitives have their LazyMotion ancestor; everything degrades gracefully
 *  under prefers-reduced-motion. Bilingual via the client i18n (useLocale). */
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ChartReveal, Kinetic, Marquee } from "@/components/motion/Kinetics";
import { RankClimbDemo, type RankClimbLabels } from "@/components/marketing/RankClimbDemo";
import { RankClimbChart } from "@/components/marketing/charts/RankClimbChart";
import { VisibilityGauge } from "@/components/marketing/charts/VisibilityGauge";
import { CompetitorBars } from "@/components/marketing/charts/CompetitorBars";

const CONTENT = {
  cs: {
    eyebrow: "Nový typ projektu",
    heading: "Lokální SEO, které",
    headingAccent: "vylézá nahoru.",
    sub: "Pozice v mapovém balíčku, recenze a Google Business Profil napříč pobočkami — v jednom workspace. Stiskněte tlačítko a sledujte, jak pin stoupá z #4 na #1.",
    ctaPrimary: "Vyzkoušet naživo",
    ctaSecondary: "Založit zdarma",
    marqueeLead: "Signály",
    chartsEyebrow: "Terénní měření",
    chartsHeading: "Tři pohledy na jednu lokální dominanci.",
    chartsSub: "Ilustrativní data — stejná viz, jakou moduly vykreslují nad reálným katalogem klienta.",
    rankTitle: "Výstup v mapě za 90 dní",
    rankSub: "Váš pin #5 → #1, zatímco nejsilnější rival ztrácí.",
    visTitle: "Viditelnost v map packu",
    visCaption: "viditelnost",
    compTitle: "Podíl na proklicích",
    compSub: "Pozice #1 bere lví podíl kliknutí v balíčku.",
    closingHeading: "Buďte první, koho místní najdou.",
    closingCta: "Vyzkoušet naživo",
    rank: {
      run: "Spustit optimalizaci",
      running: "Běží…",
      replay: "Přehrát znovu",
      reset: "Reset",
      avgRank: "Průměrná pozice v mapě",
      visibility: "Viditelnost v map packu",
      target: "cíl",
      readouts: "Živé hodnoty",
      beforeAfter: "Před a po.",
      beforeAfterSub: "Stejných pět konkurentů, stejné hledání. Změnila se jen práce.",
      rank1Firing: "Pozice #1 · signál běží",
      idleAwaiting: "Nečinné · čeká na signál",
      signalStrong: "Signál · SILNÝ",
      signalIdle: "Signál · KLID",
      you: "Vaše pobočka",
    } satisfies RankClimbLabels,
    signals: [
      "Dentální hygiena · Praha",
      "Zubní pohotovost · Brno",
      "Implantáty · Ostrava",
      "Ortodoncie · Plzeň",
      "Recenze 4,9 ★",
      "Google Business Profile",
    ],
  },
  en: {
    eyebrow: "New project type",
    heading: "Local SEO that",
    headingAccent: "climbs to the top.",
    sub: "Map-pack rankings, reviews and Google Business Profile across every location — in one workspace. Press the button and watch a pin climb from #4 to #1.",
    ctaPrimary: "See it work",
    ctaSecondary: "Start free",
    marqueeLead: "Signals",
    chartsEyebrow: "Field measurements",
    chartsHeading: "Three views of one local dominance.",
    chartsSub: "Illustrative data — the same viz the modules render over a client's real catalog.",
    rankTitle: "90-day map-pack climb",
    rankSub: "Your pin #5 → #1 while the top rival drifts.",
    visTitle: "Map-pack visibility",
    visCaption: "visible",
    compTitle: "Share of clicks",
    compSub: "Rank #1 takes the lion's share of clicks in the pack.",
    closingHeading: "Be the first the locals find.",
    closingCta: "See it work",
    rank: {
      run: "Run optimization",
      running: "Running…",
      replay: "Replay",
      reset: "Reset",
      avgRank: "Average map-pack rank",
      visibility: "Map-pack visibility",
      target: "target",
      readouts: "Live readouts",
      beforeAfter: "Before & after.",
      beforeAfterSub: "The same five competitors, the same search. Only the work changed.",
      rank1Firing: "Ranked #1 · ping firing",
      idleAwaiting: "Idle · awaiting signal",
      signalStrong: "Signal · STRONG",
      signalIdle: "Signal · IDLE",
      you: "Your location",
    } satisfies RankClimbLabels,
    signals: [
      "Dental hygiene · Prague",
      "Emergency dentist · Brno",
      "Implants · Ostrava",
      "Orthodontics · Plzeň",
      "Reviews 4.9 ★",
      "Google Business Profile",
    ],
  },
} as const;

function ChartCard({
  title,
  sub,
  children,
}: {
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-card border border-line bg-surface p-5 shadow-card">
      <h3 className="text-sm font-semibold tracking-tight text-navy-800">{title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{sub}</p>
      <ChartReveal className="mt-4 h-52">{children}</ChartReveal>
    </div>
  );
}

export default function LocalSeoShowcase() {
  const { locale } = useLocale();
  const c = CONTENT[locale] ?? CONTENT.cs;

  return (
    <MotionProvider>
      {/* Hero */}
      <section className="border-b border-line">
        <Container className="py-14 lg:py-20">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
            <Kinetic once>
              <Eyebrow>{c.eyebrow}</Eyebrow>
              <h1 className="mt-3 text-4xl font-semibold leading-[1.05] tracking-tight text-navy-800 sm:text-5xl">
                {c.heading} <span className="text-brand-accent">{c.headingAccent}</span>
              </h1>
              <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">{c.sub}</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 shadow-card transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99]"
                >
                  {c.ctaPrimary}
                  <ArrowRight width={17} height={17} />
                </Link>
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 rounded-pill border border-line px-5 py-3 text-sm font-semibold text-navy-800 transition-colors hover:border-brand-300 hover:text-brand-accent"
                >
                  {c.ctaSecondary}
                </Link>
              </div>
            </Kinetic>

            <Kinetic once delay={0.1} y={24}>
              <RankClimbDemo labels={c.rank} />
            </Kinetic>
          </div>
        </Container>
      </section>

      {/* Signals marquee */}
      <section className="border-b border-line bg-brand-50/40">
        <Container className="flex items-center gap-6 py-4">
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-brand-accent">
            {c.marqueeLead}
          </span>
          <Marquee
            className="min-w-0 flex-1 text-sm font-medium text-muted"
            items={c.signals.map((s) => (
              <span key={s}>{s}</span>
            ))}
          />
        </Container>
      </section>

      {/* Charts */}
      <section>
        <Container className="py-14 lg:py-20">
          <Kinetic once className="max-w-2xl">
            <Eyebrow>{c.chartsEyebrow}</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              {c.chartsHeading}
            </h2>
            <p className="mt-3 text-muted">{c.chartsSub}</p>
          </Kinetic>

          <div className="mt-9 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Kinetic once delay={0}>
              <ChartCard title={c.rankTitle} sub={c.rankSub}>
                <RankClimbChart label={c.rankTitle} />
              </ChartCard>
            </Kinetic>
            <Kinetic once delay={0.08}>
              <ChartCard title={c.visTitle} sub={c.compSub}>
                <div className="mx-auto h-full max-w-[220px]">
                  <VisibilityGauge value={67} caption={c.visCaption} label={c.visTitle} />
                </div>
              </ChartCard>
            </Kinetic>
            <Kinetic once delay={0.16}>
              <ChartCard title={c.compTitle} sub={c.compSub}>
                <CompetitorBars label={c.compTitle} />
              </ChartCard>
            </Kinetic>
          </div>
        </Container>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-onyx-line bg-onyx">
        <Container className="py-12">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="max-w-xl text-2xl font-semibold leading-snug tracking-tight text-white">
              {c.closingHeading}
            </h2>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
            >
              {c.closingCta}
              <ArrowRight width={17} height={17} />
            </Link>
          </div>
        </Container>
      </section>
    </MotionProvider>
  );
}
