/** Content engine — topic clusters + content-decay refresh. Server component. */
import { Pill } from "@/components/ui";
import NextSteps from "@/components/app/NextSteps";
import DecayTable from "@/components/app/modules/DecayTable";
import ClusterBuilder from "@/components/app/modules/ClusterBuilder";
import ClusterNextStep from "@/components/app/modules/ClusterNextStep";
import ClusterLinkMap from "@/components/app/modules/ClusterLinkMap";
import { getServerFormatters, getT } from "@/lib/i18n/server";
import { rankedClusterStats, decayingPosts } from "@/lib/content-engine/compute";
import type { DecayingPost, TopicCluster } from "@/lib/content-engine/sample";

const T = {
  cs: {
    missingPillar: "Chybí pilíř",
    volPerMonth: "{n} obj./měs.",
    pillarArticle: "Pilířový článek",
    supportingArticle: "Podpůrný článek",
    decayingTitle: "Upadající obsah k obnově",
    decayingPill: "{n} k obnově",
    decayingFooter:
      "Plánované články generujte přes Obsah (AI brief); upadající obnovte tlačítkem „Obnovit“ a znovu prolinkujte do klastru.",
    nextStepCreate: "Vytvořit / obnovit obsah",
    nextStepCreateHint: "AI brief pro plánované a upadající články",
    nextStepDistribute: "Distribuovat",
    nextStepDistributeHint: "Rozšířit hotový obsah na kanály",
  },
  en: {
    missingPillar: "Missing pillar",
    volPerMonth: "{n} vol./mo.",
    pillarArticle: "Pillar article",
    supportingArticle: "Supporting article",
    decayingTitle: "Decaying content to refresh",
    decayingPill: "{n} to refresh",
    decayingFooter:
      'Plan new articles via Content (AI brief); refresh decaying ones with the "Refresh" button and re-link them into the cluster.',
    nextStepCreate: "Create / refresh content",
    nextStepCreateHint: "AI brief for planned and decaying articles",
    nextStepDistribute: "Distribute",
    nextStepDistributeHint: "Push finished content to channels",
  },
} as const;

export default async function ContentEngineModule({
  clusters,
  decay,
}: {
  clusters: TopicCluster[];
  decay: DecayingPost[];
}) {
  const t = await getT(T);
  const fmt = await getServerFormatters();

  // least-complete cluster first — that is where the next article matters most
  const stats = rankedClusterStats(clusters);
  const decaying = decayingPosts(decay);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        {stats.map((c) => (
          <div key={c.topic} className="card p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-navy-800">{c.topic}</h3>
              <div className="flex items-center gap-2">
                {!c.hasPillar && <Pill tone="coral">{t("missingPillar")}</Pill>}
                <span className="tnum text-xs text-muted">{t("volPerMonth", { n: fmt.fmtInt(c.volume) })}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50">
                <span
                  className="block h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.round(c.completeness * 100)}%` }}
                />
              </span>
              <span className="tnum text-xs font-medium text-muted">
                {c.published}/{c.total} · {fmt.fmtPct(c.completeness)}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.articles.map((a) => (
                <span
                  key={a.title}
                  className={`rounded-pill px-2.5 py-1 text-xs font-medium ${
                    a.status === "planned"
                      ? "border border-dashed border-line text-muted"
                      : a.type === "pillar"
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-800"
                  }`}
                  title={a.type === "pillar" ? t("pillarArticle") : t("supportingArticle")}
                >
                  {a.title}
                </span>
              ))}
            </div>

            <ClusterLinkMap graph={c.graph} />

            {c.nextGap && <ClusterNextStep topic={c.topic} nextGap={c.nextGap} />}
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h3 className="text-base font-semibold text-navy-800">{t("decayingTitle")}</h3>
          <Pill tone="coral">{t("decayingPill", { n: decaying.length })}</Pill>
        </div>
        <DecayTable decaying={decaying} />
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          {t("decayingFooter")}
        </div>
      </div>

      <ClusterBuilder />

      <NextSteps
        steps={[
          { to: "obsah", label: t("nextStepCreate"), hint: t("nextStepCreateHint") },
          { to: "distribuce", label: t("nextStepDistribute"), hint: t("nextStepDistributeHint") },
        ]}
      />
    </div>
  );
}
