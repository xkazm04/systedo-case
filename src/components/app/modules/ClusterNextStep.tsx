"use client";

import { useRouter } from "next/navigation";
import { ArrowRight } from "@/components/icons";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import type { ClusterArticle } from "@/lib/content-engine/sample";

/** "Další článek: …" handoff. Reuses DecayTable's seed-and-route bridge: the next
 *  planned article becomes the brief topic + primary keyword, written to the
 *  per-project sessionStorage seed before routing to Obsah, where the brief tool
 *  reads the seed on mount and pre-fills the draft. */
export default function ClusterNextStep({
  topic,
  nextGap,
}: {
  topic: string;
  nextGap: ClusterArticle;
}) {
  const project = useProject();
  const router = useRouter();

  function onSeed() {
    const seed: BriefSeed = {
      topic: nextGap.title,
      primaryKeyword: topic,
      keywords: [],
    };
    try {
      sessionStorage.setItem(briefSeedKey(project.id), JSON.stringify(seed));
    } catch {
      /* non-critical — the brief tool still opens, just unseeded */
    }
    router.push(`/app/${project.id}/obsah`);
  }

  const isPillar = nextGap.type === "pillar";

  return (
    <button
      type="button"
      onClick={onSeed}
      className="mt-3 inline-flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-left text-xs transition-colors hover:border-brand-300 hover:bg-brand-50"
      title="Vytvořit AI brief pro tento článek v Obsahu"
    >
      <span className="min-w-0">
        <span className="font-medium text-muted">Další článek: </span>
        <span className={`font-medium ${isPillar ? "text-coral-600" : "text-brand-700"}`}>
          {nextGap.title}
          {isPillar ? " (pilíř)" : ""}
        </span>
      </span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-700" />
    </button>
  );
}
