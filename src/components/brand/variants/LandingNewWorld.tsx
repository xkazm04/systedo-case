import Image from "next/image";
import Link from "next/link";
import { buildSnapshot } from "@/lib/snapshot";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact, fmtInt, fmtDateShort } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";

/*
<!--
THESIS: Generation is downstream of measurement, so the page IS a measurement.
  Refuses the category skeleton (dark hero → eyebrow pill → chip strip → four-stat
  band → dark CTA) and refuses the incumbent Monolith's picture-of-a-rock.
OWN-WORLD: The levelling run. A warm field-sheet ground ruled in graphite, one onyx
  instrument plate bolted into it, mono measurement notation, and four colour roles:
  field, graphite, OBSERVED teal (only ever on a measured value), OUT-OF-TOLERANCE
  coral (rare). Onyx carries the single dark mass.
STORY: The visitor sees a real account read against a real tolerance, sees which
  days and which channel broke it, then sees what gets written from those numbers.
FIRST VIEWPORT: Left, the sheet head — headline, plain offer, two actions, a ruled
  three-row register. Right, the onyx staff reading PNO against the goal line.
FORM: The levelling run — candidate 5 of the grounded list, staged as the run's own
  traverse (the dealt synchronized-array staging was refused: a traverse is chained,
  not simultaneous). Seed key b0db05a4.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish
  review, the verdict, and DESIGN.md
-->
*/

/** Adamant landing — VARIANT B, "The Level Run".
 *
 *  A replacement visual world. Surveying, not sculpture: a levelling run reads a
 *  fixed point, carries the reading station to station, flags where the run failed
 *  to close, and only then sets out the stakes. That is the product's own loop
 *  (measure → triage → generate), used here as the page's spine rather than as a
 *  subordinate clause in a subhead.
 *
 *  Every figure comes from the real buildSnapshot("90d") and the shared formatters.
 *  Channel support tiers are stated at their true level AND drawn (tick density =
 *  reading frequency), so the page cannot imply parity even at a glance.
 */

const CSS = `
.nw {
  /* The token set has no warm ground and no secondary ink calibrated for one, so
     the sheet's four surface values are defined here, scoped to this page. */
  --nw-field: #f2eee5;
  --nw-field-2: #e9e4d8;
  --nw-rule: rgba(13, 26, 36, 0.16);
  --nw-rule-soft: rgba(13, 26, 36, 0.08);
  --nw-muted: #4f5c66;
}
html[data-theme="dark"] .nw {
  --nw-field: #16140f;
  --nw-field-2: #1e1b14;
  --nw-rule: rgba(240, 231, 210, 0.20);
  --nw-rule-soft: rgba(240, 231, 210, 0.10);
  --nw-muted: #9fadb9;
}
@media (prefers-color-scheme: dark) {
  html:not([data-theme="light"]) .nw {
    --nw-field: #16140f;
    --nw-field-2: #1e1b14;
    --nw-rule: rgba(240, 231, 210, 0.20);
    --nw-rule-soft: rgba(240, 231, 210, 0.10);
    --nw-muted: #9fadb9;
  }
}
.nw-field { background-color: var(--nw-field); }
.nw-field-2 { background-color: var(--nw-field-2); }

/* The sheet ruling — the levelling book's own paper. It rides on its own inert
   overlay layer rather than on the section, so no text ever sits on a
   gradient-bearing box. */
.nw-ruling {
  background-image: repeating-linear-gradient(
    to bottom,
    var(--nw-rule-soft) 0,
    var(--nw-rule-soft) 1px,
    transparent 1px,
    transparent 9px
  );
}

/* ---- One authored moment: the run closes. --------------------------------
   In the first viewport, and only there, the staff's graduations draw down the
   rule, the tolerance band rises from the datum, and the reading settles onto its
   measured position. One orchestrated beat rather than an entrance per section.
   Every animation starts from an already-legible state: no text is ever hidden. */
@keyframes nwDrawIn { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes nwBandUp { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes nwSettle { from { transform: translateY(22px); } to { transform: none; } }

.nw-draw { stroke-dasharray: 1; animation: nwDrawIn 1.15s cubic-bezier(0.16, 1, 0.3, 1) both; }
.nw-band { transform-box: fill-box; transform-origin: bottom center; animation: nwBandUp 0.85s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both; }
.nw-settle { animation: nwSettle 0.9s cubic-bezier(0.16, 1, 0.3, 1) 0.34s both; }
.nw-hatch { opacity: 0; }

/* Reduced motion is not a kill switch here. The run is presented already closed,
   and the sweep that filled the tolerance band is replaced by a permanent 60°
   hatch, so the band still reads as a swept region rather than a flat block.
   Hierarchy and every state change survive; only the travel is removed. */
@media (prefers-reduced-motion: reduce) {
  .nw-draw, .nw-band, .nw-settle {
    animation: none;
    stroke-dashoffset: 0;
    transform: none;
  }
  .nw-band { transform: scaleY(1); }
  .nw-hatch { opacity: 1; }
}
`;

/* ---------------------------------------------------------------- copy table */

const T = {
  cs: {
    tagline: "AI reklamní inteligence",
    h1a: "Nejdřív změřit.",
    h1b: "Pak vytyčit.",
    lede:
      "Adamant je pracovní prostor, kde se reklama nejprve změří a teprve pak píše. Čte živá data z Google Ads, pojmenuje, co drží a co odtéká, a ze stejných čísel vygeneruje inzeráty, články i příspěvky.",
    ctaPrimary: "Otevřít dashboard",
    ctaSecondary: "Přejít do aplikace",

    regClient: "Klient",
    regPeriod: "Období",
    regSource: "Zdroj dat",
    regSourceValue: "Case-study dataset",
    stamp: "Ilustrativní data case study",

    bookRoas: "ROAS portfolia",
    bookRevenue: "Obrat připsaný marketingu",
    bookDelta: "Změna obratu proti předchozímu období",

    instrTitle: "Odečet PNO proti cíli",
    instrRead: "naměřeno",
    instrTarget: "cíl",
    instrIn: "v toleranci",
    instrOut: "mimo toleranci",
    instrAlt: "Měřítko PNO. Naměřeno {read}, cíl {goal}. Stav: {state}.",

    s1Title: "Měření",
    s1Lede:
      "Co Adamant skutečně odečítá a jak často. Úroveň napojení je u každého kanálu uvedená, ne naznačená.",
    s1ConnTitle: "Napojení kanálů",
    s1ConnKey:
      "Hustota značek na lince je hustota odečtů. Živý datový konektor má jediný kanál: Google Ads.",
    s1TableTitle: "Naměřený mix kanálů · posledních 90 dní",
    s1TableNote:
      "Čísla z case-study datasetu klienta {client} ({domain}): stejná, jaká vykresluje dashboard. Ilustrativní data, ne výsledky zákazníka.",
    colChannel: "Kanál",
    colShare: "Podíl obratu",
    colPno: "PNO",
    colRoas: "ROAS",
    colDelta: "Změna obratu",

    s2Title: "Odchylka",
    s2Lede:
      "Měření samo nic nespraví. Adamant hlásí dny, které vybočily z očekávání, a kanál, který odtéká, dřív než se napíše jediný inzerát.",
    s2ProfileTitle: "Průběh období · vyznačené odchylky",
    s2ProfileAlt: "Časová osa období s vyznačenými odchylkami, označených dnů: {n}.",
    s2Empty: "V tomto období engine neoznačil žádnou odchylku.",
    colDate: "Datum",
    colWhat: "Co",
    colObserved: "Naměřeno",
    colExpected: "Očekáváno",
    colDeviation: "Odchylka",
    kSpike: "prudký nárůst",
    kDrop: "propad",
    kOutage: "výpadek",
    kBreach: "překročení cíle PNO",
    mVisits: "návštěvy",
    mCost: "náklady",
    mConversions: "konverze",
    mRevenue: "obrat",
    mPno: "PNO",
    mCpc: "cena za proklik",
    mCtr: "CTR",
    mAov: "hodnota objednávky",
    mRoas: "ROAS",
    mClicks: "prokliky",
    mImpressions: "zobrazení",
    mProfit: "zisk",
    mCr: "konverzní poměr",
    s2FunnelTitle: "Rozklad změny obratu",
    s2FunnelLine: "Obrat {delta}. Hlavní tahoun: {driver}, {share} podílu na změně.",
    dTraffic: "návštěvnost",
    dConversion: "konverzní poměr",
    dAov: "průměrná hodnota objednávky",
    s2WorstTitle: "Kanál mimo toleranci",
    s2WorstLine: "PNO {pno} proti cíli {goal} · ROAS {roas} · obrat {delta}",
    s2WorstNote:
      "Tohle je rozhodnutí o rozpočtu, ne o textu inzerátu. Proto stojí před generováním, ne za ním.",

    s3Title: "Vytyčení",
    s3Lede:
      "Teprve tady se generuje. Každý výstup nese, z čeho byl vyměřen. Generátor bez opory v datech je jiný, slabší produkt.",
    s3Grounded: "Vyměřeno z",

    dashLabel: "Dashboard",
    dashGround: "Denní data účtu",
    dashText:
      "Výkon za zvolené období, PNO proti cíli, rozpad na kanály a vyznačené anomálie, aniž byste sami četli grafy.",
    campLabel: "Kampaně",
    campGround: "Kampaně z Google Ads",
    campText:
      "Srovnání kampaní podle typu s vyhodnocením, které pojmenuje, co škrtnout a co posílit.",
    aiLabel: "AI asistent",
    aiGround: "Naměřený výkon a katalog",
    aiText:
      "Inzeráty, obsahový brief a analýza výkonu, psané proti číslům účtu, ne do prázdného promptu.",
    artLabel: "Článek",
    artGround: "Klíčová slova a katalog",
    artText:
      "Hotový článek pro web klienta, se strukturou a prolinkováním, připravený k publikaci.",

    closeTitle: "Stůjte pevně.",
    closeLine:
      "Generování je důsledek měření. Když se změní čísla, změní se i to, co Adamant napíše.",
    closeRead: "Uzávěr pořadu · PNO {pno} · cíl {goal} · {state}",
    closeStamp:
      "Všechna čísla na této stránce pocházejí z ilustrativního case-study datasetu klienta {client}. Nejde o výsledky zákazníka.",
  },
  en: {
    tagline: "AI ad intelligence",
    h1a: "Measure first.",
    h1b: "Then set out.",
    lede:
      "Adamant is a workspace where advertising is measured before it is written. It reads live Google Ads data, names what is holding and what is leaking, and generates the ads, articles and posts from those same numbers.",
    ctaPrimary: "Open the dashboard",
    ctaSecondary: "Go to the app",

    regClient: "Client",
    regPeriod: "Period",
    regSource: "Data source",
    regSourceValue: "Case-study dataset",
    stamp: "Illustrative case-study data",

    bookRoas: "Portfolio ROAS",
    bookRevenue: "Revenue attributed to marketing",
    bookDelta: "Revenue change vs. prior period",

    instrTitle: "Reading: PNO against target",
    instrRead: "observed",
    instrTarget: "target",
    instrIn: "within tolerance",
    instrOut: "out of tolerance",
    instrAlt: "PNO staff. Observed {read}, target {goal}. State: {state}.",

    s1Title: "Observation",
    s1Lede:
      "What Adamant actually reads, and how often. Each channel's level of support is stated, never implied.",
    s1ConnTitle: "Channel connections",
    s1ConnKey:
      "Tick density on the line is reading frequency. Exactly one channel has a live data connector: Google Ads.",
    s1TableTitle: "Observed channel mix · last 90 days",
    s1TableNote:
      "Figures from the case-study dataset for {client} ({domain}): the same ones the dashboard renders. Illustrative data, not customer results.",
    colChannel: "Channel",
    colShare: "Revenue share",
    colPno: "PNO",
    colRoas: "ROAS",
    colDelta: "Revenue change",

    s2Title: "Misclosure",
    s2Lede:
      "Measuring fixes nothing on its own. Adamant flags the days that left the expected band, and the channel that is bleeding, before a single ad is written.",
    s2ProfileTitle: "Period run · flagged deviations",
    s2ProfileAlt: "Timeline of the period with flagged deviations, marked days: {n}.",
    s2Empty: "The engine flagged no deviation in this period.",
    colDate: "Date",
    colWhat: "What",
    colObserved: "Observed",
    colExpected: "Expected",
    colDeviation: "Deviation",
    kSpike: "spike",
    kDrop: "drop",
    kOutage: "outage",
    kBreach: "PNO target breach",
    mVisits: "visits",
    mCost: "cost",
    mConversions: "conversions",
    mRevenue: "revenue",
    mPno: "PNO",
    mCpc: "cost per click",
    mCtr: "CTR",
    mAov: "order value",
    mRoas: "ROAS",
    mClicks: "clicks",
    mImpressions: "impressions",
    mProfit: "profit",
    mCr: "conversion rate",
    s2FunnelTitle: "Revenue change, decomposed",
    s2FunnelLine: "Revenue {delta}. Dominant driver: {driver}, {share} of the move.",
    dTraffic: "traffic",
    dConversion: "conversion rate",
    dAov: "average order value",
    s2WorstTitle: "Channel out of tolerance",
    s2WorstLine: "PNO {pno} against a {goal} target · ROAS {roas} · revenue {delta}",
    s2WorstNote:
      "That is a budget decision, not a copy decision. Which is why it sits before generation, not after it.",

    s3Title: "Setting out",
    s3Lede:
      "Only here does anything get generated. Every output carries what it was measured from. A generator with nothing under it is a different, lesser product.",
    s3Grounded: "Measured from",

    dashLabel: "Dashboard",
    dashGround: "Daily account data",
    dashText:
      "Performance for the chosen period, PNO against target, the channel breakdown and the flagged anomalies, without reading charts yourself.",
    campLabel: "Campaigns",
    campGround: "Google Ads campaigns",
    campText:
      "Campaigns compared by type, with an assessment that names what to cut and what to push.",
    aiLabel: "AI assistant",
    aiGround: "Observed performance and catalog",
    aiText:
      "Ad copy, a content brief and a performance read, written against the account's numbers rather than into an empty prompt box.",
    artLabel: "Article",
    artGround: "Keywords and catalog",
    artText:
      "A finished article for the client's site, structured and interlinked, ready to publish.",

    closeTitle: "Stand adamant.",
    closeLine:
      "Generation is a consequence of measurement. When the numbers move, what Adamant writes moves with them.",
    closeRead: "Run closed · PNO {pno} · target {goal} · {state}",
    closeStamp:
      "Every figure on this page comes from the illustrative case-study dataset for {client}. These are not customer results.",
  },
} as const;

/* --------------------------------------------------------------- connections */

/** The product's real, tiered channel support. `reads` is the number of tick
 *  marks drawn on that channel's line — reading frequency made visible, so a
 *  publishing-only surface can never look like a measured one. */
const CONNECTIONS = [
  {
    name: "Google Ads",
    reads: 26,
    flow: "in" as const,
    level: { cs: "živý sync dat", en: "live data sync" },
    note: {
      cs: "Jediný kanál se živým datovým konektorem. Výkon se odečítá naplánovaným synchronizačním během.",
      en: "The only channel with a live data connector. Performance is read on a scheduled sync.",
    },
  },
  {
    name: "Sklik",
    reads: 4,
    flow: "check" as const,
    level: { cs: "kontrola inzerátů", en: "ad-copy checks" },
    note: {
      cs: "Kontrola délek a limitů inzerátů. Výkonnostní data se odsud neingestují.",
      en: "Ad-copy length and limit checks. No performance data is ingested from here.",
    },
  },
  {
    name: "Meta",
    reads: 0,
    flow: "out" as const,
    level: { cs: "publikování", en: "publishing" },
    note: {
      cs: "Publikační plocha. Příspěvky odcházejí ven, měření se odsud nevrací.",
      en: "A publishing surface. Posts go out; no measurement comes back.",
    },
  },
  {
    name: "TikTok",
    reads: 0,
    flow: "out" as const,
    level: { cs: "publikování", en: "publishing" },
    note: {
      cs: "Publikační plocha. Příspěvky odcházejí ven, měření se odsud nevrací.",
      en: "A publishing surface. Posts go out; no measurement comes back.",
    },
  },
];

/* ------------------------------------------------------------------ helpers */

const DAY = 86_400_000;
const PERIOD_DAYS = 90;

const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayIndex = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/* Palette roles used on the warm field. Deliberately one ramp step darker than
   the app's usual picks: brand-500 / coral-500 / navy-300 fall under 3:1 against
   this ground, so every information-bearing mark uses the step that clears it. */
const OBSERVED = "var(--color-brand-700)";
const DEVIATION = "var(--color-coral-600)";
const INERT = "var(--color-navy-400)";

/* ================================================================= component */

export default async function LandingNewWorld() {
  const t = await getT(T);
  const locale = await getServerLocale();

  const snap = buildSnapshot("90d");

  // ---- the reading: PNO against the account's own goal ---------------------
  const pno = snap.current.pno;
  const goal = snap.goalPno;
  const inTolerance = pno <= goal;
  const step = 0.05;
  const maxP = Math.max(Math.ceil(Math.max(goal * 2, pno * 1.5) / step) * step, step * 4);
  const ticks: number[] = [];
  for (let v = 0; v <= maxP + 1e-9; v += step) ticks.push(Number(v.toFixed(4)));

  const TOP = 26;
  const BOT = 300;
  const yOf = (p: number) => BOT - (Math.min(p, maxP) / maxP) * (BOT - TOP);

  // ---- the run profile: deviations the engine flagged, windowed to 90 days --
  const start = isoOf(Date.parse(`${snap.asOf}T00:00:00Z`) - (PERIOD_DAYS - 1) * DAY);
  const windowed = snap.anomalies.filter((a) => a.date >= start && a.date <= snap.asOf);
  const byDate = new Map<string, (typeof windowed)[number]>();
  for (const a of windowed) {
    const prev = byDate.get(a.date);
    if (!prev || Math.abs(a.z) > Math.abs(prev.z)) byDate.set(a.date, a);
  }
  const flags = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const worstDays = [...flags].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 4);

  // ---- the channel that is out of tolerance --------------------------------
  const spending = snap.channels.filter((c) => c.cost > 0);
  const worstChannel = spending.length ? spending.reduce((w, c) => (c.pno > w.pno ? c : w)) : null;

  const kindLabel = (k: string) =>
    k === "spike" ? t("kSpike") : k === "drop" ? t("kDrop") : k === "outage" ? t("kOutage") : t("kBreach");
  const METRIC_KEY: Record<string, keyof (typeof T)["cs"]> = {
    visits: "mVisits",
    cost: "mCost",
    conversions: "mConversions",
    revenue: "mRevenue",
    pno: "mPno",
    cpc: "mCpc",
    ctr: "mCtr",
    aov: "mAov",
    roas: "mRoas",
    clicks: "mClicks",
    impressions: "mImpressions",
    profit: "mProfit",
    cr: "mCr",
  };
  const MONEY = new Set(["revenue", "cost", "cpc", "aov", "profit"]);
  const RATIO = new Set(["pno", "ctr", "cr"]);
  const metricLabel = (m: string) => (METRIC_KEY[m] ? t(METRIC_KEY[m]) : m);
  const valueOf = (metric: string, v: number) =>
    MONEY.has(metric)
      ? fmtCZKCompact(v)
      : RATIO.has(metric)
        ? fmtPct(v)
        : metric === "roas"
          ? fmtMultiple(v)
          : fmtInt(v);

  const destinations = [
    { href: "/dashboard", label: t("dashLabel"), ground: t("dashGround"), text: t("dashText") },
    { href: "/kampane", label: t("campLabel"), ground: t("campGround"), text: t("campText") },
    { href: "/ai-asistent", label: t("aiLabel"), ground: t("aiGround"), text: t("aiText") },
    { href: "/clanek", label: t("artLabel"), ground: t("artGround"), text: t("artText") },
  ];

  const book = [
    { label: t("bookRoas"), value: fmtMultiple(snap.current.roas) },
    { label: t("bookRevenue"), value: fmtCZKCompact(snap.current.revenue) },
    { label: t("bookDelta"), value: fmtSignedPct(snap.delta.revenue) },
  ];

  const rule = "border-[color:var(--nw-rule)]";
  const ruleSoft = "border-[color:var(--nw-rule-soft)]";
  const muted = "text-[color:var(--nw-muted)]";
  const colHead = `py-3 pr-3 font-mono text-xs font-normal uppercase tracking-[0.1em] ${muted}`;

  return (
    <div className="nw nw-field text-ink">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ============================================================ Station 0
          The fixed point: the sheet head on the left, the instrument on the right. */}
      <section className={`border-b ${rule}`}>
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:py-20">
          {/* --- sheet head --- */}
          <div>
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-md bg-onyx text-onyx-ink ring-1 ring-onyx-line">
                <Image
                  src="/brand/logo-monolith.png"
                  alt="Adamant"
                  width={40}
                  height={40}
                  className="h-full w-full scale-[1.08] object-cover"
                />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-semibold leading-tight tracking-tight text-ink">Adamant</span>
                <span className={`block font-mono text-xs uppercase tracking-[0.14em] ${muted}`}>
                  {t("tagline")}
                </span>
              </span>
            </div>

            <h1 className="mt-8 text-4xl font-semibold leading-[1.04] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
              {t("h1a")}
              <br />
              <span className="text-brand-accent">{t("h1b")}</span>
            </h1>

            <p className="mt-6 max-w-[36rem] text-base leading-relaxed text-ink">{t("lede")}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2.5 rounded-md bg-onyx px-5 py-3 text-sm font-semibold text-onyx-ink transition-colors hover:bg-onyx-soft"
              >
                {t("ctaPrimary")}
                <span aria-hidden className="font-mono text-brand-300">
                  →
                </span>
              </Link>
              <Link
                href="/app"
                className={`inline-flex items-center gap-2 rounded-md border px-5 py-3 text-sm font-semibold text-ink transition-colors ${rule} hover:border-brand-700 hover:text-brand-800`}
              >
                {t("ctaSecondary")}
              </Link>
            </div>

            {/* the field-book register: label left, measured value right */}
            <dl className={`mt-10 max-w-[34rem] border-t ${rule}`}>
              {book.map((row) => (
                <div
                  key={row.label}
                  className={`flex items-baseline justify-between gap-6 border-b py-2.5 ${ruleSoft}`}
                >
                  <dt className={`text-sm ${muted}`}>{row.label}</dt>
                  <dd className="tnum shrink-0 font-mono text-base font-semibold text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* --- the instrument: an onyx plate bolted into the sheet --- */}
          <div className="lg:pt-4">
            <div className="overflow-hidden rounded-lg bg-onyx text-onyx-ink ring-1 ring-onyx-line">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-onyx-line px-5 py-3.5">
                <h2 className="text-sm font-semibold text-onyx-ink">{t("instrTitle")}</h2>
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-onyx-muted">
                  {snap.client.name} · {snap.periodLabel}
                </p>
              </div>

              <div className="px-3 pb-4 pt-2 sm:px-5">
                <svg
                  viewBox="0 0 300 330"
                  className="h-auto w-full"
                  role="img"
                  aria-label={t("instrAlt", {
                    read: fmtPct(pno),
                    goal: fmtPct(goal, 0),
                    state: inTolerance ? t("instrIn") : t("instrOut"),
                  })}
                >
                  <defs>
                    <pattern
                      id="nw-hatch"
                      width="8"
                      height="8"
                      patternUnits="userSpaceOnUse"
                      patternTransform="rotate(60)"
                    >
                      <line x1="0" y1="0" x2="0" y2="8" stroke="var(--color-brand-400)" strokeWidth="1" opacity="0.55" />
                    </pattern>
                  </defs>

                  {/* in-tolerance band: datum up to the target line */}
                  <g className="nw-band">
                    <rect
                      x={66}
                      y={yOf(goal)}
                      width={214}
                      height={BOT - yOf(goal)}
                      fill="var(--color-brand-500)"
                      opacity={0.14}
                    />
                    <rect
                      className="nw-hatch"
                      x={66}
                      y={yOf(goal)}
                      width={214}
                      height={BOT - yOf(goal)}
                      fill="url(#nw-hatch)"
                    />
                  </g>

                  {/* the staff: graduations drawing down the rule */}
                  <path
                    className="nw-draw"
                    pathLength={1}
                    d={`M66 ${TOP} L66 ${BOT}`}
                    stroke="var(--color-onyx-muted)"
                    strokeWidth={1.5}
                    fill="none"
                  />
                  <path
                    className="nw-draw"
                    pathLength={1}
                    d={ticks.map((v) => `M50 ${yOf(v)} L66 ${yOf(v)}`).join(" ")}
                    stroke="var(--color-onyx-muted)"
                    strokeWidth={1}
                    fill="none"
                  />
                  {ticks.map((v) => (
                    <text
                      key={v}
                      x={44}
                      y={yOf(v) + 4}
                      textAnchor="end"
                      fill="var(--color-onyx-muted)"
                      fontSize={12}
                      fontFamily="var(--font-mono)"
                    >
                      {fmtPct(v, 0)}
                    </text>
                  ))}

                  {/* the target line */}
                  <line
                    x1={66}
                    y1={yOf(goal)}
                    x2={280}
                    y2={yOf(goal)}
                    stroke="var(--color-coral-400)"
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                  <text
                    x={280}
                    y={yOf(goal) - 10}
                    textAnchor="end"
                    fill="var(--color-coral-400)"
                    fontSize={14}
                    fontFamily="var(--font-mono)"
                  >
                    {t("instrTarget")} {fmtPct(goal, 0)}
                  </text>

                  {/* the settled reading */}
                  <g className="nw-settle">
                    <line x1={66} y1={yOf(pno)} x2={280} y2={yOf(pno)} stroke="var(--color-brand-300)" strokeWidth={2} />
                    <path d={`M66 ${yOf(pno)} l14 -7 l0 14 z`} fill="var(--color-brand-300)" />
                    <text
                      x={280}
                      y={110}
                      textAnchor="end"
                      fill="var(--color-brand-300)"
                      fontSize={40}
                      fontWeight={600}
                      fontFamily="var(--font-mono)"
                    >
                      {fmtPct(pno)}
                    </text>
                    <text
                      x={280}
                      y={132}
                      textAnchor="end"
                      fill="var(--color-onyx-muted)"
                      fontSize={14}
                      fontFamily="var(--font-mono)"
                    >
                      {t("instrRead")}
                    </text>
                  </g>

                  {/* datum */}
                  <line x1={50} y1={BOT} x2={280} y2={BOT} stroke="var(--color-onyx-line)" strokeWidth={1} />
                </svg>

                <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 font-mono text-xs uppercase tracking-[0.12em]">
                  <span className={inTolerance ? "text-brand-300" : "text-coral-400"}>
                    {inTolerance ? t("instrIn") : t("instrOut")}
                  </span>
                  <span aria-hidden className="text-onyx-line">·</span>
                  <span className="text-onyx-muted">{t("stamp")}</span>
                </p>
              </div>
            </div>

            {/* the run's particulars */}
            <dl className={`mt-4 grid grid-cols-1 gap-x-6 border-t sm:grid-cols-3 ${rule}`}>
              {[
                { k: t("regClient"), v: `${snap.client.name} · ${snap.client.domain}` },
                { k: t("regPeriod"), v: `${snap.periodLabel} · ${fmtDateShort(snap.asOf)}` },
                { k: t("regSource"), v: t("regSourceValue") },
              ].map((row) => (
                <div key={row.k} className={`border-b py-2.5 sm:border-b-0 ${ruleSoft}`}>
                  <dt className={`font-mono text-xs uppercase tracking-[0.12em] ${muted}`}>{row.k}</dt>
                  <dd className="mt-0.5 text-sm text-ink">{row.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ============================================================ Station 1 */}
      <section className={`nw-field-2 relative border-b ${rule}`}>
        <span aria-hidden className="nw-ruling pointer-events-none absolute inset-0" />
        <div className="relative mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <StationHead title={t("s1Title")} lede={t("s1Lede")} />

          {/* --- connections: the tier is drawn, not only written --- */}
          <h3 className={`mt-12 font-mono text-xs uppercase tracking-[0.16em] ${muted}`}>{t("s1ConnTitle")}</h3>
          <ul className={`mt-3 border-t ${rule}`}>
            {CONNECTIONS.map((c) => (
              <li
                key={c.name}
                className={`grid grid-cols-1 items-start gap-x-6 gap-y-2 border-b py-4 lg:grid-cols-[8rem_13rem_1fr] ${ruleSoft}`}
              >
                <span className="text-base font-semibold text-ink">{c.name}</span>

                <div>
                  <ConnectionLine reads={c.reads} flow={c.flow} />
                  <p className="mt-1.5 font-mono text-xs uppercase tracking-[0.1em] text-ink">
                    {c.level[locale] ?? c.level.en}
                  </p>
                </div>

                <p className={`max-w-[36rem] text-sm leading-relaxed ${muted}`}>{c.note[locale] ?? c.note.en}</p>
              </li>
            ))}
          </ul>
          <p className={`mt-3 max-w-[36rem] text-sm leading-relaxed ${muted}`}>{t("s1ConnKey")}</p>

          {/* --- the observed mix --- */}
          <h3 className={`mt-14 font-mono text-xs uppercase tracking-[0.16em] ${muted}`}>{t("s1TableTitle")}</h3>
          <div className="mt-3">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">{t("s1TableTitle")}</caption>
              <thead>
                <tr className={`border-y ${rule}`}>
                  <th scope="col" className={colHead}>
                    {t("colChannel")}
                  </th>
                  <th scope="col" className={colHead}>
                    {t("colShare")}
                  </th>
                  <th scope="col" className={`hidden text-right sm:table-cell ${colHead}`}>
                    {t("colPno")}
                  </th>
                  <th scope="col" className={`hidden text-right sm:table-cell ${colHead}`}>
                    {t("colRoas")}
                  </th>
                  <th scope="col" className={`text-right ${colHead} pr-0`}>
                    {t("colDelta")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {snap.channels.map((ch) => {
                  const bad = worstChannel != null && ch.channel === worstChannel.channel;
                  return (
                    <tr key={ch.channel} className={`border-b ${ruleSoft}`}>
                      <th scope="row" className="py-3 pr-3 align-middle text-sm font-medium text-ink">
                        {ch.channel}
                      </th>
                      <td className="py-3 pr-3 align-middle">
                        <span className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className="hidden h-1.5 rounded-[1px] sm:block"
                            style={{
                              width: `${Math.max(2, ch.revenueShare * 100)}%`,
                              backgroundColor: bad ? DEVIATION : OBSERVED,
                            }}
                          />
                          <span className="tnum shrink-0 font-mono text-sm text-ink">{fmtPct(ch.revenueShare, 0)}</span>
                        </span>
                      </td>
                      <td className="tnum hidden py-3 pr-3 text-right align-middle font-mono text-sm text-ink sm:table-cell">
                        {ch.pno > 0 ? fmtPct(ch.pno) : "—"}
                      </td>
                      <td className="tnum hidden py-3 pr-3 text-right align-middle font-mono text-sm text-ink sm:table-cell">
                        {ch.roas > 0 ? fmtMultiple(ch.roas) : "—"}
                      </td>
                      <td className="tnum py-3 text-right align-middle font-mono text-sm text-ink">
                        {ch.delta ? fmtSignedPct(ch.delta.revenue) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={`mt-3 max-w-[36rem] text-sm leading-relaxed ${muted}`}>
            {t("s1TableNote", { client: snap.client.name, domain: snap.client.domain })}
          </p>
        </div>
      </section>

      {/* ============================================================ Station 2 */}
      <section className={`nw-field-2 border-b ${rule}`}>
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <StationHead title={t("s2Title")} lede={t("s2Lede")} />

          <h3 className={`mt-12 font-mono text-xs uppercase tracking-[0.16em] ${muted}`}>{t("s2ProfileTitle")}</h3>

          {flags.length === 0 ? (
            <p className={`mt-3 text-sm ${muted}`}>{t("s2Empty")}</p>
          ) : (
            <>
              <div className={`mt-3 hidden border-y py-4 md:block ${rule}`}>
                <svg
                  viewBox="0 0 900 124"
                  className="h-auto w-full"
                  role="img"
                  aria-label={t("s2ProfileAlt", { n: fmtInt(flags.length) })}
                >
                  <g>
                    <line x1={20} y1={92} x2={880} y2={92} stroke="var(--color-navy-400)" strokeWidth={1.5} />
                    {flags.map((a) => {
                      const x = 20 + (dayIndex(start, a.date) / (PERIOD_DAYS - 1)) * 860;
                      return (
                        <g key={`${a.date}-${a.metric}`}>
                          <line x1={x} y1={40} x2={x} y2={92} stroke={DEVIATION} strokeWidth={1.5} />
                          <FlagHead kind={a.kind} x={x} />
                        </g>
                      );
                    })}
                    <text x={20} y={116} fill="var(--color-navy-400)" fontSize={15} fontFamily="var(--font-mono)">
                      {fmtDateShort(start)}
                    </text>
                    <text
                      x={880}
                      y={116}
                      textAnchor="end"
                      fill="var(--color-navy-400)"
                      fontSize={15}
                      fontFamily="var(--font-mono)"
                    >
                      {fmtDateShort(snap.asOf)}
                    </text>
                  </g>
                </svg>

                {/* the run's key: shape carries kind, so colour is never the only signal */}
                <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                  {(["spike", "drop", "outage", "goal-breach"] as const).map((k) => (
                    <li key={k} className="flex items-center gap-2">
                      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
                        <FlagHead kind={k} x={8} y={4} />
                      </svg>
                      <span className={`text-sm ${muted}`}>{kindLabel(k)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* --- the days read off the run --- */}
              <div className="mt-8">
                <table className="w-full border-collapse text-left">
                  <caption className="sr-only">{t("s2ProfileTitle")}</caption>
                  <thead>
                    <tr className={`border-y ${rule}`}>
                      <th scope="col" className={colHead}>
                        {t("colDate")}
                      </th>
                      <th scope="col" className={colHead}>
                        {t("colWhat")}
                      </th>
                      <th scope="col" className={`hidden text-right sm:table-cell ${colHead}`}>
                        {t("colObserved")}
                      </th>
                      <th scope="col" className={`hidden text-right sm:table-cell ${colHead}`}>
                        {t("colExpected")}
                      </th>
                      <th scope="col" className={`text-right ${colHead} pr-0`}>
                        {t("colDeviation")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstDays.map((a) => {
                      const dev = a.expected > 0 ? (a.observed - a.expected) / a.expected : 0;
                      return (
                        <tr key={`${a.date}-${a.metric}-${a.kind}`} className={`border-b ${ruleSoft}`}>
                          <th
                            scope="row"
                            className="tnum py-3 pr-3 text-left align-middle font-mono text-sm font-normal text-ink"
                          >
                            {fmtDateShort(a.date)}
                          </th>
                          <td className="py-3 pr-3 align-middle text-sm text-ink">
                            {metricLabel(a.metric)} · {kindLabel(a.kind)}
                          </td>
                          <td className="tnum hidden py-3 pr-3 text-right align-middle font-mono text-sm text-ink sm:table-cell">
                            {valueOf(a.metric, a.observed)}
                          </td>
                          <td className={`tnum hidden py-3 pr-3 text-right align-middle font-mono text-sm sm:table-cell ${muted}`}>
                            {valueOf(a.metric, a.expected)}
                          </td>
                          <td className="tnum py-3 text-right align-middle font-mono text-sm font-semibold text-ink">
                            {fmtSignedPct(dev, 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* --- decomposition + the bleeding channel --- */}
          <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-14">
            {snap.funnel && (
              <div>
                <h3 className={`font-mono text-xs uppercase tracking-[0.16em] ${muted}`}>{t("s2FunnelTitle")}</h3>
                <p className="mt-3 max-w-[34rem] text-base leading-relaxed text-ink">
                  {t("s2FunnelLine", {
                    delta: fmtSignedPct(snap.funnel.totalChange),
                    driver:
                      snap.funnel.dominant === "traffic"
                        ? t("dTraffic")
                        : snap.funnel.dominant === "conversion"
                          ? t("dConversion")
                          : t("dAov"),
                    share: fmtPct(snap.funnel.drivers[snap.funnel.dominant].share, 0),
                  })}
                </p>
                <div aria-hidden className="mt-5 flex h-2.5 w-full overflow-hidden rounded-[2px]">
                  {(["traffic", "conversion", "aov"] as const).map((k, i) => (
                    <span
                      key={k}
                      style={{
                        width: `${Math.max(1, snap.funnel!.drivers[k].share * 100)}%`,
                        backgroundColor: i === 0 ? OBSERVED : i === 1 ? "var(--color-brand-800)" : INERT,
                      }}
                    />
                  ))}
                </div>
                <dl className={`mt-4 max-w-[26rem] border-t ${rule}`}>
                  {(["traffic", "conversion", "aov"] as const).map((k) => (
                    <div key={k} className={`flex items-baseline justify-between gap-6 border-b py-2 ${ruleSoft}`}>
                      <dt className={`text-sm ${muted}`}>
                        {k === "traffic" ? t("dTraffic") : k === "conversion" ? t("dConversion") : t("dAov")}
                      </dt>
                      <dd className="tnum shrink-0 font-mono text-sm text-ink">
                        {fmtPct(snap.funnel!.drivers[k].share, 0)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {worstChannel && (
              <div>
                <h3 className={`font-mono text-xs uppercase tracking-[0.16em] ${muted}`}>{t("s2WorstTitle")}</h3>
                <p className="mt-3 flex items-center gap-3 text-2xl font-semibold tracking-tight text-ink">
                  <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
                    <FlagHead kind="goal-breach" x={8} y={4} />
                  </svg>
                  {worstChannel.channel}
                </p>
                <p className="tnum mt-2 font-mono text-sm leading-relaxed text-ink">
                  {t("s2WorstLine", {
                    pno: fmtPct(worstChannel.pno),
                    goal: fmtPct(goal, 0),
                    roas: fmtMultiple(worstChannel.roas),
                    delta: worstChannel.delta ? fmtSignedPct(worstChannel.delta.revenue) : "—",
                  })}
                </p>
                <p className={`mt-4 max-w-[32rem] text-sm leading-relaxed ${muted}`}>{t("s2WorstNote")}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============================================================ Station 3 */}
      <section className={`nw-field border-b ${rule}`}>
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <StationHead title={t("s3Title")} lede={t("s3Lede")} />

          <ul className={`mt-12 border-t ${rule}`}>
            {destinations.map((d) => (
              <li key={d.href}>
                <Link
                  href={d.href}
                  className={`group grid grid-cols-1 items-start gap-x-8 gap-y-2 border-b py-6 transition-colors sm:grid-cols-[13rem_1fr_2rem] ${ruleSoft} hover:bg-[color:var(--nw-field-2)]`}
                >
                  <span className="block">
                    <span className={`block font-mono text-xs uppercase tracking-[0.12em] ${muted}`}>
                      {t("s3Grounded")}
                    </span>
                    <span className="mt-1 block text-sm font-medium text-brand-800">{d.ground}</span>
                  </span>
                  <span className="block">
                    <span className="block text-xl font-semibold tracking-tight text-ink">{d.label}</span>
                    <span className={`mt-1.5 block max-w-[36rem] text-sm leading-relaxed ${muted}`}>{d.text}</span>
                  </span>
                  <span
                    aria-hidden
                    className={`hidden self-center justify-self-end font-mono text-lg transition-colors sm:block ${muted} group-hover:text-brand-800`}
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ================================================================ Close */}
      <section className="bg-onyx text-onyx-ink">
        <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:py-16">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-onyx-ink sm:text-4xl">
                {t("closeTitle")}
              </h2>
              <p className="mt-4 max-w-[36rem] text-base leading-relaxed text-onyx-muted">{t("closeLine")}</p>
              <p className="tnum mt-6 font-mono text-sm tracking-[0.04em] text-brand-300">
                {t("closeRead", {
                  pno: fmtPct(pno),
                  goal: fmtPct(goal, 0),
                  state: inTolerance ? t("instrIn") : t("instrOut"),
                })}
              </p>
            </div>
            <div className="lg:justify-self-end">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2.5 rounded-md bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400"
              >
                {t("ctaPrimary")}
                <span aria-hidden className="font-mono">
                  →
                </span>
              </Link>
            </div>
          </div>
          <p className="mt-10 max-w-[38rem] border-t border-onyx-line pt-5 text-sm leading-relaxed text-onyx-muted">
            {t("closeStamp", { client: snap.client.name })}
          </p>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- sub-components */

/** A station in the run: the word, a rule, and the plain sentence under it. No
 *  eyebrow and no ordinal — the chain carries the sequence by itself. */
function StationHead({ title, lede }: { title: string; lede: string }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-10">
      <h2 className="shrink-0 text-3xl font-semibold tracking-tight text-ink sm:w-[12rem] sm:text-4xl">{title}</h2>
      <div className="min-w-0 flex-1">
        <span aria-hidden className="mb-5 hidden h-px w-full bg-[color:var(--nw-rule)] sm:block" />
        <p className="max-w-[36rem] text-base leading-relaxed text-ink">{lede}</p>
      </div>
    </div>
  );
}

/** The flag head on a levelling run. Shape carries the kind of deviation, so the
 *  key never depends on colour alone. */
function FlagHead({ kind, x, y = 29 }: { kind: string; x: number; y?: number }) {
  if (kind === "outage") {
    return <rect x={x - 4.5} y={y + 1} width={9} height={9} fill="none" stroke={DEVIATION} strokeWidth={2} />;
  }
  if (kind === "spike") return <path d={`M${x} ${y} l6 11 l-12 0 z`} fill={DEVIATION} />;
  if (kind === "drop") return <path d={`M${x} ${y + 12} l6 -11 l-12 0 z`} fill={DEVIATION} />;
  return <path d={`M${x} ${y - 1} l7 7 l-7 7 l-7 -7 z`} fill={DEVIATION} />;
}

/** The connection line for one channel. Tick density IS reading frequency:
 *   - `in`    solid line, dense ticks, an arrow pointing back into the workspace
 *   - `check` solid line, a few caliper marks, no returning data
 *   - `out`   dashed line, no ticks, an arrow pointing away
 */
function ConnectionLine({ reads, flow }: { reads: number; flow: "in" | "check" | "out" }) {
  const W = 200;
  const stroke = flow === "out" ? INERT : OBSERVED;
  const at = (i: number, n: number) => 16 + (i / Math.max(1, n - 1)) * (W - 32);
  return (
    <svg viewBox={`0 0 ${W} 22`} className="h-[22px] w-full max-w-[200px]" aria-hidden>
      <line
        x1={6}
        y1={11}
        x2={W - 6}
        y2={11}
        stroke={stroke}
        strokeWidth={1.5}
        strokeDasharray={flow === "out" ? "5 5" : undefined}
      />
      {reads > 0 &&
        Array.from({ length: reads }, (_, i) => (
          <line
            key={i}
            x1={at(i, reads)}
            y1={flow === "check" ? 3 : 5}
            x2={at(i, reads)}
            y2={flow === "check" ? 19 : 17}
            stroke={stroke}
            strokeWidth={flow === "check" ? 2 : 1.5}
          />
        ))}
      {flow === "out" ? (
        <path d={`M${W - 5} 11 l-9 -5 l0 10 z`} fill={stroke} />
      ) : (
        <path d={`M5 11 l9 -5 l0 10 z`} fill={stroke} />
      )}
    </svg>
  );
}
