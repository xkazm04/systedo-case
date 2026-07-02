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

export const metadata: Metadata = {
  title: "Design system",
  description:
    "Živý přehled sdílené sady primitiv — barevné tokeny z @theme, typografie, všechny tóny Pill, kompletní ikony a varianty Sparkline. Generováno přímo z názvů tokenů, takže se nikdy nerozejde s globals.css.",
};

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

const SPARKLINES: Array<{
  label: string;
  note: string;
  props: React.ComponentProps<typeof Sparkline>;
}> = [
  {
    label: "Plocha (výchozí)",
    note: "area, brand",
    props: { values: SERIES.up },
  },
  {
    label: "Jen čára",
    note: "area={false}",
    props: { values: SERIES.up, area: false },
  },
  {
    label: "Růst · pozitivní",
    note: "positive tón",
    props: {
      values: SERIES.up,
      stroke: "var(--color-positive)",
      fill: "color-mix(in srgb, var(--color-positive) 18%, transparent)",
    },
  },
  {
    label: "Pokles · negativní",
    note: "negative tón",
    props: {
      values: SERIES.down,
      stroke: "var(--color-negative)",
      fill: "color-mix(in srgb, var(--color-negative) 18%, transparent)",
    },
  },
  {
    label: "Volatilní · navy",
    note: "navy ramp",
    props: {
      values: SERIES.volatile,
      stroke: "var(--color-navy-500)",
      fill: "var(--color-navy-100)",
    },
  },
  {
    label: "Růst · autoColor + tečka",
    note: "autoColor, dot",
    props: { values: SERIES.up, autoColor: true, dot: true },
  },
  {
    label: "Pokles · autoColor",
    note: "delta < 0 → negativní",
    props: { values: SERIES.down, autoColor: true, dot: true },
  },
  {
    label: "Klesající náklad · dobrý směr",
    note: "goodDirection down → pozitivní",
    props: { values: SERIES.down, autoColor: true, dot: true, goodDirection: "down" },
  },
  {
    label: "Baseline od startu",
    note: "baseline, dot",
    props: { values: SERIES.volatile, baseline: true, dot: true, autoColor: true },
  },
  {
    label: "Velký formát",
    note: "240 × 72",
    props: { values: SERIES.steady, width: 240, height: 72, autoColor: true, dot: true },
  },
];

/** Heading-scale demo rows. The size steps (text-4xl…) are Tailwind v4 defaults,
 *  not custom @theme tokens, so there's nothing of ours to drift; the font-family
 *  tokens are generated from @theme (see fontTokens) and rendered below. */
const TYPE_SCALE = [
  { node: <span className="text-4xl font-semibold tracking-tight text-navy-800 sm:text-5xl">Aa</span>, name: "Display / H1", spec: "text-4xl → 5xl · semibold · tracking-tight" },
  { node: <span className="text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">Aa</span>, name: "Nadpis / H2", spec: "text-2xl → 3xl · semibold" },
  { node: <span className="text-lg font-semibold text-navy-800">Aa</span>, name: "Podnadpis / H3", spec: "text-lg · semibold" },
  { node: <span className="text-base text-ink">Aa</span>, name: "Tělo textu", spec: "text-base · color-ink" },
  { node: <span className="text-sm text-muted">Aa</span>, name: "Sekundární", spec: "text-sm · text-muted" },
];

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

export default function DesignSystemPage() {
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
          <Eyebrow>Living style guide</Eyebrow>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.08] tracking-tight text-navy-800 sm:text-5xl">
            Design system na jedné obrazovce
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Celá sdílená sada primitiv, kterou používá každá stránka — barevné rampy,
            typografie, komponenty <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[0.85em] text-navy-700">Pill</code>,
            kompletní ikony a graf <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[0.85em] text-navy-700">Sparkline</code>.
            Swatche se generují přímo z názvů tokenů v{" "}
            <code className="rounded bg-navy-50 px-1.5 py-0.5 text-[0.85em] text-navy-700">globals.css</code>,
            takže se přehled nikdy nerozejde se zdrojem — a slouží i jako baseline pro vizuální
            regrese.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            {[
              ["Barvy", "#barvy"],
              ["Typografie", "#typografie"],
              ["Tlačítka", "#tlacitka"],
              ["Pill", "#pill"],
              ["Ikony", "#ikony"],
              ["Sparkline", "#sparkline"],
              ["Lokalizace", "#lokalizace"],
              ["Plochy", "#plochy"],
            ].map(([label, href]) => (
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
          eyebrow="Tokeny"
          title="Barevné rampy"
          intro="Navy drží strukturu, teal je značka a akce, korál je pozornost. Každý swatch má živé pozadí přes var(--color-…); hex pod ním je jen popisek načtený z @theme."
        >
          <div className="space-y-8">
            {colorRamps.map((ramp) => (
              <div key={ramp.family}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h3 className="text-sm font-semibold capitalize text-navy-800">{ramp.family}</h3>
                  <span className="text-xs text-muted">{ramp.tokens.length} odstínů</span>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-10">
                  {ramp.tokens.map((t) => (
                    <Swatch key={t.cssVar} token={t} />
                  ))}
                </div>
              </div>
            ))}

            <div>
              <div className="mb-3 flex items-baseline gap-2">
                <h3 className="text-sm font-semibold text-navy-800">Plochy &amp; sémantické</h3>
                <span className="text-xs text-muted">{baseColors.length} tokenů</span>
              </div>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {baseColors.map((t) => (
                  <Swatch key={t.cssVar} token={t} big />
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* -------------------------------------------------------- Typography */}
        <Section
          id="typografie"
          testid="ds-typography"
          eyebrow="Tokeny"
          title="Typografie"
          intro="Geist Sans pro text, Geist Mono pro kód. Pevná škála od displeje po sekundární popisky a sdílené primitivy Eyebrow a Container."
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
                  Eyebrow
                </p>
                <div className="mt-3">
                  <Eyebrow>Nadřazený kicker</Eyebrow>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  Malý velkými písmeny nad nadpisem, s krátkou linkou ve značkové barvě.
                </p>
              </div>

              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Tabulární číslice
                </p>
                <p className="tnum mt-3 text-2xl font-semibold tracking-tight text-navy-800">
                  1 248 590 Kč
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted">
                  Třída <code className="rounded bg-navy-50 px-1 py-0.5 text-navy-700">.tnum</code> drží
                  čísla zarovnaná ve sloupcích (font-variant-numeric: tabular-nums).
                </p>
              </div>

              <div className="card p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Inline odkaz
                </p>
                <p className="mt-3 text-sm leading-relaxed text-ink">
                  Odstavec s{" "}
                  <a href="#barvy" className="link-inline">
                    prolinkem ve stylu obsahu
                  </a>{" "}
                  a měkkým podtržením ve značkové barvě.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* ----------------------------------------------------------- Buttons */}
        <Section
          id="tlacitka"
          testid="ds-buttons"
          eyebrow="Komponenta"
          title="Tlačítka — varianty a velikosti"
          intro="Sdílený primitiv Button, extrahovaný z ~185 ručně psaných tlačítek. Čtyři varianty × tři velikosti, enumerované přímo z komponenty. Výchozí typ je button (nikdy neodešle formulář omylem); s parametrem href se vykreslí jako odkaz se stejným stylem."
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
                  disabled
                </Button>
              </div>
            ))}
          </div>
        </Section>

        {/* ------------------------------------------------------------- Pills */}
        <Section
          id="pill"
          testid="ds-pills"
          eyebrow="Komponenta"
          title="Pill — všechny tóny"
          intro="Štítek pro stavy a metadata. Seznam tónů je enumerovaný přímo z komponenty, takže nový tón se tu objeví sám."
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
          eyebrow="Sada"
          title={`Ikony (${ICONS.length})`}
          intro="Bezzávislostní inline SVG, stroke = currentColor, výchozí 20 × 20. Sada se čte z exportů icons.tsx, takže je vždy kompletní."
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
          eyebrow="Graf"
          title="Sparkline — varianty"
          intro="Čistě serverový mini-graf bez klientského JS. Mapuje sérii čísel na SVG cestu s volitelnou plochou; barvu i rozměr řídí props."
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

        {/* -------------------------------------------------------- Localization */}
        <Section
          id="lokalizace"
          testid="ds-locale"
          eyebrow="Chokepoint"
          title="Lokalizace — jeden formátovací zdroj"
          intro="Veškeré formátování čísel, měn a dat teče přes createFormatters(locale). Přepněte trh a stejná data se přepíšou — důkaz, že je produkt připravený na víc jazyků i měn z jednoho místa."
        >
          <LocaleShowcase />
        </Section>

        {/* ------------------------------------------------------ Radius/shadow */}
        <Section
          id="plochy"
          testid="ds-elevation"
          eyebrow="Tokeny"
          title="Plochy, rádiusy &amp; stíny"
          intro="Zaoblení a elevace, které drží celé UI konzistentní. Hodnoty se čtou z @theme a aplikují přes var(--radius-…) a var(--shadow-…)."
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {radiusTokens.map((t) => (
              <div key={t.cssVar} className="card flex flex-col items-center gap-3 p-6">
                <div
                  className="h-16 w-16 border border-brand-200 bg-brand-50"
                  style={{ borderRadius: `var(${t.cssVar})` }}
                />
                <div className="text-center">
                  <p className="text-sm font-semibold text-navy-800">radius-{t.name}</p>
                  <p className="tnum text-[13px] text-muted">{t.value}</p>
                </div>
              </div>
            ))}
            {shadowTokens.map((t) => (
              <div key={t.cssVar} className="flex flex-col items-center gap-3 rounded-card bg-canvas p-6">
                <div
                  className="h-16 w-16 rounded-card bg-surface"
                  style={{ boxShadow: `var(${t.cssVar})` }}
                />
                <div className="text-center">
                  <p className="text-sm font-semibold text-navy-800">shadow-{t.name}</p>
                  <p className="tnum text-[13px] text-muted">elevace</p>
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
            Zpět na přehled
          </Link>
        </div>
      </Container>
    </>
  );
}
