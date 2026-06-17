import Link from "next/link";
import { Container, Eyebrow, Pill } from "@/components/ui";
import Sparkline from "@/components/charts/Sparkline";
import {
  ArrowRight,
  Bolt,
  Document,
  Gauge,
  Layers,
  Sparkles,
  Target,
} from "@/components/icons";
import { performance } from "@/lib/data";
import { bucketize, totalsOf } from "@/lib/metrics";
import { fmtCZKCompact, fmtDate, fmtInt, fmtMultiple, fmtPct } from "@/lib/format";
import { NAV_ITEMS } from "@/lib/nav";

const TASK_ICONS = {
  1: Gauge,
  2: Document,
  3: Sparkles,
  4: Layers,
} as const;

const STACK_REASONS = [
  {
    title: "Stránka = soubor",
    body: "Routing podle souborů v App Routeru přesně sedí na zadání „každý úkol = jedna stránka“. Navigace a prolinkování jsou triviální a typově bezpečné.",
  },
  {
    title: "Server-side klíče",
    body: "Route Handlers drží Gemini API klíč na serveru. Klíč nikdy neopustí backend, klient dostane jen výsledek — produkční vzor pro práci s LLM.",
  },
  {
    title: "Data bez databáze",
    body: "JSON v repozitáři je jediný zdroj pravdy. Staticky importovaný, typovaný, tree-shaknutý — funguje stejně lokálně i na Vercelu, bez infrastruktury.",
  },
  {
    title: "Výkon a SEO",
    body: "Server Components renderují obsah i metadata na serveru. Článek je tak rychlý a indexovatelný, dashboard interaktivní jen tam, kde je potřeba.",
  },
];

export default function HomePage() {
  const trailingYear = performance.daily.slice(-365);
  const year = totalsOf(trailingYear);
  const last30 = totalsOf(performance.daily.slice(-30));
  const monthlyRevenue = bucketize(trailingYear, "month").map((b) => b.revenue);
  // Stamp the snapshot with the latest day actually in the dataset, so the static
  // hero reads as "live to a date" instead of an undated, possibly-stale figure.
  const lastDate = performance.daily.at(-1)?.date;

  const heroStats = [
    { label: "Roční obrat z marketingu", value: fmtCZKCompact(year.revenue) },
    { label: "Průměrné PNO", value: fmtPct(year.pno) },
    { label: "ROAS", value: fmtMultiple(year.roas) },
    { label: "Návštěvy / rok", value: fmtInt(year.visits) },
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
        <Container className="relative grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
          <div>
            <Eyebrow>Case study · pozice AI Vibecoder</Eyebrow>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight text-navy-800 sm:text-5xl">
              Tři úkoly, jeden klient,
              <br className="hidden sm:block" /> produkční řemeslo.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Místo tří nesouvisejících demíček je celé zadání postavené kolem jednoho
              fiktivního e-shopu <strong className="text-navy-700">Mionelo</strong>. Dashboard ukazuje
              jeho výkon, článek míří na jeho web a AI nástroj generuje jeho inzeráty — jako
              reálná zakázka agentury.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-card transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99]"
              >
                Otevřít dashboard
                <ArrowRight width={17} height={17} />
              </Link>
              <a
                href="#proc-stack"
                className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-5 py-3 text-sm font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
              >
                Proč Next.js?
              </a>
            </div>
          </div>

          {/* live client snapshot, fed from the real dataset */}
          <div className="card relative p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Klient
                </p>
                <p className="mt-1 text-2xl font-semibold tracking-tight text-navy-800">
                  {performance.client.name}
                </p>
                <p className="text-sm text-muted">
                  {performance.client.domain} · {performance.client.segment}
                </p>
              </div>
              <Pill tone="neutral">Ilustrativní data</Pill>
            </div>

            <div className="mt-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-muted">Obrat za posledních 30 dní</p>
                <p className="tnum mt-1 text-3xl font-semibold tracking-tight text-navy-800">
                  {fmtCZKCompact(last30.revenue)}
                </p>
              </div>
              <Sparkline
                values={monthlyRevenue}
                width={150}
                height={52}
                autoColor
                dot
                describe
                formatValue={fmtCZKCompact}
              />
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-3">
              {heroStats.map((s) => (
                <div key={s.label} className="rounded-xl bg-canvas px-4 py-3">
                  <dt className="text-xs text-muted">{s.label}</dt>
                  <dd className="tnum mt-0.5 text-lg font-semibold text-navy-800">{s.value}</dd>
                </div>
              ))}
            </dl>

            {lastDate && (
              <p className="mt-5 flex items-center gap-1.5 border-t border-line pt-3 text-[13px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-positive" aria-hidden />
                Data aktuální k{" "}
                <time dateTime={lastDate} className="font-medium text-navy-600">
                  {fmtDate(lastDate)}
                </time>
              </p>
            )}
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------- Task cards */}
      <Container className="py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Čtyři stránky</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              Co najdeš uvnitř
            </h2>
          </div>
          <p className="max-w-md text-sm text-muted">
            Každý úkol ze zadání má vlastní stránku — plus bonusový přehled kampaní. Vzájemně se
            prolínají přes navigaci i odkazy uvnitř obsahu.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_ITEMS.filter((i) => i.task > 0).map((item) => {
            const Icon = TASK_ICONS[item.task as 1 | 2 | 3 | 4];
            return (
              <Link
                key={item.href}
                href={item.href}
                className="card group flex flex-col p-6 transition-all hover:-translate-y-1 hover:shadow-pop active:translate-y-0 active:scale-[0.99]"
              >
                <div className="flex items-center justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-accent transition-colors group-hover:bg-brand-600 group-hover:text-white">
                    <Icon width={22} height={22} />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                    Úkol {item.task}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-navy-800">{item.label}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{item.blurb}</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-accent">
                  Otevřít stránku
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

      {/* ---------------------------------------------------------- Stack reasons */}
      <section id="proc-stack" className="scroll-mt-24 border-y border-line bg-onyx">
        <Container className="py-16 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand-300">
                <span className="h-px w-6 bg-brand-400" aria-hidden />
                Zdůvodnění stacku
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Proč Next.js (App Router)
              </h2>
              <p className="mt-4 max-w-md text-onyx-muted">
                Zadání nechává volbu nástroje na mně. Vybral jsem Next.js 16, protože nejlépe
                pokrývá tři odlišné potřeby najednou: obsahové stránky, interaktivní dashboard a
                bezpečné volání LLM ze serveru.
              </p>
              <div className="mt-8 flex flex-wrap gap-2">
                {["Next.js 16", "TypeScript", "Tailwind v4", "Server Components", "Gemini SDK"].map(
                  (t) => (
                    <span
                      key={t}
                      className="rounded-pill border border-onyx-line bg-onyx-soft/60 px-3 py-1.5 text-xs font-medium text-onyx-ink"
                    >
                      {t}
                    </span>
                  )
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {STACK_REASONS.map((r, i) => (
                <div
                  key={r.title}
                  className="rounded-card border border-onyx-line bg-onyx-soft/40 p-5"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500/15 text-brand-300">
                    {[<Bolt key="a" width={17} height={17} />, <Target key="b" width={17} height={17} />, <Document key="c" width={17} height={17} />, <Gauge key="d" width={17} height={17} />][i]}
                  </span>
                  <h3 className="mt-4 text-sm font-semibold text-white">{r.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-onyx-muted">{r.body}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* ------------------------------------------------------------- How to run */}
      <Container className="py-16 sm:py-20">
        <div className="card grid items-center gap-8 p-7 sm:p-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <Eyebrow>Jak to spustit</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800">
              Lokálně za tři příkazy
            </h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
              Dashboard a článek běží bez jakékoli konfigurace. Pro AI asistenta stačí doplnit
              jeden Gemini API klíč — a i bez něj stránka funguje v ukázkovém režimu. Detaily v
              souboru <code className="rounded bg-navy-50 px-1.5 py-0.5 text-navy-700">README.md</code>.
            </p>
          </div>
          <pre className="overflow-x-auto rounded-card bg-onyx p-5 font-mono text-[15px] leading-relaxed text-onyx-ink">
            <code>
              <span className="text-navy-400"># instalace a běh</span>
              {"\n"}npm install
              {"\n"}npm run seed   <span className="text-navy-400"># vygeneruje data</span>
              {"\n"}npm run dev
            </code>
          </pre>
        </div>
      </Container>
    </>
  );
}
