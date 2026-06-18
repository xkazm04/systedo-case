"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Container, Eyebrow, Pill } from "@/components/ui";
import { ArrowRight, Sparkles } from "@/components/icons";

/* ---------------------------------------------------------------------------
   Adamant — brand prototype
   Three visual directions for the same product, each a logo-mark + key-visual
   pair generated for the rebrand. The tab switcher (and the comparison cards
   below) flip the featured direction so the combinations can be judged in a
   real hero context before we commit to one and build the full landing.
--------------------------------------------------------------------------- */

type Variant = {
  id: string;
  name: string;
  index: string;
  logo: string;
  illu: string;
  /** Two-part headline — second part is accented. Playful on the name. */
  tagline: [string, string];
  sub: string;
  /** One-liner shown on the comparison card. */
  concept: string;
  /** Ambient glow colour behind the hero for this direction. */
  glow: string;
};

const VARIANTS: Variant[] = [
  {
    id: "crystalline",
    name: "Crystalline",
    index: "01",
    logo: "/brand/logo-crystalline.png",
    illu: "/brand/illu-crystalline.png",
    tagline: ["Be adamant", "about your ads."],
    sub: "Adamant refines scattered ad spend into something rare and brilliant — one faceted, AI-cut view of every campaign, channel and koruna.",
    concept: "A rare, faceted gem — every campaign cut clear by AI.",
    glow: "#2dd4ce",
  },
  {
    id: "monolith",
    name: "Monolith",
    index: "02",
    logo: "/brand/logo-monolith.png",
    illu: "/brand/illu-monolith.png",
    tagline: ["Stand adamant.", "Ads that never crack."],
    sub: "Performance you can stand on. Adamant forges your advertising into one unbreakable monument — watched, defended and optimised by AI around the clock.",
    concept: "An unbreakable monument — performance that won't crack.",
    glow: "#22b8cf",
  },
  {
    id: "aurora",
    name: "Aurora",
    index: "03",
    logo: "/brand/logo-aurora.png",
    illu: "/brand/illu-aurora.png",
    tagline: ["Adamant about", "every signal."],
    sub: "A living AI core at the centre of your ads. Adamant senses every impression, click and conversion, then turns the noise into a guided, brilliant glow.",
    concept: "A living AI core — every ad signal turned to light.",
    glow: "#5b8dff",
  },
];

const CHANNELS = ["Google Ads", "Sklik", "Meta", "TikTok"];

export default function BrandLanding() {
  const [active, setActive] = useState(0);
  const v = VARIANTS[active];

  return (
    <>
      {/* ----------------------------------------------------------- Hero stage */}
      <section className="relative overflow-hidden border-b border-line bg-surface">
        <div className="absolute inset-0 bg-dotgrid opacity-70" aria-hidden />
        <div
          className="pointer-events-none absolute -right-32 -top-28 h-[30rem] w-[30rem] rounded-full opacity-30 blur-3xl transition-colors duration-700"
          style={{ backgroundColor: v.glow }}
          aria-hidden
        />

        <Container className="relative py-12 lg:py-16">
          {/* prototype label + tab switcher */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <Eyebrow>Brand prototype · three directions</Eyebrow>
            <div
              role="tablist"
              aria-label="Brand direction"
              className="inline-flex rounded-pill border border-line bg-canvas p-1"
            >
              {VARIANTS.map((variant, i) => {
                const selected = i === active;
                return (
                  <button
                    key={variant.id}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    onClick={() => setActive(i)}
                    className={`rounded-pill px-4 py-2 text-sm font-semibold transition-colors ${
                      selected
                        ? "bg-brand-600 text-white shadow-card"
                        : "text-muted hover:text-navy-700"
                    }`}
                  >
                    {variant.name}
                  </button>
                );
              })}
            </div>
          </div>

          {/* featured direction — re-keyed so it eases in on switch */}
          <div
            key={v.id}
            className="animate-fade-up mt-10 grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]"
          >
            {/* left — identity + message */}
            <div>
              <div className="flex items-center gap-3">
                <span className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl ring-1 ring-line">
                  <Image
                    src={v.logo}
                    alt={`Adamant — ${v.name} logo mark`}
                    width={48}
                    height={48}
                    className="h-full w-full scale-[1.08] object-cover"
                  />
                </span>
                <div className="leading-none">
                  <p className="text-2xl font-semibold tracking-tight text-navy-800">Adamant</p>
                  <p className="mt-1 text-[13px] font-medium uppercase tracking-[0.16em] text-muted">
                    AI ad intelligence
                  </p>
                </div>
              </div>

              <div className="mt-6">
                <Pill tone="brand">
                  <Sparkles width={13} height={13} />A rare breed in adtech
                </Pill>
              </div>

              <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-navy-800 sm:text-5xl">
                {v.tagline[0]}
                <br />
                <span className="text-brand-accent">{v.tagline[1]}</span>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">{v.sub}</p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-card transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99]"
                >
                  Start free
                  <ArrowRight width={17} height={17} />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-5 py-3 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                >
                  See it work
                </Link>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-2 text-sm text-muted">
                <span className="font-medium">Works across</span>
                {CHANNELS.map((c) => (
                  <span
                    key={c}
                    className="rounded-pill border border-line bg-canvas px-2.5 py-1 text-xs font-medium text-navy-700"
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>

            {/* right — key visual showcase */}
            <div className="relative">
              <div className="overflow-hidden rounded-card border border-onyx-line bg-onyx shadow-pop">
                <div className="relative aspect-[1280/768]">
                  <Image
                    src={v.illu}
                    alt={`Adamant — ${v.name} key visual`}
                    fill
                    priority
                    sizes="(min-width: 1024px) 52vw, 100vw"
                    className="object-cover"
                  />
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-onyx/50 via-transparent to-transparent"
                    aria-hidden
                  />
                </div>
              </div>
              <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-pill bg-onyx/80 px-3 py-1.5 text-xs font-medium text-onyx-ink backdrop-blur">
                Key visual · {v.name}
              </span>
              <span className="absolute right-3 top-3 rounded-pill bg-onyx/80 px-3 py-1.5 text-xs font-semibold text-onyx-ink backdrop-blur">
                {v.index} / 03
              </span>
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------- Compare strip */}
      <Container className="py-14 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Compare directions</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              Three ways to wear the name
            </h2>
          </div>
          <p className="max-w-sm text-sm text-muted">
            Same product, three identities. Tap a card to preview its logo and key visual in the
            hero above.
          </p>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {VARIANTS.map((variant, i) => {
            const selected = i === active;
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={selected}
                className={`card group flex flex-col items-start p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-pop ${
                  selected ? "ring-2 ring-brand-500" : ""
                }`}
              >
                <span className="relative h-16 w-16 overflow-hidden rounded-2xl ring-1 ring-line">
                  <Image
                    src={variant.logo}
                    alt={`Adamant — ${variant.name} logo mark`}
                    width={64}
                    height={64}
                    className="h-full w-full scale-[1.08] object-cover"
                  />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-navy-800">{variant.name}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{variant.concept}</p>
                <span
                  className={`mt-4 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] ${
                    selected ? "text-brand-accent" : "text-muted"
                  }`}
                >
                  {selected ? "Previewing" : "Preview"}
                  {!selected && (
                    <ArrowRight
                      width={14}
                      height={14}
                      className="transition-transform group-hover:translate-x-0.5"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Container>

      {/* --------------------------------------------------------- Next step */}
      <section className="border-t border-line bg-onyx">
        <Container className="py-12">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">
                Next step
              </span>
              <h2 className="mt-2 max-w-xl text-xl font-semibold leading-snug text-white">
                Pick a direction — we&apos;ll build the full Adamant landing page around it.
              </h2>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
            >
              See the product
              <ArrowRight width={17} height={17} />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
