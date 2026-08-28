/** The path itself, in the five steps the product actually walks
 *  (docs/ship/2026-08-28-kanaly-core-path.md §1.2): URL in → website scan →
 *  ranked plan → the plan is pinned and each channel gets a lifecycle → one
 *  visibility plan.
 *
 *  Claims are sourced, not invented: the scan's output fields come from
 *  `src/lib/ai/tools/onboarding-scan.ts`, the "6–9 channels / 2–4 first actions"
 *  bounds are the production system prompt's own rules
 *  (`channel-research.ts` CHANNEL_RESEARCH_SYSTEM), and the lifecycle vocabulary
 *  is rendered from the app's own `STAGE_LABELS` rather than retyped here. */
import { Container, Eyebrow } from "@/components/ui";
import { STAGE_LABELS } from "@/components/app/channels/labels";
import { getT } from "@/lib/i18n/server";
import { getServerLocale } from "@/lib/i18n/locale";
import type { ChannelStage } from "@/lib/organic-channels/types";

/** The lifecycle a channel walks on the page, in order. `paused` exists in the
 *  model too but is a detour, not a step of the happy path. */
const STAGE_FLOW: ChannelStage[] = ["identified", "planned", "live", "done"];

const T = {
  cs: {
    eyebrow: "Jak to jde po sobě",
    heading: "Od adresy webu k plánu, který má první kroky.",
    s1Title: "Zadáte adresu webu",
    s1Body:
      "Projekt začíná jednou URL. Nepřipojujete reklamní účet, nenahráváte feed, nezadáváte kartu.",
    s2Title: "Adamant si web projde",
    s2Body:
      "Sken z textu stránky vytáhne název firmy, čím se zabývá, komu prodává, tón komunikace a klíčová slova, se kterými se dá dál pracovat.",
    s3Title: "Dostanete seřazený plán kanálů",
    s3Body:
      "Šest až devět konkrétních kanálů vhodných pro český trh, seřazených podle toho, jak dobře sedí vaší firmě. U každého náročnost, co konkrétně přinese a dva až čtyři první kroky.",
    s4Title: "Plán si připnete a kanály žijí dál",
    s4Body:
      "Vybrané kanály přestanou být seznamem a stanou se stavem: každý si drží, kde v procesu je, a plán jde kdykoli přegenerovat, aniž byste o rozpracované kanály přišli.",
    s5Title: "Vznikne jeden plán viditelnosti",
    s5Body:
      "Kanály, hledané dotazy a připravený obsah se složí do jednoho artefaktu. Co nemáte, zůstane prázdné: chybějící dotaz ani chybějící článek se nedoplňuje odhadem.",
    lifecycle: "Životní cyklus kanálu",
  },
  en: {
    eyebrow: "In the order it happens",
    heading: "From a web address to a plan with actual first steps.",
    s1Title: "You give it a web address",
    s1Body:
      "A project starts with one URL. No ad account to connect, no product feed to upload, no card to enter.",
    s2Title: "Adamant reads the site",
    s2Body:
      "The scan pulls the business name, what it does, who it sells to, the tone of voice and keywords worth working with out of the page text.",
    s3Title: "You get a ranked channel plan",
    s3Body:
      "Six to nine concrete channels that work on the Czech market, ranked by how well each fits your business. Each carries its effort, what it concretely pays off in, and two to four first steps.",
    s4Title: "You pin the plan and the channels keep living",
    s4Body:
      "Pinned channels stop being a list and become state: each holds where it is in the process, and the plan can be regenerated at any time without losing the ones already in progress.",
    s5Title: "It composes into one visibility plan",
    s5Body:
      "Channels, target queries and prepared content join into a single artifact. What you do not have stays empty: a missing query or a missing article is never filled in with a guess.",
    lifecycle: "A channel's lifecycle",
  },
} as const;

export default async function FreeChannelsPath() {
  const t = await getT(T);
  const locale = await getServerLocale();
  const steps = [
    { title: t("s1Title"), body: t("s1Body") },
    { title: t("s2Title"), body: t("s2Body") },
    { title: t("s3Title"), body: t("s3Body") },
    { title: t("s4Title"), body: t("s4Body") },
    { title: t("s5Title"), body: t("s5Body") },
  ];

  return (
    <section className="border-b border-line bg-brand-50/30">
      <Container className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
            {t("heading")}
          </h2>
        </div>

        <ol className="mt-9 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-2 lg:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="flex flex-col bg-surface p-5">
              <span className="text-sm font-semibold tabular-nums text-brand-accent">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 text-base font-semibold tracking-tight text-navy-800">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}

          {/* The lifecycle, in the app's OWN words — STAGE_LABELS is the same map
              the channel table and the wizard render, so this cannot drift. */}
          <li className="flex flex-col justify-center bg-onyx p-5 text-onyx-ink">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              {t("lifecycle")}
            </span>
            <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm font-medium">
              {STAGE_FLOW.map((stage, i) => (
                <span key={stage} className="flex items-center gap-2">
                  {i > 0 && (
                    <span aria-hidden className="text-onyx-line">
                      →
                    </span>
                  )}
                  <span>{STAGE_LABELS[stage][locale] ?? STAGE_LABELS[stage].en}</span>
                </span>
              ))}
            </span>
          </li>
        </ol>
      </Container>
    </section>
  );
}
