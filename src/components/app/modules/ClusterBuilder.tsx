"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowRight, Bolt, Layers, Network } from "@/components/icons";
import { Pill } from "@/components/ui";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import type { KeywordCluster, KeywordClustersResult } from "@/lib/ai-types";
import { KEYWORD_INTENT_LABELS, type KeywordList } from "@/lib/keywords/types";
import { useAiTool } from "@/components/ai/useAiTool";
import {
  LoadingTimer,
  RefineBar,
  ResultMeta,
  TimeoutState,
  ToolError,
} from "@/components/ai/primitives";
import { useFormatters, useT } from "@/lib/i18n/client";

const T = {
  cs: {
    cardTitle: "Sestavit klastr z klíčových slov",
    clustersCount: "{n} klastrů",
    description:
      "Vyberte uložený seznam klíčových slov a nástroj z něj sestaví tematické klastry — pilířovou stránku a k ní podpůrné podstránky. Tlačítkem „Vytvořit brief“ pošlete pilíř i podpůrná slova rovnou do obsahového briefu.",
    loading: "Načítám uložené seznamy…",
    emptyTitle: "Žádné uložené seznamy",
    emptyDesc:
      "Nejdřív si v modulu „Klíčová slova“ vyhledejte a uložte seznam klíčových slov — z něj pak tady sestavíte klastry.",
    listLabel: "Uložený seznam",
    keywordsCount: "{n} slov",
    buildingBtn: "Sestavuji…",
    buildBtn: "Sestavit",
    noCluster: "Z tohoto seznamu se nepodařilo sestavit žádný klastr.",
    pillar: "Pilíř",
    supporting: "Podpůrná slova ({n})",
    createBrief: "Vytvořit brief",
    perMonth: "{n}/měs",
  },
  en: {
    cardTitle: "Build cluster from keywords",
    clustersCount: "{n} clusters",
    description:
      'Select a saved keyword list and the tool will build topic clusters from it — a pillar page plus supporting sub-pages. Use "Create brief" to send the pillar and supporting keywords straight to the content brief.',
    loading: "Loading saved lists…",
    emptyTitle: "No saved lists",
    emptyDesc:
      'First search and save a keyword list in the "Keywords" module — then use it here to build clusters.',
    listLabel: "Saved list",
    keywordsCount: "{n} keywords",
    buildingBtn: "Building…",
    buildBtn: "Build",
    noCluster: "No clusters could be built from this list.",
    pillar: "Pillar",
    supporting: "Supporting keywords ({n})",
    createBrief: "Create brief",
    perMonth: "{n}/mo",
  },
} as const;

/** Builds a topic-cluster map from one of the project's SAVED keyword lists by
 *  reusing the existing `keyword-clusters` AI tool, then hands each generated
 *  cluster to the content brief via the same sessionStorage seed + route handoff
 *  as DecayTable's "Refresh". Closes the gap where the engine's clusters were
 *  100 % static seed data with no path from real keyword research. */
export default function ClusterBuilder() {
  const { status: authStatus } = useSession();
  const project = useProject();
  const pid = project.id;
  const router = useRouter();
  const t = useT(T);
  const fmt = useFormatters();
  const clusters = useAiTool<KeywordClustersResult>("keyword-clusters");

  const [lists, setLists] = useState<KeywordList[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/keywords/lists${pid ? `?projectId=${pid}` : ""}`);
      if (!res.ok) return;
      const json = (await res.json()) as { lists?: KeywordList[] };
      const next = json.lists ?? [];
      setLists(next);
      setSelectedId((prev) => (prev && next.some((l) => l.id === prev) ? prev : next[0]?.id ?? ""));
    } catch {
      /* non-critical — the empty state covers a failed fetch */
    } finally {
      setLoaded(true);
    }
  }, [pid]);

  useEffect(() => {
    // Fetching the saved lists is an external-store sync; doing it in an effect
    // (not during render) keeps render pure for the React Compiler.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (authStatus === "authenticated") void load();
    else if (authStatus === "unauthenticated") setLoaded(true);
  }, [authStatus, load]);

  const selected = lists.find((l) => l.id === selectedId) ?? null;

  /** Send the chosen list's keywords to the clustering tool, carrying real volume
   *  + classified intent so the model groups by demand, not bare phrases. */
  const build = () => {
    if (!selected) return;
    clusters.run({
      topic: selected.seed || selected.name,
      keywords: selected.keywords.map((k) => ({
        keyword: k.keyword,
        volume: k.avgMonthlySearches,
        intent: k.intent,
      })),
    });
  };

  /** Reuse DecayTable's seed-and-route handoff for one generated cluster: the
   *  cluster topic becomes the brief topic, the pillar the primary keyword, and
   *  the supporting keywords the grounding set. */
  const briefFromCluster = (cluster: KeywordCluster) => {
    const seed: BriefSeed = {
      topic: cluster.topic || cluster.pillar,
      primaryKeyword: cluster.pillar,
      keywords: cluster.supporting.map((keyword) => ({ keyword, volume: 0, competition: "" })),
    };
    try {
      sessionStorage.setItem(briefSeedKey(project.id), JSON.stringify(seed));
    } catch {
      /* non-critical — the brief tool still opens, just unseeded */
    }
    router.push(`/app/${project.id}/obsah`);
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div className="flex items-center gap-2">
          <Network width={16} height={16} className="text-brand-accent" />
          <h3 className="text-base font-semibold text-navy-800">{t("cardTitle")}</h3>
        </div>
        {clusters.data?.result && (
          <Pill tone="brand">{t("clustersCount", { n: clusters.data.result.clusters.length })}</Pill>
        )}
      </div>

      <div className="space-y-4 p-5">
        <p className="text-xs leading-relaxed text-muted">{t("description")}</p>

        {!loaded ? (
          <p className="text-sm text-muted">{t("loading")}</p>
        ) : lists.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line bg-canvas/60 px-4 py-6 text-center">
            <Layers width={22} height={22} className="mx-auto text-brand-accent" />
            <p className="mt-2 text-sm font-medium text-navy-800">{t("emptyTitle")}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t("emptyDesc")}</p>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-sm font-medium text-navy-700">{t("listLabel")}</span>
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
              >
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name} ({t("keywordsCount", { n: list.keywords.length })})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={build}
              disabled={!selected || clusters.status === "loading"}
              className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
            >
              <Network width={15} height={15} />
              {clusters.status === "loading" ? t("buildingBtn") : t("buildBtn")}
            </button>
          </div>
        )}

        {clusters.status === "loading" && <LoadingTimer />}
        {clusters.status === "error" &&
          (clusters.timedOut ? (
            <TimeoutState onRetry={build} />
          ) : (
            <ToolError message={clusters.error ?? ""} onRetry={build} retryIn={clusters.retryIn} upgradeUrl={clusters.upgradeUrl} />
          ))}

        {clusters.status === "done" && clusters.data && (
          <div className="animate-fade-up space-y-3">
            <ResultMeta meta={clusters.data.meta} />
            {clusters.data.result.clusters.length === 0 ? (
              <p className="text-sm text-muted">{t("noCluster")}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {clusters.data.result.clusters.map((cluster, i) => (
                  <GeneratedClusterCard
                    key={`${cluster.pillar}-${i}`}
                    cluster={cluster}
                    onCreateBrief={() => briefFromCluster(cluster)}
                    t={t}
                    fmtInt={fmt.fmtInt}
                  />
                ))}
              </ul>
            )}
            {clusters.canRefine && <RefineBar onRefine={clusters.refine} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** One generated topic cluster: pillar keyword, supporting chips, summed volume,
 *  and the one-click brief handoff. */
function GeneratedClusterCard({
  cluster,
  onCreateBrief,
  t,
  fmtInt,
}: {
  cluster: KeywordCluster;
  onCreateBrief: () => void;
  t: (key: keyof typeof T.en, vars?: Record<string, string | number>) => string;
  fmtInt: (n: number) => string;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-navy-800">{cluster.topic}</span>
          {cluster.intent && (
            <span className="pill bg-navy-50 text-muted">{KEYWORD_INTENT_LABELS[cluster.intent]}</span>
          )}
          {typeof cluster.totalVolume === "number" && cluster.totalVolume > 0 && (
            <span className="pill bg-brand-50 text-brand-700 tnum">
              {t("perMonth", { n: fmtInt(cluster.totalVolume) })}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">{t("pillar")}</p>
        <p className="mt-0.5 text-sm font-medium text-navy-800">{cluster.pillar}</p>
        {cluster.supporting.length > 0 && (
          <>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
              {t("supporting", { n: cluster.supporting.length })}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cluster.supporting.map((kw) => (
                <span key={kw} className="pill bg-navy-50 text-navy-700">
                  {kw}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onCreateBrief}
        className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-pill border border-line px-3 py-2 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
      >
        <Bolt width={13} height={13} />
        {t("createBrief")}
        <ArrowRight width={13} height={13} />
      </button>
    </li>
  );
}
