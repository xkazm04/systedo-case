/** The core path, WALKED — the homepage band that shows the five steps of the
 *  free-channel path carrying the product's real data at each one, instead of
 *  four sentences claiming they happen (docs/ship/2026-08-28-kanaly-core-path.md
 *  §4: the shipped home was static blocks with no interactive demonstration).
 *
 *  DEMONSTRATE, DON'T ASSERT. Every panel below renders something the product
 *  actually produced for the demo fixture: the address the scan starts from, the
 *  grounding the app's own `buildKanalyGrounding` derives from that business, the
 *  fit-ranked seeded plan, its lifecycle vocabulary and its first actions. None of
 *  it is typed here (see ./facts), so a step whose data disappears renders empty
 *  rather than keeping a claim alive on the homepage.
 *
 *  INTERACTIVE WITHOUT A RUNTIME. The stepper is a native exclusive accordion
 *  (`<details name>`): opening one step closes the others, keyboard and screen
 *  readers get it for free, it is in the server-rendered HTML, and it costs zero
 *  bytes of JavaScript. In a browser without exclusive-accordion support the steps
 *  simply open independently — a degradation, not a break. The first step ships
 *  open so the band shows real content with nothing clicked. */
import Link from "next/link";
import { Container, Eyebrow, Pill } from "@/components/ui";
import { ArrowRight } from "@/components/icons";
import { EFFORT_LABELS, STAGE_LABELS } from "@/components/app/channels/labels";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import type { ChannelStage } from "@/lib/organic-channels/types";
import { freeChannelFacts } from "./facts";
import { Facet, Step } from "./WalkthroughStep";

/** The lifecycle a pinned channel walks. `paused` exists in the model too but is
 *  a detour, not a step of the happy path (the same flow FreeChannelsPath shows). */
const STAGE_FLOW: ChannelStage[] = ["identified", "planned", "live", "done"];
/** Rows of the ranked plan the panel shows — enough to read as a ranking. */
const RANKED = 3;

const T = {
  cs: {
    eyebrow: "Projděte si to",
    heading: "Pět kroků, každý s tím, co z něj opravdu vypadne.",
    sub: "Rozklikněte krok. Data v každém panelu jsou skutečný výstup modulu pro ukázkový projekt — ne obrázek a ne věta napsaná do marketingu.",
    demoBadge: "Ukázková data: fiktivní klient",
    s1: "Zadáte adresu webu",
    s1Body: "Projekt začíná jednou URL. Žádný reklamní účet, žádný feed, žádná karta.",
    s2: "Adamant si web projde",
    s2Body:
      "Ze stránky a z katalogu vznikne to, z čeho plán mluví: čím se firma zabývá, kde působí a jaká slova používá.",
    s2Offering: "Nabídka",
    s2Localities: "Lokality",
    s2Keywords: "Slova, ze kterých plán mluví",
    s3: "Dostanete seřazený plán",
    s3Body: "Kanály seřazené podle toho, jak sedí právě téhle firmě. Nejlepší tři z {total}:",
    s3Fit: "sedne",
    s4: "Plán si připnete",
    s4Body:
      "Připnutý kanál přestane být položkou v seznamu a začne mít stav. První kroky u kanálu {channel}:",
    s4Lifecycle: "Životní cyklus",
    s5: "Vznikne jeden plán viditelnosti",
    s5Body:
      "Kanály, hledané dotazy a hotový obsah se složí do jedné tabulky. Co nemáte, zůstane prázdné — chybějící dotaz se nedoplňuje odhadem.",
    s5Cta: "Celý plán a jak vzniká",
  },
  en: {
    eyebrow: "Walk it",
    heading: "Five steps, each showing what actually falls out of it.",
    sub: "Open a step. The data in every panel is the module's real output for the demo project — not a screenshot, and not a sentence written for marketing.",
    demoBadge: "Demo data: fictional client",
    s1: "You give it a web address",
    s1Body: "A project starts with one URL. No ad account, no product feed, no card.",
    s2: "Adamant reads the site",
    s2Body:
      "The page and the catalog become the thing the plan speaks from: what the business does, where it operates, and the words it uses.",
    s2Offering: "Offering",
    s2Localities: "Localities",
    s2Keywords: "Words the plan speaks from",
    s3: "You get a ranked plan",
    s3Body: "Channels ranked by how well each fits this specific business. The top three of {total}:",
    s3Fit: "fit",
    s4: "You pin the plan",
    s4Body:
      "A pinned channel stops being a list item and starts holding state. The first steps for {channel}:",
    s4Lifecycle: "Lifecycle",
    s5: "It composes into one visibility plan",
    s5Body:
      "Channels, target queries and finished content join into one table. What you do not have stays empty — a missing query is never filled in with a guess.",
    s5Cta: "The whole plan, and how it is built",
  },
} as const;

export default async function HomePathWalkthrough() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const { demo } = freeChannelFacts();
  const { project, plan, grounding } = demo;
  const top = plan[0];

  return (
    <section id="core-path" className="reveal-on-scroll border-b border-line bg-surface">
      <Container className="py-14 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <Eyebrow>{t("eyebrow")}</Eyebrow>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
              {t("heading")}
            </h2>
            <p className="mt-4 leading-relaxed text-muted">{t("sub")}</p>
          </div>
          <Pill tone="navy">{t("demoBadge")}</Pill>
        </div>

        <div className="mt-9 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <Step n={1} title={t("s1")} body={t("s1Body")} open>
            <p className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-pill border border-line bg-brand-50/40 px-4 py-2 font-mono text-sm text-navy-800">
              <span className="text-muted">https://</span>
              {project.domain}
            </p>
          </Step>

          <Step n={2} title={t("s2")} body={t("s2Body")}>
            <div className="space-y-3">
              <Facet
                label={t("s2Offering")}
                values={grounding.offering ? [grounding.offering] : []}
              />
              <Facet label={t("s2Localities")} values={grounding.localities ?? []} />
              <Facet label={t("s2Keywords")} values={grounding.keywords ?? []} />
            </div>
          </Step>

          <Step n={3} title={t("s3")} body={t("s3Body", { total: String(plan.length) })}>
            <ol className="space-y-2">
              {plan.slice(0, RANKED).map((c) => {
                const effort = EFFORT_LABELS[c.effort];
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-card border border-line bg-surface px-4 py-2.5"
                  >
                    <span className="font-semibold text-navy-800">{c.name}</span>
                    <span className="tnum text-sm font-semibold text-brand-accent">
                      {c.fit} <span className="font-normal text-muted">{t("s3Fit")}</span>
                    </span>
                    <span className={`pill ${effort.tone}`}>{effort[locale] ?? effort.en}</span>
                  </li>
                );
              })}
            </ol>
          </Step>

          <Step n={4} title={t("s4")} body={t("s4Body", { channel: top?.name ?? "" })}>
            <ul className="space-y-2 text-sm leading-relaxed text-navy-700">
              {(top?.firstActions ?? []).map((a) => (
                <li key={a} className="flex gap-2.5">
                  <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rotate-45 bg-brand-400" />
                  {a}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                {t("s4Lifecycle")}
              </span>
              {STAGE_FLOW.map((stage, i) => (
                <span key={stage} className="flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden className="text-line">
                      →
                    </span>
                  )}
                  <span className={`pill ${STAGE_LABELS[stage].tone}`}>
                    {STAGE_LABELS[stage][locale] ?? STAGE_LABELS[stage].en}
                  </span>
                </span>
              ))}
            </p>
          </Step>

          <Step n={5} title={t("s5")} body={t("s5Body")}>
            <Link
              href="/kanaly-zdarma"
              className="inline-flex items-center gap-2 text-sm font-semibold text-brand-accent transition-colors hover:text-brand-800"
            >
              {t("s5Cta")}
              <ArrowRight width={16} height={16} />
            </Link>
          </Step>
        </div>
      </Container>
    </section>
  );
}
