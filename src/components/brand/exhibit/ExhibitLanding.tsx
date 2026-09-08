/* ---------------------------------------------------------------------------
   /lp/exhibit — VARIANT B: SPACE. Every fact is a numbered specimen in a gallery.
   Patterns P3 P4 P8 P11 from docs/design/nextgen-landing.md, unblended: no
   pinned stage, no type switch, and deliberately STILL — the only motion is a
   fade on arrival. If this page works, it is because the facts were displayed
   well enough that nobody needed a paragraph.

   References (P8): DESIGN.md (the world); Orbital Garden's exhibition hall
   (R1 — specimen numbers, mono eyebrow with a dot, 280px intro, noise); the
   astra showcase gallery (R1 — the 7 / 5 / 4 column rhythm).

   Seven exhibits: 01 the instrument (the hero), 02 the plan as a histogram,
   03 the five steps as a contact sheet, 04 the registry as a matrix, 05 the
   figures as plates, 06 the channels as a ledger, 07 the door.
--------------------------------------------------------------------------- */
import Link from "next/link";
import { freeChannelFacts } from "@/components/marketing/kanaly/facts";
import { buildSnapshot } from "@/lib/snapshot";
import { performance } from "@/lib/data";
import { fmtMultiple, fmtPct, fmtSignedPct, fmtCZKCompact } from "@/lib/format";
import { EFFORT_LABELS } from "@/components/app/channels/labels";
import { projectTypeMeta } from "@/lib/projects/types";
import { ArrowRight } from "@/components/icons";
import { getServerLocale } from "@/lib/i18n/locale";
import { getT } from "@/lib/i18n/server";
import ExhibitHero from "./ExhibitHero";
import Specimen from "./Specimen";
import ExhibitHistogram from "./ExhibitHistogram";
import ExhibitSheet from "./ExhibitSheet";
import ExhibitMatrix from "./ExhibitMatrix";
import { ExhibitPlates, ExhibitLedger } from "./ExhibitPlates";

const OF = 7;
const DAYS = 90;

const CHANNELS = [
  { name: "Google Ads", level: { cs: "živá synchronizace", en: "live sync" } },
  { name: "Sklik", level: { cs: "kontrola inzerátů", en: "ad-copy checks" } },
  { name: "Meta", level: { cs: "publikování", en: "publishing" } },
  { name: "TikTok", level: { cs: "publikování", en: "publishing" } },
];

const T = {
  cs: {
    eyebrow: "Exponát",
    title1: "Stůjte pevně.",
    title2: "Reklamy, které nepovolí.",
    intro: "AI pro digitální reklamu e-shopů a agentur. Nejdřív kanály zdarma, pak měření, triáž a tvorba reklam nad živými daty z Google Ads.",
    demo: "Ukázková data · fiktivní klient",
    roas: "ROAS portfolia", pno: "PNO · cíl {goal}", revenue: "obrat připsaný marketingu", delta: "obrat vs. předchozí období",
    s2: "Plán kanálů zdarma, seřazený", s2c: "{n} kurátorovaných kanálů; výška je, jak sedí tomuhle podniku, barva je pracnost.",
    s3: "Pět kroků, skutečný výstup každého", s3c: "Adresa, co si Adamant přečetl, tři nejlepší kanály, první kroky, jeden plán.",
    s4: "Co který typ projektu dostane", s4c: "Jedna tečka za modul. E-shop nevidí to, co lead-gen web — a tady je vidět, o kolik.",
    s5: "Na ukázkovém účtu, 90 dní", s5c: "Stejná čísla, jaká vykreslí dashboard pro {client}. Ne výsledky reálného zákazníka.",
    s6: "Funguje napříč", s6c: "Jen to, co je dnes pravda: jedno živé napojení, jedna kontrola, dvě publikační plochy.",
    s7: "Buďte ve své reklamě neoblomní.", start: "Začít zdarma", demoLink: "Živá ukázka",
    f1: "Zadáte adresu webu", f2: "Adamant si web projde", f3: "Dostanete seřazený plán", f4: "Plán si připnete", f5: "Vznikne jeden plán viditelnosti",
    f4more: "{n} prvních kroků u nejlepšího kanálu", f5out: "{families} rodin · {channels} kanálů · 1 tabulka",
  },
  en: {
    eyebrow: "Exhibit",
    title1: "Stand adamant.",
    title2: "Ads that never crack.",
    intro: "Digital advertising AI for e-shops and agencies. Free channels first, then measurement, triage and ad generation over live Google Ads data.",
    demo: "Demo data · fictional client",
    roas: "Portfolio ROAS", pno: "PNO · target {goal}", revenue: "revenue attributed to marketing", delta: "revenue vs. prior period",
    s2: "The free-channel plan, ranked", s2c: "{n} curated channels; height is fit for this business, colour is effort.",
    s3: "Five steps, each one's real output", s3c: "The address, what Adamant read, the top three channels, the first steps, one plan.",
    s4: "What each project type gets", s4c: "One dot per module. An e-shop does not see what a lead-gen site sees — and here you can see by how much.",
    s5: "On the demo account, 90 days", s5c: "The same numbers the dashboard renders for {client}. Not real customer results.",
    s6: "Works across", s6c: "Only what is true today: one live connector, one check, two publishing surfaces.",
    s7: "Be adamant about your ads.", start: "Start free", demoLink: "Live demo",
    f1: "You give it a web address", f2: "Adamant reads the site", f3: "You get a ranked plan", f4: "You pin the plan", f5: "It composes into one plan",
    f4more: "{n} first steps for the top channel", f5out: "{families} families · {channels} channels · 1 table",
  },
} as const;

export default async function ExhibitLanding() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const facts = freeChannelFacts();
  const { demo } = facts;
  const snap = buildSnapshot("90d");
  const top = [...demo.plan].sort((a, b) => b.fit - a.fit);
  const figures = [
    { value: fmtMultiple(snap.current.roas), label: t("roas") },
    { value: fmtPct(snap.current.pno), label: t("pno", { goal: fmtPct(snap.goalPno, 0) }) },
    { value: fmtCZKCompact(snap.current.revenue), label: t("revenue") },
    { value: fmtSignedPct(snap.delta.revenue), label: t("delta") },
  ];
  const g = demo.grounding;
  const frames = [
    { title: t("f1"), out: `https://${demo.project.domain}` },
    { title: t("f2"), out: [g.offering, ...(g.localities ?? [])].filter(Boolean).join(" · "), more: (g.keywords ?? []).slice(0, 4).join(", ") },
    { title: t("f3"), out: top.slice(0, 3).map((c) => `${c.name} ${c.fit}`).join(" · ") },
    { title: t("f4"), out: top[0]?.firstActions[0] ?? "", more: t("f4more", { n: String(top[0]?.firstActions.length ?? 0) }) },
    { title: t("f5"), out: t("f5out", { families: String(facts.families), channels: String(facts.curatedChannels) }) },
  ];
  const legend = { low: EFFORT_LABELS.low[locale], medium: EFFORT_LABELS.medium[locale], high: EFFORT_LABELS.high[locale] };

  return (
    <>
      <ExhibitHero
        n={1} of={OF} eyebrow={t("eyebrow")} title1={t("title1")} title2={t("title2")} intro={t("intro")} demoNote={t("demo")}
        client={snap.client} series={performance.daily.slice(-DAYS).map((d) => d.revenue)} figures={figures} locale={locale}
      />
      <section className="exhibit-noise bg-onyx text-onyx-ink">
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:py-20">
          <Specimen n={2} of={OF} span={7} title={t("s2")} caption={t("s2c", { n: String(demo.plan.length) })}>
            <ExhibitHistogram plan={demo.plan} legend={legend} />
          </Specimen>
          <Specimen n={3} of={OF} span={5} title={t("s3")} caption={t("s3c")}>
            <ExhibitSheet frames={frames} />
          </Specimen>
          <Specimen n={4} of={OF} span={5} title={t("s4")} caption={t("s4c")}>
            <ExhibitMatrix locale={locale} typeLabel={(ty) => projectTypeMeta(ty, locale).label} />
          </Specimen>
          <Specimen n={5} of={OF} span={4} title={t("s5")} caption={t("s5c", { client: snap.client.name })}>
            <ExhibitPlates figures={figures} />
          </Specimen>
          <Specimen n={6} of={OF} span={3} title={t("s6")} caption={t("s6c")}>
            <ExhibitLedger rows={CHANNELS.map((c) => ({ name: c.name, level: c.level[locale] ?? c.level.en }))} />
          </Specimen>
        </div>
      </section>
      <section className="border-t border-onyx-line bg-onyx text-onyx-ink">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-16 sm:flex-row sm:items-end sm:justify-between sm:px-6">
          <div>
            <p className="exhibit-dot font-mono text-[12px] uppercase tracking-[0.18em] text-brand-300">{t("eyebrow")} 07 / 07</p>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t("s7")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/app" className="inline-flex items-center gap-2 rounded-pill bg-brand-500 px-5 py-3 text-sm font-semibold text-navy-900 transition-colors hover:bg-brand-400">
              {t("start")} <ArrowRight width={17} height={17} />
            </Link>
            <Link href="/dashboard" className="text-sm font-medium text-onyx-muted underline decoration-onyx-line underline-offset-4 transition-colors hover:text-brand-200">
              {t("demoLink")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
