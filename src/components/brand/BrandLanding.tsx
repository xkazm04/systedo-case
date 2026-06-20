import Image from "next/image";
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { ArrowRight, Gauge, Sparkles, Target } from "@/components/icons";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

/* ---------------------------------------------------------------------------
   Adamant — homepage (Monolith direction)
   The chosen brand direction: an unbreakable obsidian monument. The hero uses
   the wide monolith key visual as a full-bleed background decoration, faded so
   the headline stays legible. Below, the real product surfaces. The site-wide
   subtle facet pattern lives on <main> (see globals.css .bg-facets).
--------------------------------------------------------------------------- */

const CHANNELS = ["Google Ads", "Sklik", "Meta", "TikTok"];

const FEATURES = [
  {
    href: "/dashboard",
    icon: Gauge,
    title: "Performance dashboard",
    blurb:
      "Every channel, cost and conversion in one faceted view — period deltas, goal pacing and auto-generated insights.",
  },
  {
    href: "/kampane",
    icon: Target,
    title: "Campaign intelligence",
    blurb:
      "Triage what needs attention, defend your ROAS targets and grade every campaign with grounded AI evaluations.",
  },
  {
    href: "/ai-asistent",
    icon: Sparkles,
    title: "AI ad studio",
    blurb:
      "Generate PPC ads, SEO briefs and analysis grounded in your real numbers — with Google Ads & Sklik limit checks.",
  },
];

const T = {
  cs: {
    proofRoas: "ROAS portfolia",
    proofPno: "PNO · cíl {goal}",
    proofRevenue: "obrat připsaný marketingu",
    proofRevenueDelta: "obrat vs. předchozí období",
  },
  en: {
    proofRoas: "Portfolio ROAS",
    proofPno: "PNO · target {goal}",
    proofRevenue: "revenue attributed to marketing",
    proofRevenueDelta: "revenue vs. prior period",
  },
} as const;

export default async function BrandLanding() {
  const t = await getT(T);

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
          <div className="max-w-xl">
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
                  AI ad intelligence
                </p>
              </div>
            </div>

            <span className="mt-7 inline-flex items-center gap-2 rounded-pill border border-onyx-line bg-onyx-soft/60 px-3 py-1.5 text-xs font-semibold text-brand-300">
              <Sparkles width={13} height={13} />A rare breed in adtech
            </span>

            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Stand adamant.
              <br />
              <span className="text-brand-300">Ads that never crack.</span>
            </h1>

            <p className="mt-5 max-w-lg text-lg leading-relaxed text-onyx-muted">
              AI ad intelligence for e-shops and agencies — measure performance, triage campaigns
              and generate the ads, all grounded in your own Google Ads, Sklik, Meta and TikTok data.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              {/* Primary = the frictionless, no-login look (a prospect wants to see it
                  before signing in); "Start free" → the app is the secondary action. */}
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 shadow-card transition-[background-color,transform] hover:bg-brand-400 active:scale-[0.99]"
              >
                See it work
                <ArrowRight width={17} height={17} />
              </Link>
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-pill border border-onyx-line bg-onyx-soft/40 px-5 py-3 text-sm font-semibold text-onyx-ink transition-colors hover:border-brand-400 hover:text-brand-200"
              >
                Start free
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-2 text-sm text-onyx-muted">
              <span className="font-medium">Works across</span>
              {CHANNELS.map((c) => (
                <span
                  key={c}
                  className="rounded-pill border border-onyx-line bg-onyx-soft/40 px-2.5 py-1 text-xs font-medium text-onyx-ink"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* --------------------------------------------------------- Product */}
      <Container className="py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>The workspace</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              Everything you need to be adamant
            </h2>
          </div>
          <p className="max-w-md text-sm text-muted">
            Three surfaces, one source of truth. Measure performance, defend your campaigns and
            create the ads — all grounded in the same data.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <Link
                key={f.href}
                href={f.href}
                className="card group flex flex-col p-6 transition-all hover:-translate-y-1 hover:shadow-pop active:translate-y-0 active:scale-[0.99]"
              >
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-accent transition-colors group-hover:bg-brand-600 group-hover:text-white">
                  <Icon width={22} height={22} />
                </span>
                <h3 className="mt-5 text-lg font-semibold text-navy-800">{f.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{f.blurb}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent">
                  Open
                  <ArrowRight
                    width={16}
                    height={16}
                    className="transition-transform group-hover:translate-x-1"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </Container>

      {/* ----------------------------------------------------------- Proof */}
      <section className="border-y border-line bg-brand-50/40">
        <Container className="py-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-brand-accent">
                Proof
              </p>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
                On the case-study account, last 90 days
              </h2>
            </div>
            <p className="max-w-md text-sm text-muted">
              The same numbers the dashboard renders for {snap.client.name} ({snap.client.domain}) —
              outcomes, not claims. Illustrative case-study data.
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
              Be adamant about your ads.
            </h2>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
            >
              See it work
              <ArrowRight width={17} height={17} />
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
