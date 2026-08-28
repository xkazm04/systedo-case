/** The one visibility plan — the artifact that joins the three legs of "get found
 *  without paying" into a single object (src/lib/organic-channels/visibility-plan.ts).
 *
 *  This section exists because the honest version of the claim is unusual enough
 *  to be worth stating on a marketing page: the join between a search query and a
 *  channel is PROPOSED by a stated heuristic, not measured, and a leg the tenant
 *  has no data for stays explicitly empty instead of being filled with something
 *  invented. That is the product's actual behaviour, pinned by its unit tests. */
import Link from "next/link";
import { Container, Eyebrow } from "@/components/ui";
import { ArrowRight, Search, Document, Network } from "@/components/icons";
import { getT } from "@/lib/i18n/server";

const T = {
  cs: {
    eyebrow: "Jeden plán, ne tři moduly",
    heading: "Kanály, dotazy a obsah drží pohromadě.",
    sub: "Hledané dotazy žijí v Klíčových slovech, obsah v Obsahovém enginu a kanály tady. Plán viditelnosti je složí do jedné tabulky: jeden řádek je jeden kanál, v pořadí, v jakém sedí vaší firmě, s dotazem, na který má mířit, a s obsahem, který ho už pokrývá.",
    legChannelsTitle: "Kanály",
    legChannelsBody: "Páteř plánu. Pořadí i první kroky pocházejí z plánu kanálů.",
    legQueriesTitle: "Hledané dotazy",
    legQueriesBody:
      "Dotazy se rozdělují na kanály, které umí nést obsah — komunity, sociální sítě, vlastní obsah. Zápis do katalogu žádný dotaz nedostane.",
    legContentTitle: "Obsah",
    legContentBody:
      "Napojuje se přes klíčové slovo, na které byl brief zadaný. Tohle není odhad, ale vazba, kterou jste udělali vy.",
    honestyTitle: "Co je návrh a co je fakt",
    honestyBody:
      "Vazba dotaz–kanál je návrh podle jednoho pravidla, které je napsané nahlas, ne naměřený výsledek. Vazba kanál–obsah je vaše vlastní data. Každá část plánu navíc říká, odkud pochází: z osiva, z generování, nebo od vás. Prázdný projekt dostane plán jen s kanály — ostatní části zůstanou prázdné.",
    cta: "Podívat se na plán v ukázce",
  },
  en: {
    eyebrow: "One plan, not three modules",
    heading: "Channels, queries and content hold together.",
    sub: "Target queries live in Keywords, content in the Content engine and channels here. The visibility plan composes them into one table: one row is one channel, in the order it fits your business, carrying the query it should aim at and the content that already covers it.",
    legChannelsTitle: "Channels",
    legChannelsBody: "The spine of the plan. The order and the first steps come from the channel plan.",
    legQueriesTitle: "Target queries",
    legQueriesBody:
      "Queries are dealt onto the channels that can actually carry content — communities, social, owned content. A directory listing gets no query.",
    legContentTitle: "Content",
    legContentBody:
      "Joined on the keyword the brief was written against. That is not a guess; it is a link you made.",
    honestyTitle: "What is proposed and what is fact",
    honestyBody:
      "The query-to-channel link is a proposal from one heuristic stated out loud, not a measured result. The channel-to-content link is your own data. Every leg also says where it came from: a seed, a generation, or you. A project with nothing saved gets a channels-only plan, with the other legs left empty.",
    cta: "See the plan in the demo",
  },
} as const;

export default async function VisibilityPlanBand() {
  const t = await getT(T);
  const legs = [
    { Icon: Network, title: t("legChannelsTitle"), body: t("legChannelsBody") },
    { Icon: Search, title: t("legQueriesTitle"), body: t("legQueriesBody") },
    { Icon: Document, title: t("legContentTitle"), body: t("legContentBody") },
  ];

  return (
    <section className="border-b border-line bg-brand-50/30">
      <Container className="py-14 lg:py-20">
        <div className="max-w-2xl">
          <Eyebrow>{t("eyebrow")}</Eyebrow>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-navy-800 sm:text-3xl">
            {t("heading")}
          </h2>
          <p className="mt-4 text-muted">{t("sub")}</p>
        </div>

        <div className="mt-9 grid grid-cols-1 gap-5 md:grid-cols-3">
          {legs.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-card border border-line bg-surface p-5 shadow-card">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-onyx text-brand-300">
                <Icon width={18} height={18} />
              </span>
              <h3 className="mt-4 text-base font-semibold tracking-tight text-navy-800">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 rounded-card border border-dashed border-line bg-surface p-5">
          <div className="max-w-2xl">
            <h3 className="text-sm font-semibold tracking-tight text-navy-800">
              {t("honestyTitle")}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{t("honestyBody")}</p>
          </div>
          <Link
            href="/dashboard?m=kanaly"
            className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold text-brand-accent transition-colors hover:text-brand-800"
          >
            {t("cta")}
            <ArrowRight width={16} height={16} />
          </Link>
        </div>
      </Container>
    </section>
  );
}
