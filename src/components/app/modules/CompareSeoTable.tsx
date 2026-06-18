"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { fmtInt } from "@/lib/format";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import { INTENT_LABELS, type Opportunity, type ScoredQuery } from "@/lib/seo-compare/compute";

const OPP_META: Record<Opportunity, { tone: PillTone; label: string }> = {
  high: { tone: "positive", label: "Vysoká" },
  medium: { tone: "coral", label: "Střední" },
  low: { tone: "neutral", label: "Nízká" },
};

/** Turn a comparison query into a content topic the brief tool can act on. The
 *  framing follows the intent: a "vs" query wants a head-to-head srovnání, an
 *  "alternative" query an alternatives roundup, a "pricing" query a cena/ceník
 *  page. Keeps the chosen keyword as the primary. */
function briefTopic(r: ScoredQuery): string {
  switch (r.intent) {
    case "vs":
      return `${r.query} — srovnání`;
    case "alternative":
      return `Alternativy: ${r.query}`;
    case "pricing":
      return `${r.query} / ceník`;
    case "review":
      return `${r.query} — recenze`;
  }
}

/** Scored comparison-query table with a per-row "Vytvořit srovnávací obsah"
 *  action. Mirrors KeywordsModule.onCreateBrief / DecayTable: it writes a
 *  BriefSeed for the chosen query to session storage, then routes to Obsah,
 *  where the brief tool reads the seed on mount and pre-fills the draft. */
export default function CompareSeoTable({ rows }: { rows: ScoredQuery[] }) {
  const project = useProject();
  const router = useRouter();

  function onCreate(r: ScoredQuery) {
    const seed: BriefSeed = {
      topic: briefTopic(r),
      primaryKeyword: r.query,
      keywords: [{ keyword: r.query, volume: r.volume, competition: INTENT_LABELS[r.intent] }],
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
            <th className="px-5 py-3 font-medium">Dotaz</th>
            <th className="px-4 py-3 font-medium">Záměr</th>
            <th className="px-4 py-3 text-right font-medium">Objem</th>
            <th className="px-4 py-3 text-right font-medium">Obtížnost</th>
            <th className="px-4 py-3 text-right font-medium">Pozice</th>
            <th className="px-4 py-3 font-medium">Příležitost</th>
            <th className="px-4 py-3 text-right font-medium">Akce</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = OPP_META[r.opportunity];
            return (
              <tr key={r.query} className="border-b border-line/70 last:border-0">
                <td className="px-5 py-3 font-medium text-navy-800">{r.query}</td>
                <td className="px-4 py-3">
                  <Pill tone="brand">{INTENT_LABELS[r.intent]}</Pill>
                </td>
                <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(r.volume)}</td>
                <td className="tnum px-4 py-3 text-right text-navy-700">{r.difficulty}</td>
                <td className="tnum px-4 py-3 text-right text-muted">{r.rank ?? "—"}</td>
                <td className="px-4 py-3">
                  <Pill tone={meta.tone}>{meta.label}</Pill>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => onCreate(r)}
                    className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                    title="Předat tento dotaz do AI briefu v Obsahu"
                  >
                    Vytvořit obsah
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
