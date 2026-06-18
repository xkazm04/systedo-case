"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { Pill } from "@/components/ui";
import { fmtSignedPct } from "@/lib/format";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import type { DecayingPost } from "@/lib/content-engine/sample";

/** Decay table with a per-row "Obnovit" action. Mirrors KeywordsModule.onCreateBrief:
 *  it writes a BriefSeed for the decaying article to session storage, then routes to
 *  Obsah, where the brief tool reads the seed on mount and pre-fills the refresh. */
export default function DecayTable({ decaying }: { decaying: DecayingPost[] }) {
  const project = useProject();
  const router = useRouter();

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
            <th className="px-5 py-3 font-medium">Článek</th>
            <th className="px-4 py-3 text-right font-medium">Publikováno</th>
            <th className="px-4 py-3 text-right font-medium">Návštěvnost YoY</th>
            <th className="px-4 py-3 font-medium">Priorita</th>
            <th className="px-4 py-3 text-right font-medium">Akce</th>
          </tr>
        </thead>
        <tbody>
          {decaying.map((p) => (
            <tr key={p.title} className="border-b border-line/70 last:border-0">
              <td className="px-5 py-3 font-medium text-navy-800">{p.title}</td>
              <td className="tnum px-4 py-3 text-right text-muted">před {p.monthsAgo} měs.</td>
              <td className="tnum px-4 py-3 text-right font-semibold text-negative">{fmtSignedPct(p.trafficChangePct)}</td>
              <td className="px-4 py-3">
                <Pill tone={p.trafficChangePct <= -0.3 ? "negative" : "coral"}>
                  {p.trafficChangePct <= -0.3 ? "Vysoká" : "Střední"}
                </Pill>
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => onRefresh(p)}
                  className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                  title="Vytvořit AI brief pro obnovu tohoto článku v Obsahu"
                >
                  Obnovit
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
