/** "AI content publish rate" — the payoff half of the generate loop, measured.
 *
 *  Sits on Spotřeba (LLM usage) because that page is already the honest ledger of
 *  what the model was asked to do; this is the answer to what happened NEXT. Every
 *  number here comes from recorded events (llmTelemetry × the activity feed's
 *  publish taxonomy) — there is no seeded variant of this panel, so a demo project
 *  and a thin window both say so in words instead of rendering a percentage.
 *
 *  Server component: the rollup is already resolved by the page. */
import { Pill } from "@/components/ui";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import type { PublishRateRollup } from "@/lib/activity/publish-rate";

const T = {
  cs: {
    title: "Míra publikace obsahu",
    desc: "Kolik z výstupů vygenerovaných AI za posledních {days} dní skutečně opustilo aplikaci (staženo, zkopírováno nebo odesláno do kanálu).",
    badgeMeasured: "Měřeno",
    badgeNotEnough: "Zatím málo dat",
    ofGenerated: "{published} z {generated} vygenerovaných výstupů",
    noGenerations:
      "V tomto období nemáme žádnou vygenerovanou položku, ze které by se dala míra spočítat. Až necháte AI něco vytvořit, doplní se sama. Nic tu nedopočítáváme.",
    insufficient:
      "Zaznamenáno {generated} z {min} generování potřebných pro smysluplné procento. Do té doby ukazujeme jen počty, ne podíl.",
    notMeasurable:
      "Ukázkový projekt: míra publikace se tu neměří. Čísla by nevycházela z vaší reálné práce, a to by bylo zavádějící.",
    colBucket: "Typ výstupu",
    colGenerated: "Vygenerováno",
    colPublished: "Publikováno",
    colRate: "Podíl",
    unmatched: "Navíc {n} publikací bez zaznamenaného generování: obsah, který odešel bez AI (deterministické varianty, ruční texty) nebo opakované kopie. Do podílu se nepočítá.",
    bucket_channel_variant: "Varianty pro kanály",
    bucket_ad_copy: "Inzerátní texty",
    bucket_article: "Články",
    bucket_content_brief: "Obsahové briefy",
    bucket_keyword_list: "Seznamy klíčových slov",
    bucket_analysis: "Analýzy",
  },
  en: {
    title: "Content publish rate",
    desc: "How many of the assets the AI generated in the last {days} days actually left the app (downloaded, copied, or pushed to a channel).",
    badgeMeasured: "Measured",
    badgeNotEnough: "Not enough data yet",
    ofGenerated: "{published} of {generated} generated assets",
    noGenerations:
      "Nothing was generated in this period, so there is nothing to divide by. The rate fills in once you generate something. We don't estimate it.",
    insufficient:
      "{generated} of the {min} generations needed for a meaningful percentage. Until then we show counts only, not a share.",
    notMeasurable:
      "Sample project: the publish rate isn't measured here. It wouldn't come from your real work, which would be misleading.",
    colBucket: "Asset type",
    colGenerated: "Generated",
    colPublished: "Published",
    colRate: "Share",
    unmatched: "Plus {n} publish events with no recorded generation: content that left without AI behind it (deterministic variants, hand-written text) or repeat copies. Not counted in the share.",
    bucket_channel_variant: "Channel variants",
    bucket_ad_copy: "Ad copy",
    bucket_article: "Articles",
    bucket_content_brief: "Content briefs",
    bucket_keyword_list: "Keyword lists",
    bucket_analysis: "Analyses",
  },
} as const;

type TKey = keyof typeof T.en;

/** The i18n key for a bucket id — one place, so an unlabelled bucket is a compile
 *  error at the call site rather than a raw enum leaking into the table. */
function bucketKey(bucket: string): TKey {
  return `bucket_${bucket}` as TKey;
}

export default async function PublishRatePanel({
  rollup,
  measurable,
}: {
  rollup: PublishRateRollup | null;
  measurable: boolean;
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();

  const header = (badge: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-navy-800">{t("title")}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {t("desc", { days: rollup?.windowDays ?? 30 })}
        </p>
      </div>
      {badge}
    </div>
  );

  // Demo/sample project — say so, never show a number.
  if (!measurable || !rollup) {
    return (
      <div className="card overflow-hidden">
        {header(null)}
        <p className="px-5 py-6 text-sm text-muted">{t("notMeasurable")}</p>
      </div>
    );
  }

  const measured = rollup.status === "ok" && rollup.rate !== null;
  const rows = rollup.buckets.filter((b) => b.generated > 0 || b.publishEvents > 0);

  return (
    <div className="card overflow-hidden">
      {header(
        <Pill tone={measured ? "positive" : "neutral"}>
          {measured ? t("badgeMeasured") : t("badgeNotEnough")}
        </Pill>
      )}

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-5">
        {measured ? (
          <>
            <span className="tnum text-3xl font-semibold text-navy-800">{fmt.fmtPct(rollup.rate!)}</span>
            <span className="text-sm text-muted">
              {t("ofGenerated", { published: rollup.published, generated: rollup.generated })}
            </span>
          </>
        ) : (
          <p className="text-sm text-muted">
            {rollup.status === "no-generations"
              ? t("noGenerations")
              : t("insufficient", { generated: rollup.generated, min: rollup.minGenerations })}
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colBucket")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colGenerated")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colPublished")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colRate")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.bucket} className="border-b border-line/70 last:border-0">
                  <td className="px-5 py-3 font-medium text-navy-800">{t(bucketKey(b.bucket))}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(b.generated)}</td>
                  <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(b.published)}</td>
                  <td className="tnum px-4 py-3 text-right font-medium text-navy-800">
                    {b.rate === null ? "—" : fmt.fmtPct(b.rate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rollup.unmatchedPublishes > 0 && (
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          {t("unmatched", { n: rollup.unmatchedPublishes })}
        </p>
      )}
    </div>
  );
}
