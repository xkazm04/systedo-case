"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { Pill } from "@/components/ui";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import type { DecayingPost } from "@/lib/content-engine/sample";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    colArticle: "Článek",
    colPublished: "Publikováno",
    colTraffic: "Návštěvnost YoY",
    colPriority: "Priorita",
    colAction: "Akce",
    publishedAgo: "před {n} měs.",
    priorityHigh: "Vysoká",
    priorityMedium: "Střední",
    refreshBtn: "Obnovit",
    refreshTitle: "Vytvořit AI brief pro obnovu tohoto článku v Obsahu",
  },
  en: {
    colArticle: "Article",
    colPublished: "Published",
    colTraffic: "Traffic YoY",
    colPriority: "Priority",
    colAction: "Action",
    publishedAgo: "{n} mo. ago",
    priorityHigh: "High",
    priorityMedium: "Medium",
    refreshBtn: "Refresh",
    refreshTitle: "Create AI brief to refresh this article in Content",
  },
} as const;

/** Decay table with a per-row "Refresh" action. Mirrors KeywordsModule.onCreateBrief:
 *  it writes a BriefSeed for the decaying article to session storage, then routes to
 *  Content, where the brief tool reads the seed on mount and pre-fills the refresh. */
export default function DecayTable({ decaying }: { decaying: DecayingPost[] }) {
  const project = useProject();
  const router = useRouter();
  const t = useT(T);
  const fmt = useFormatters();

  function onRefresh(post: DecayingPost) {
    const seed: BriefSeed = {
      topic: post.title,
      primaryKeyword: post.title,
      keywords: [],
    };
    try {
      sessionStorage.setItem(briefSeedKey(project.id), JSON.stringify(seed));
    } catch {
      /* non-critical — the brief tool still opens, just unseeded */
    }
    router.push(`/app/${project.id}/obsah`);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-3 font-medium">{t("colArticle")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colPublished")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colTraffic")}</th>
            <th className="px-4 py-3 font-medium">{t("colPriority")}</th>
            <th className="px-4 py-3 text-right font-medium">{t("colAction")}</th>
          </tr>
        </thead>
        <tbody>
          {decaying.map((p) => (
            <tr key={p.title} className="border-b border-line/70 last:border-0">
              <td className="px-5 py-3 font-medium text-navy-800">{p.title}</td>
              <td className="tnum px-4 py-3 text-right text-muted">{t("publishedAgo", { n: p.monthsAgo })}</td>
              <td className="tnum px-4 py-3 text-right font-semibold text-negative">{fmt.fmtSignedPct(p.trafficChangePct)}</td>
              <td className="px-4 py-3">
                <Pill tone={p.trafficChangePct <= -0.3 ? "negative" : "coral"}>
                  {p.trafficChangePct <= -0.3 ? t("priorityHigh") : t("priorityMedium")}
                </Pill>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onRefresh(p)}
                  className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                  title={t("refreshTitle")}
                >
                  {t("refreshBtn")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
