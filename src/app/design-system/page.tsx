import type { Metadata } from "next";
import type { SVGProps, ReactElement } from "react";
import Link from "next/link";
import {
  Button,
  BUTTON_SIZE_NAMES,
  BUTTON_VARIANT_NAMES,
  Container,
  Eyebrow,
  Pill,
  PILL_TONE_NAMES,
} from "@/components/ui";
import Sparkline from "@/components/charts/Sparkline";
import DeltaBadge from "@/components/dashboard/DeltaBadge";
import LocaleShowcase from "@/components/LocaleShowcase";
import * as Icons from "@/components/icons";
import { ArrowRight } from "@/components/icons";
import {
  baseColors,
  colorRamps,
  fontTokens,
  radiusTokens,
  shadowTokens,
} from "@/lib/design-tokens";
import Swatch from "./Swatch";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Design system",
  description:
    "Živý přehled sdílené sady primitiv — barevné tokeny z @theme, typografie, všechny tóny Pill, kompletní ikony a varianty Sparkline. Generováno přímo z názvů tokenů, takže se nikdy nerozejde s globals.css.",
};

const T = {
  cs: {
    livingStyleGuide: "Living style guide",
    heroTitle: "Design system na jedné obrazovce",
    heroBodyIntro: "Celá sdílená sada primitiv, kterou používá každá stránka — barevné rampy, typografie, komponenty",
    heroBodyMid: ", kompletní ikony a graf",
    heroBodyEnd: ". Swatche se generují přímo z názvů tokenů v",
    heroBodyTail: ", takže se přehled nikdy nerozejde se zdrojem — a slouží i jako baseline pro vizuální regrese.",
    navColors: "Barvy",
    navTypography: "Typografie",
    navButtons: "Tlačítka",
    navPill: "Pill",
    navIcons: "Ikony",
    navSparkline: "Sparkline",
    navDeltaBadge: "DeltaBadge",
    navLocalization: "Lokalizace",
    navSurfaces: "Plochy",
    tokensEyebrow: "Tokeny",
    colorsTitle: "Barevné rampy",
    colorsIntro:
      "Navy drží strukturu, teal je značka a akce, korál je pozornost. Každý swatch má živé pozadí přes var(--color-…); hex pod ním je jen popisek načtený z @theme.",
    shadesCount: "{n} odstínů",
    surfacesSemantic: "Plochy & sémantické",
    tokensCount: "{n} tokenů",
    typographyTitle: "Typografie",
    typographyIntro:
      "Geist Sans pro text, Geist Mono pro kód. Pevná škála od displeje po sekundární popisky a sdílené primitivy Eyebrow a Container.",
    eyebrowLabel: "Eyebrow",
    parentKicker: "Nadřazený kicker",
    eyebrowDesc: "Malý velkými písmeny nad nadpisem, s krátkou linkou ve značkové barvě.",
    tabularFigures: "Tabulární číslice",
    tabularDescPre: "Třída",
    tabularDescPost: "drží čísla zarovnaná ve sloupcích (font-variant-numeric: tabular-nums).",
    inlineLink: "Inline odkaz",
    inlineLinkPre: "Odstavec s",
    inlineLinkAnchor: "prolinkem ve stylu obsahu",
    inlineLinkPost: "a měkkým podtržením ve značkové barvě.",
    buttonsTitle: "Tlačítka — varianty a velikosti",
    buttonsIntro:
      "Sdílený primitiv Button, extrahovaný z ~185 ručně psaných tlačítek. Čtyři varianty × tři velikosti, enumerované přímo z komponenty. Výchozí typ je button (nikdy neodešle formulář omylem); s parametrem href se vykreslí jako odkaz se stejným stylem.",
    componentEyebrow: "Komponenta",
    disabled: "disabled",
    pillTitle: "Pill — všechny tóny",
    pillIntro: "Štítek pro stavy a metadata. Seznam tónů je enumerovaný přímo z komponenty, takže nový tón se tu objeví sám.",
    setEyebrow: "Sada",
    iconsTitle: "Ikony ({n})",
    iconsIntro: "Bezzávislostní inline SVG, stroke = currentColor, výchozí 20 × 20. Sada se čte z exportů icons.tsx, takže je vždy kompletní.",
    graphEyebrow: "Graf",
    sparklineTitle: "Sparkline — varianty",
    sparklineIntro: "Čistě serverový mini-graf bez klientského JS. Mapuje sérii čísel na SVG cestu s volitelnou plochou; barvu i rozměr řídí props.",
    deltaBadgeTitle: "DeltaBadge — stavy změn",
    deltaBadgeIntro:
      "Barevný indikátor změny zná dobrý směr metriky (pokles PNO je zelený) a statistickou významnost: šum se vykresluje tlumeně, takže běžné denní kolísání nikdy nevypadá jako trend. Stejný primitiv používají KPI karty i modul ziskovosti.",
    chokepointEyebrow: "Chokepoint",
    localizationTitle: "Lokalizace — jeden formátovací zdroj",
    localizationIntro:
      "Veškeré formátování čísel, měn a dat teče přes createFormatters(locale). Přepněte trh a stejná data se přepíšou — důkaz, že je produkt připravený na víc jazyků i měn z jednoho místa.",
    surfacesTitle: "Plochy, rádiusy & stíny",
    surfacesIntro: "Zaoblení a elevace, které drží celé UI konzistentní. Hodnoty se čtou z @theme a aplikují přes var(--radius-…) a var(--shadow-…).",
    elevation: "elevace",
    backToOverview: "Zpět na přehled",
    // sparkline demo labels
    spArea: "Plocha (výchozí)",
    spAreaNote: "area, brand",
    spLine: "Jen čára",
    spLineNote: "area={false}",
    spGrowthPositive: "Růst · pozitivní",
    spGrowthPositiveNote: "positive tón",
    spDeclineNegative: "Pokles · negativní",
    spDeclineNegativeNote: "negative tón",
    spVolatileNavy: "Volatilní · navy",
    spVolatileNavyNote: "navy ramp",
    spGrowthAutoColor: "Růst · autoColor + tečka",
    spGrowthAutoColorNote: "autoColor, dot",
    spDeclineAutoColor: "Pokles · autoColor",
    spDeclineAutoColorNote: "delta < 0 → negativní",
    spGoodDirection: "Klesající náklad · dobrý směr",
    spGoodDirectionNote: "goodDirection down → pozitivní",
    spBaseline: "Baseline od startu",
    spBaselineNote: "baseline, dot",
    spLargeFormat: "Velký formát",
    spLargeFormatNote: "240 × 72",
    spResponsive: "Responzivní šířka",
    spResponsiveNote: "responsive",
    spPeak: "Vrchol série",
    spPeakNote: "markPeak",
    spObservedEstimate: "Pozorováno + odhad",
    spObservedEstimateNote: "dashFrom, dot",
    // delta-badge demo notes
    dGrowthStrong: "růst · významné",
    dGrowthWeak: "růst · slabý signál",
    dGrowthNoise: "růst · šum",
    dDeclineStrong: "pokles · významné",
    dDeclinePnoGood: "pokles metriky, kde je pokles dobrý (PNO)",
    dGrowthPnoBad: "růst metriky, kde je pokles dobrý (PNO)",
    dBelowThreshold: "pod prahem zobrazení",
    // type-scale row names
    typeDisplay: "Display / H1",
    typeHeading: "Nadpis / H2",
    typeSubheading: "Podnadpis / H3",
    typeBody: "Tělo textu",
    typeSecondary: "Sekundární",
  },
  en: {
    livingStyleGuide: "Living style guide",
    heroTitle: "The design system on one screen",
    heroBodyIntro: "The whole shared primitive set every page draws on — color ramps, typography, the",
    heroBodyMid: "component, the complete icon set and the",
    heroBodyEnd: "chart. Swatches are generated straight from the token names in",
    heroBodyTail: ", so this overview can never drift from the source — and it doubles as a visual-regression baseline.",
    navColors: "Colors",
    navTypography: "Typography",
    navButtons: "Buttons",
    navPill: "Pill",
    navIcons: "Icons",
    navSparkline: "Sparkline",
    navDeltaBadge: "DeltaBadge",
    navLocalization: "Localization",
    navSurfaces: "Surfaces",
    tokensEyebrow: "Tokens",
    colorsTitle: "Color ramps",
    colorsIntro:
      "Navy holds the structure, teal is the brand and actions, coral is attention. Every swatch renders its live background via var(--color-…); the hex underneath is just a label read from @theme.",
    shadesCount: "{n} shades",
    surfacesSemantic: "Surfaces & semantic",
    tokensCount: "{n} tokens",
    typographyTitle: "Typography",
    typographyIntro:
      "Geist Sans for text, Geist Mono for code. A fixed scale from display down to secondary labels, plus the shared Eyebrow and Container primitives.",
    eyebrowLabel: "Eyebrow",
    parentKicker: "Parent kicker",
    eyebrowDesc: "A small uppercase label above a heading, with a short brand-colored rule.",
    tabularFigures: "Tabular figures",
    tabularDescPre: "The",
    tabularDescPost: "class keeps numbers aligned in columns (font-variant-numeric: tabular-nums).",
    inlineLink: "Inline link",
    inlineLinkPre: "A paragraph with a",
    inlineLinkAnchor: "body-style inline link",
    inlineLinkPost: "and a soft brand-colored underline.",
    buttonsTitle: "Buttons — variants and sizes",
    buttonsIntro:
      "The shared Button primitive, extracted from ~185 hand-written buttons. Four variants × three sizes, enumerated straight from the component. The default type is button (never submits a form by accident); pass href and it renders as a link with the same style.",
    componentEyebrow: "Component",
    disabled: "disabled",
    pillTitle: "Pill — every tone",
    pillIntro: "A label for states and metadata. The tone list is enumerated straight from the component, so a new tone shows up here on its own.",
    setEyebrow: "Set",
    iconsTitle: "Icons ({n})",
    iconsIntro: "Dependency-free inline SVGs, stroke = currentColor, default 20 × 20. The set is read from icons.tsx's exports, so it's always complete.",
    graphEyebrow: "Chart",
    sparklineTitle: "Sparkline — variants",
    sparklineIntro: "A pure server-rendered mini-chart with no client JS. Maps a number series to an SVG path with an optional area fill; color and size are driven by props.",
    deltaBadgeTitle: "DeltaBadge — change states",
    deltaBadgeIntro:
      "The colored change indicator knows a metric's good direction (a PNO drop is green) and statistical significance: noise renders muted, so ordinary daily wobble never reads as a trend. KPI cards and the profit module share this same primitive.",
    chokepointEyebrow: "Chokepoint",
    localizationTitle: "Localization — one formatting source",
    localizationIntro:
      "Every number, currency and date runs through createFormatters(locale). Switch the market and the same data re-renders — proof the product is ready for more languages and currencies from one place.",
    surfacesTitle: "Surfaces, radii & shadows",
    surfacesIntro: "The rounding and elevation that keep the whole UI consistent. Values are read from @theme and applied via var(--radius-…) and var(--shadow-…).",
    elevation: "elevation",
    backToOverview: "Back to overview",
    // sparkline demo labels
    spArea: "Area (default)",
    spAreaNote: "area, brand",
    spLine: "Line only",
    spLineNote: "area={false}",
    spGrowthPositive: "Growth · positive",
    spGrowthPositiveNote: "positive tone",
    spDeclineNegative: "Decline · negative",
    spDeclineNegativeNote: "negative tone",
    spVolatileNavy: "Volatile · navy",
    spVolatileNavyNote: "navy ramp",
    spGrowthAutoColor: "Growth · autoColor + dot",
    spGrowthAutoColorNote: "autoColor, dot",
    spDeclineAutoColor: "Decline · autoColor",
    spDeclineAutoColorNote: "delta < 0 → negative",
    spGoodDirection: "Falling cost · good direction",
    spGoodDirectionNote: "goodDirection down → positive",
    spBaseline: "Baseline from start",
    spBaselineNote: "baseline, dot",
    spLargeFormat: "Large format",
    spLargeFormatNote: "240 × 72",
    spResponsive: "Responsive width",
    spResponsiveNote: "responsive",
    spPeak: "Series peak",
    spPeakNote: "markPeak",
    spObservedEstimate: "Observed + estimated",
    spObservedEstimateNote: "dashFrom, dot",
    // delta-badge demo notes
    dGrowthStrong: "growth · strong",
    dGrowthWeak: "growth · weak signal",
    dGrowthNoise: "growth · noise",
    dDeclineStrong: "decline · strong",
    dDeclinePnoGood: "metric decline, where a drop is good (PNO)",
    dGrowthPnoBad: "metric growth, where a drop is good (PNO)",
    dBelowThreshold: "below the display threshold",
    // type-scale row names
    typeDisplay: "Display / H1",
    typeHeading: "Heading / H2",
    typeSubheading: "Subheading / H3",
    typeBody: "Body text",
    typeSecondary: "Secondary",
  },
} as const;

/** The full icon set, read from the module exports so a new icon shows up here
 *  automatically — no manual list to keep in sync. */
type IconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;
const ICONS = (Object.entries(Icons) as [string, IconComponent][]).sort(([a], [b]) =>
  a.localeCompare(b)
);

/** Deterministic sample series for the Sparkline variants (no PRNG so the page
 *  is a stable visual-regression baseline). */
const SERIES: Record<"up" | "down" | "volatile" | "steady", number[]> = {
  up: [4, 6, 5, 8, 7, 11, 10, 14, 13, 18, 17, 22],
  down: [22, 19, 20, 16, 17, 12, 13, 9, 10, 6, 7, 4],
  volatile: [11, 4, 15, 6, 17, 8, 19, 5, 14, 9, 18, 7],
  steady: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
};

type SparklineDemo = {
  label: string;
  note: string;
  props: React.ComponentProps<typeof Sparkline>;
};
type TFn = (key: keyof (typeof T)["cs"], vars?: Record<string, string | number>) => string;

function sparklines(t: TFn): SparklineDemo[] {
  return [
    { label: t("spArea"), note: t("spAreaNote"), props: { values: SERIES.up } },
    { label: t("spLine"), note: t("spLineNote"), props: { values: SERIES.up, area: false } },
    {
      label: t("spGrowthPositive"),
      note: t("spGrowthPositiveNote"),
      props: {
        values: SERIES.up,
        stroke: "var(--color-positive)",
        fill: "color-mix(in srgb, var(--color-positive) 18%, transparent)",
      },
    },
    {
      label: t("spDeclineNegative"),
      note: t("spDeclineNegativeNote"),
      props: {
        values: SERIES.down,
        stroke: "var(--color-negative)",
        fill: "color-mix(in srgb, var(--color-negative) 18%, transparent)",
      },
    },
    {
      label: t("spVolatileNavy"),
      note: t("spVolatileNavyNote"),
      props: {
        values: SERIES.volatile,
        stroke: "var(--color-navy-500)",
        fill: "var(--color-navy-100)",
      },
    },
    {
      label: t("spGrowthAutoColor"),
      note: t("spGrowthAutoColorNote"),
      props: { values: SERIES.up, autoColor: true, dot: true },
    },
    {
      label: t("spDeclineAutoColor"),
      note: t("spDeclineAutoColorNote"),
      props: { values: SERIES.down, autoColor: true, dot: true },
    },
    {
      label: t("spGoodDirection"),
      note: t("spGoodDirectionNote"),
      props: { values: SERIES.down, autoColor: true, dot: true, goodDirection: "down" },
    },
    {
      label: t("spBaseline"),
      note: t("spBaselineNote"),
      props: { values: SERIES.volatile, baseline: true, dot: true, autoColor: true },
    },
    {
      label: t("spLargeFormat"),
      note: t("spLargeFormatNote"),
      props: { values: SERIES.steady, width: 240, height: 72, autoColor: true, dot: true },
    },
    {
      label: t("spResponsive"),
      note: t("spResponsiveNote"),
      props: {
        values: SERIES.up,
        responsive: true,
        autoColor: true,
        dot: true,
        className: "h-9 w-full",
      },
    },
    {
      label: t("spPeak"),
      note: t("spPeakNote"),
      props: {
        values: SERIES.volatile,
        area: false,
        markPeak: true,
        stroke: "var(--color-brand-accent)",
      },
    },
    {
      label: t("spObservedEstimate"),
      note: t("spObservedEstimateNote"),
      props: {
        values: SERIES.steady,
        area: false,
        dashFrom: 6,
        dot: true,
        stroke: "var(--color-navy-500)",
      },
    },
  ];
}

/** DeltaBadge state matrix: direction × statistical significance × which
 *  direction counts as "good". Deterministic values, so the page stays a stable
 *  visual-regression baseline. */
function deltaStates(t: TFn): Array<{
  note: string;
  delta: number;
  goodDirection: "up" | "down";
  significance?: "strong" | "weak" | "noise";
}> {
  return [
    { note: t("dGrowthStrong"), delta: 0.124, goodDirection: "up", significance: "strong" },
    { note: t("dGrowthWeak"), delta: 0.062, goodDirection: "up", significance: "weak" },
    { note: t("dGrowthNoise"), delta: 0.008, goodDirection: "up", significance: "noise" },
    { note: t("dDeclineStrong"), delta: -0.087, goodDirection: "up", significance: "strong" },
    { note: t("dDeclinePnoGood"), delta: -0.054, goodDirection: "down", significance: "strong" },
    { note: t("dGrowthPnoBad"), delta: 0.054, goodDirection: "down", significance: "strong" },
    { note: t("dBelowThreshold"), delta: 0.0002, goodDirection: "up" },
  ];
}

/** Heading-scale demo rows. The size steps (text-4xl…) are Tailwind v4 defaults,
 *  not custom @theme tokens, so there's nothing of ours to drift; the font-family
 *  tokens are generated from @theme (see fontTokens) and rendered below. */
function typeScale(t: TFn) {
  return [
    { node: <span className="text-4xl font-semibold tracking-tight text-navy-800 sm:text-5xl">Aa</span>, name: t("typeDisplay"), spec: "text-4xl → 5xl · semibold · tracking-tight" },
    { node: <span className="text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">Aa</span>, name: t("typeHeading"), spec: "text-2xl → 3xl · semibold" },
    { node: <span className="text-lg font-semibold text-navy-800">Aa</span>, name: t("typeSubheading"), spec: "text-lg · semibold" },
    { node: <span className="text-base text-ink">Aa</span>, name: t("typeBody"), spec: "text-base · color-ink" },
    { node: <span className="text-sm text-muted">Aa</span>, name: t("typeSecondary"), spec: "text-sm · text-muted" },
  ];
}

function Section({
  eyebrow,
  title,
  intro,
  id,
  testid,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  id: string;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-testid={testid} className="scroll-mt-24 border-t border-line py-12 sm:py-16">
      <div className="max-w-2xl">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{intro}</p>
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

export default async function DesignSystemPage() {
  const t = await getT(T);
  const SPARKLINES = sparklines(t);
  const DELTA_STATES = deltaStates(t);
  const TYPE_SCALE = typeScale(t);
  const navLinks = [
    [t("navColors"), "#barvy"],
    [t("navTypography"), "#typografie"],
    [t("navButtons"), "#tlacitka"],
    [t("navPill"), "#pill"],
    [t("navIcons"), "#ikony"],
    [t("navSparkline"), "#sparkline"],
    [t("navDeltaBadge"), "#deltabadge"],
    [t("navLocalization"), "#lokalizace"],
    [t("navSurfaces"), "#plochy"],
  ];

  return (
    <>
      {/* ---------------------------------------------------------------- Hero */}
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="absolute inset-0 bg-dotgrid opacity-70" aria-hidden />
        <div
          className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl"
          aria-hidden
        />
        <Container className="relative py-14 sm:py-20">
          <Eyebrow>{t("livingStyleGuide")}</Eyebrow>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-navy-800 sm:text-5xl">
            {t("heroTitle")}
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            {t("heroBodyIntro")}{" "}
            <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[0.85em] text-navy-700">Pill</code>
            {" "}{t("heroBodyMid")}{" "}
            <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[0.85em] text-navy-700">Sparkline</code>
            {" "}{t("heroBodyEnd")}{" "}
            <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[0.85em] text-navy-700">globals.css</code>
            {t("heroBodyTail")}
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {navLinks.map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-pill border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                {label}
              </a>
            ))}
          </div>
        </Container>
      </section>

      <Container className="pb-8">
        {/* ----------------------------------------------------------- Colours */}
        <Section
          id="barvy"
          testid="ds-colors"
          eyebrow={t("tokensEyebrow")}
          title={t("colorsTitle")}
          intro={t("colorsIntro")}
        >
          <div className="space-y-8">
            {colorRamps.map((ramp) => (
              <div key={ramp.family}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold capitalize text-navy-800">{ramp.family}</h3>
                  <span className="text-xs text-muted">{t("shadesCount", { n: ramp.tokens.length })}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
                  {ramp.tokens.map((tok) => (
                    <Swatch key={tok.cssVar} token={tok} />
                  ))}
                </div>
              </div>
            ))}

            <div>
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-navy-800">{t("surfacesSemantic")}</h3>
                <span className="text-xs text-muted">{t("tokensCount", { n: baseColors.length })}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {baseColors.map((tok) => (
                  <Swatch key={tok.cssVar} token={tok} big />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* -------------------------------------------------------- Typography */}
        <Section
          id="typografie"
          testid="ds-typography"
          eyebrow={t("tokensEyebrow")}
          title={t("typographyTitle")}
          intro={t("typographyIntro")}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card divide-y divide-line p-2">
              {TYPE_SCALE.map((row) => (
                <div key={row.name} className="flex items-center gap-4 px-3 py-4">
                  <div className="grid w-20 shrink-0 place-items-center">{row.node}</div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy-800">{row.name}</p>
                    <p className="tnum text-xs text-muted">{row.spec}</p>
                  </div>
                </div>
              ))}
              {/* Font-family tokens — generated from @theme, so they can't drift. */}
              {fontTokens.map((f) => (
                <div key={f.cssVar} className="flex items-center gap-4 px-3 py-4">
                  <div className="grid w-20 shrink-0 place-items-center">
                    <span className="text-2xl text-navy-800" style={{ fontFamily: `var(${f.cssVar})` }}>
                      Aa
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-navy-800">font-{f.name}</p>
                    <p className="tnum truncate text-xs text-muted">{f.cssVar}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {t("eyebrowLabel")}
                </p>
                <div className="mt-3">
                  <Eyebrow>{t("parentKicker")}</Eyebrow>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  {t("eyebrowDesc")}
                </p>
              </div>

              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {t("tabularFigures")}
                </p>
                <p className="tnum mt-3 text-2xl font-semibold tracking-tight text-navy-800">
                  1 248 590 Kč
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  {t("tabularDescPre")}{" "}
                  <code className="rounded bg-navy-50 px-1 py-0.5 text-navy-700">.tnum</code>{" "}
                  {t("tabularDescPost")}
                </p>
              </div>

              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  {t("inlineLink")}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink">
                  {t("inlineLinkPre")}{" "}
                  <a href="#barvy" className="link-inline">
                    {t("inlineLinkAnchor")}
                  </a>{" "}
                  {t("inlineLinkPost")}
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ----------------------------------------------------------- Buttons */}
        <Section
          id="tlacitka"
          testid="ds-buttons"
          eyebrow={t("componentEyebrow")}
          title={t("buttonsTitle")}
          intro={t("buttonsIntro")}
        >
          <div className="card space-y-5 p-6">
            {BUTTON_VARIANT_NAMES.map((variant) => (
              <div key={variant} className="flex flex-wrap items-center gap-3">
                <span className="tnum w-24 shrink-0 text-[13px] text-muted">{variant}</span>
                {BUTTON_SIZE_NAMES.map((size) => (
                  <Button key={size} variant={variant} size={size}>
                    {variant} · {size}
                  </Button>
                ))}
                <Button variant={variant} size="md" disabled>
                  {t("disabled")}
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------- Pills */}
        <Section
          id="pill"
          testid="ds-pills"
          eyebrow={t("componentEyebrow")}
          title={t("pillTitle")}
          intro={t("pillIntro")}
        >
          <div className="card flex flex-wrap items-center gap-3 p-6">
            {PILL_TONE_NAMES.map((tone) => (
              <div key={tone} className="flex flex-col items-center gap-1.5">
                <Pill tone={tone}>{tone}</Pill>
                <span className="tnum text-[13px] text-muted">tone=&quot;{tone}&quot;</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------- Icons */}
        <Section
          id="ikony"
          testid="ds-icons"
          eyebrow={t("setEyebrow")}
          title={t("iconsTitle", { n: ICONS.length })}
          intro={t("iconsIntro")}
        >
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {ICONS.map(([name, Icon]) => (
              <div
                key={name}
                className="card flex flex-col items-center gap-2 px-2 py-4 text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-600"
              >
                <Icon width={24} height={24} />
                <span className="tnum truncate text-[13px] text-muted">{name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* --------------------------------------------------------- Sparkline */}
        <Section
          id="sparkline"
          testid="ds-sparklines"
          eyebrow={t("graphEyebrow")}
          title={t("sparklineTitle")}
          intro={t("sparklineIntro")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SPARKLINES.map((v) => (
              <div key={v.label} className="card flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-navy-800">{v.label}</span>
                  <span className="tnum text-[13px] text-muted">{v.note}</span>
                </div>
                <div className="flex min-h-[72px] items-center justify-center rounded-xl bg-canvas p-3">
                  <Sparkline {...v.props} />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* -------------------------------------------------------- DeltaBadge */}
        <Section
          id="deltabadge"
          testid="ds-deltabadge"
          eyebrow={t("componentEyebrow")}
          title={t("deltaBadgeTitle")}
          intro={t("deltaBadgeIntro")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DELTA_STATES.map((s) => (
              <div key={s.note} className="card flex items-center justify-between gap-3 p-5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-navy-800">{s.note}</p>
                  <p className="tnum mt-0.5 text-[13px] text-muted">
                    goodDirection=&quot;{s.goodDirection}&quot;
                    {s.significance ? ` · ${s.significance}` : ""}
                  </p>
                </div>
                <DeltaBadge delta={s.delta} goodDirection={s.goodDirection} significance={s.significance} />
              </div>
            ))}
          </div>
        </Section>

        {/* -------------------------------------------------------- Localization */}
        <Section
          id="lokalizace"
          testid="ds-locale"
          eyebrow={t("chokepointEyebrow")}
          title={t("localizationTitle")}
          intro={t("localizationIntro")}
        >
          <LocaleShowcase />
        </Section>

        {/* ------------------------------------------------------ Radius/shadow */}
        <Section
          id="plochy"
          testid="ds-elevation"
          eyebrow={t("tokensEyebrow")}
          title={t("surfacesTitle")}
          intro={t("surfacesIntro")}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {radiusTokens.map((tok) => (
              <div key={tok.cssVar} className="card flex flex-col items-center gap-3 p-6">
                <div
                  className="h-16 w-16 border border-brand-200 bg-brand-50"
                  style={{ borderRadius: `var(${tok.cssVar})` }}
                />
                <div className="text-center">
                  <p className="text-sm font-semibold text-navy-800">radius-{tok.name}</p>
                  <p className="tnum text-[13px] text-muted">{tok.value}</p>
                </div>
              </div>
            ))}
            {shadowTokens.map((tok) => (
              <div key={tok.cssVar} className="flex flex-col items-center gap-3 rounded-card bg-canvas p-6">
                <div
                  className="h-16 w-16 rounded-card bg-surface"
                  style={{ boxShadow: `var(${tok.cssVar})` }}
                />
                <div className="text-center">
                  <p className="text-sm font-semibold text-navy-800">shadow-{tok.name}</p>
                  <p className="tnum text-[13px] text-muted">{t("elevation")}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------- Footer */}
        <div className="border-t border-line py-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-accent transition-colors hover:text-brand-800"
          >
            <ArrowRight width={16} height={16} className="rotate-180" />
            {t("backToOverview")}
          </Link>
        </div>
      </Container>
    </>
  );
}
