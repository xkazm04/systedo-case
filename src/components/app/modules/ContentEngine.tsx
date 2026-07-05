"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  Bulb,
  Document,
  Layers,
  Network,
  Plus,
  Refresh,
} from "@/components/icons";
import { Pill } from "@/components/ui";
import Modal from "@/components/app/Modal";
import NextSteps from "@/components/app/NextSteps";
import SectionSkeleton from "@/components/app/SectionSkeleton";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import { isModuleAvailable } from "@/lib/projects/modules";
import { projectDataSource } from "@/lib/project-data/source";
import { rankedClusterStats, decayingPosts, type ClusterStat } from "@/lib/content-engine/compute";
import type { ClusterArticle, DecayingPost, TopicCluster } from "@/lib/content-engine/sample";
import type { KeywordList } from "@/lib/keywords/types";
import { useFormatters, useT } from "@/lib/i18n/client";

/** Heavy, modal-gated workspaces — code-split so their JS loads on first open,
 *  not in this module's initial bundle. Modal renders null while closed, so
 *  neither mounts (or downloads) until the user opens the builder / brief. */
const ClusterBuilder = dynamic(() => import("@/components/app/modules/ClusterBuilder"), {
  loading: () => <SectionSkeleton height="h-72" />,
});
const ContentBriefGenerator = dynamic(() => import("@/components/ai/ContentBriefGenerator"), {
  loading: () => <SectionSkeleton height="h-96" />,
});

const T = {
  cs: {
    sourceLive: "Živá data · Google Ads",
    sourceSample: "Ukázková data",
    keywordsChip: "{n} klíčových slov",
    patternsChip: "Podloženo {n} vzory",
    newContent: "Nový obsah",
    buildClusters: "Sestavit klastry z klíčových slov",
    clustersTitle: "Tematické klastry",
    clustersSub: "Pilíř + podpůrné stránky. Klikněte na řádek pro detail a tvorbu obsahu.",
    colTopic: "Téma",
    colCoverage: "Pokrytí",
    colVolume: "Objem/měs",
    colState: "Stav",
    missingPillar: "Chybí pilíř",
    linkDebt: "{n} odkazů chybí",
    nextGap: "Další: {title}",
    complete: "Kompletní",
    decayTitle: "Upadající obsah k obnově",
    decaySub: "Ztráta organické návštěvnosti meziročně. Klikněte pro obnovu přes AI brief.",
    decayPill: "{n} k obnově",
    colArticle: "Článek",
    colPublished: "Publikováno",
    colTraffic: "Návštěvnost YoY",
    colPriority: "Priorita",
    publishedAgo: "před {n} měs.",
    priorityHigh: "Vysoká",
    priorityMedium: "Střední",
    emptyDecay: "Žádný upadající obsah — vše drží výkon.",
    // cluster modal
    clusterArticles: "Články v klastru",
    pillarArticle: "Pilíř",
    supportingArticle: "Podpůrný",
    statusPublished: "Publikováno",
    statusPlanned: "Plánováno",
    internalLinks: "Prolinkování",
    linkOk: "propojeno",
    linkMissing: "{n} chybí",
    noLink: "bez odkazu",
    notPublished: "nepubl.",
    noPillarShort: "chybí pilíř",
    createBrief: "Vytvořit brief",
    createBriefGap: "Vytvořit brief pro další mezeru",
    // workspace
    wsNew: "Nový obsah — brief a koncept článku",
    wsFromCluster: "Obsah pro klastr „{topic}“",
    wsRefresh: "Obnova článku „{title}“",
    wsSeeded: "Obsahový brief",
    // next steps
    stepDistribute: "Distribuovat",
    stepDistributeHint: "Rozšířit hotový článek na sítě a newsletter",
    stepSocial: "Sociální sítě",
    stepSocialHint: "Naplánovat příspěvky z tohoto obsahu",
    stepCreative: "Kreativa",
    stepCreativeHint: "Vygenerovat vizuály k článku",
  },
  en: {
    sourceLive: "Live data · Google Ads",
    sourceSample: "Sample data",
    keywordsChip: "{n} keywords",
    patternsChip: "Grounded by {n} patterns",
    newContent: "New content",
    buildClusters: "Build clusters from keywords",
    clustersTitle: "Topic clusters",
    clustersSub: "Pillar + supporting pages. Click a row for detail and content creation.",
    colTopic: "Topic",
    colCoverage: "Coverage",
    colVolume: "Volume/mo",
    colState: "State",
    missingPillar: "Missing pillar",
    linkDebt: "{n} links missing",
    nextGap: "Next: {title}",
    complete: "Complete",
    decayTitle: "Decaying content to refresh",
    decaySub: "Year-over-year loss of organic traffic. Click to refresh via an AI brief.",
    decayPill: "{n} to refresh",
    colArticle: "Article",
    colPublished: "Published",
    colTraffic: "Traffic YoY",
    colPriority: "Priority",
    publishedAgo: "{n} mo. ago",
    priorityHigh: "High",
    priorityMedium: "Medium",
    emptyDecay: "No decaying content — everything holds its performance.",
    clusterArticles: "Articles in the cluster",
    pillarArticle: "Pillar",
    supportingArticle: "Supporting",
    statusPublished: "Published",
    statusPlanned: "Planned",
    internalLinks: "Internal links",
    linkOk: "linked",
    linkMissing: "{n} missing",
    noLink: "no link",
    notPublished: "unpubl.",
    noPillarShort: "no pillar",
    createBrief: "Create brief",
    createBriefGap: "Create brief for the next gap",
    wsNew: "New content — brief and article draft",
    wsFromCluster: "Content for the “{topic}” cluster",
    wsRefresh: "Refresh of “{title}”",
    wsSeeded: "Content brief",
    stepDistribute: "Distribute",
    stepDistributeHint: "Push the finished article to social and newsletter",
    stepSocial: "Social media",
    stepSocialHint: "Schedule posts from this content",
    stepCreative: "Creative",
    stepCreativeHint: "Generate visuals for the article",
  },
} as const;

/** A workspace request: which seed (if any) prefills the brief, plus a title and a
 *  nonce that forces ContentBriefGenerator to remount so the seed always applies. */
interface Workspace {
  seed: BriefSeed | null;
  title: string;
  nonce: number;
}

/** Brief seed from a cluster (optionally a specific article): the cluster topic is
 *  the primary keyword, the article/gap title is what to write. */
function seedFromCluster(cluster: ClusterStat, article?: ClusterArticle): BriefSeed {
  return {
    topic: article?.title ?? cluster.nextGap?.title ?? cluster.topic,
    primaryKeyword: cluster.topic,
    keywords: [],
  };
}

function seedFromDecay(post: DecayingPost): BriefSeed {
  return { topic: post.title, primaryKeyword: post.title, keywords: [] };
}

/** The unified "Obsahový engine": a view-first surface (compact cluster + decay
 *  tables) where every row opens a detail/action modal, and every content-creation
 *  action opens the brief → article-draft workspace in a modal — seeded from the
 *  clicked row, from your saved keywords, or from a hand-off written by another
 *  module (compare-seo, keywords, lp-experiments) into session storage. */
export default function ContentEngine({
  clusters,
  decay,
}: {
  clusters: TopicCluster[];
  decay: DecayingPost[];
}) {
  const project = useProject();
  const t = useT(T);
  const fmt = useFormatters();
  const ds = projectDataSource(project);

  const stats = useMemo(() => rankedClusterStats(clusters), [clusters]);
  const decaying = useMemo(() => decayingPosts(decay), [decay]);

  const [ws, setWs] = useState<Workspace | null>(null);
  const [cluster, setCluster] = useState<ClusterStat | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);

  // Interconnect signals fetched client-side; both endpoints return empty for the
  // anonymous demo tenant, so the chips simply don't show there.
  const [savedLists, setSavedLists] = useState<KeywordList[]>([]);
  const [patternCount, setPatternCount] = useState(0);

  const openWorkspace = (seed: BriefSeed | null, title: string) =>
    setWs((prev) => ({ seed, title, nonce: (prev?.nonce ?? 0) + 1 }));

  // Backward-compatible hand-off: other modules (keyword research, compare-seo,
  // lp-experiments, decay refresh elsewhere) route here after writing a BriefSeed
  // to session storage. Read it once on mount and open the workspace seeded.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(briefSeedKey(project.id));
      if (raw) {
        const seed = JSON.parse(raw) as BriefSeed;
        sessionStorage.removeItem(briefSeedKey(project.id));
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setWs({ seed, title: seed.topic || T.cs.wsSeeded, nonce: 1 });
      }
    } catch {
      /* ignore malformed/absent seed */
    }
  }, [project.id]);

  useEffect(() => {
    let alive = true;
    const q = `?projectId=${encodeURIComponent(project.id)}`;
    fetch(`/api/keywords/lists${q}`)
      .then((r) => (r.ok ? r.json() : { lists: [] }))
      .then((j: { lists?: KeywordList[] }) => {
        if (alive) setSavedLists(j.lists ?? []);
      })
      .catch(() => {});
    fetch(`/api/patterns${q}`)
      .then((r) => (r.ok ? r.json() : { auto: [], saved: [] }))
      .then((j: { auto?: unknown[]; saved?: unknown[] }) => {
        if (alive) setPatternCount((j.auto?.length ?? 0) + (j.saved?.length ?? 0));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project.id]);

  const totalKeywords = savedLists.reduce((n, l) => n + l.keywords.length, 0);

  const nextSteps = [
    { to: "distribuce", label: t("stepDistribute"), hint: t("stepDistributeHint") },
    { to: "socialni", label: t("stepSocial"), hint: t("stepSocialHint") },
    { to: "kreativa", label: t("stepCreative"), hint: t("stepCreativeHint") },
  ].filter((s) => isModuleAvailable(project.type, s.to));

  return (
    <div className="stagger space-y-6">
      {/* header: honest data-source labeling + interconnect chips + primary actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={ds.live ? "positive" : "neutral"}>{ds.live ? t("sourceLive") : t("sourceSample")}</Pill>
          {totalKeywords > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
              <Layers width={13} height={13} />
              {t("keywordsChip", { n: totalKeywords })}
            </span>
          )}
          {patternCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-navy-50 px-3 py-1 text-xs font-medium text-navy-700">
              <Bulb width={13} height={13} />
              {t("patternsChip", { n: patternCount })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBuilderOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-2 text-sm font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
          >
            <Network width={15} height={15} />
            {t("buildClusters")}
          </button>
          <button
            type="button"
            onClick={() => openWorkspace(null, t("wsNew"))}
            className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            <Plus width={15} height={15} />
            {t("newContent")}
          </button>
        </div>
      </div>

      {/* clusters — compact, view-first table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-navy-800">{t("clustersTitle")}</h3>
            <p className="mt-0.5 text-sm text-muted">{t("clustersSub")}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colTopic")}</th>
                <th className="px-4 py-3 font-medium">{t("colCoverage")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colVolume")}</th>
                <th className="px-4 py-3 font-medium">{t("colState")}</th>
                <th className="w-8 px-4 py-3" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {stats.map((c) => (
                <tr
                  key={c.topic}
                  onClick={() => setCluster(c)}
                  className="group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-brand-50/40"
                >
                  <td className="px-5 py-3 font-medium text-navy-800">{c.topic}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-navy-50">
                        <span
                          className="block h-full rounded-full bg-brand-500"
                          style={{ width: `${Math.round(c.completeness * 100)}%` }}
                        />
                      </span>
                      <span className="tnum text-xs text-muted">
                        {c.published}/{c.total}
                      </span>
                    </div>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-muted">{fmt.fmtInt(c.volume)}</td>
                  <td className="px-4 py-3">{clusterStatePill(c, t)}</td>
                  <td className="px-4 py-3 text-right">
                    <ArrowRight
                      width={16}
                      height={16}
                      className="text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand-accent"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* decaying content — compact table, row opens the refresh workspace */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-navy-800">{t("decayTitle")}</h3>
            <p className="mt-0.5 text-sm text-muted">{t("decaySub")}</p>
          </div>
          {decaying.length > 0 && <Pill tone="coral">{t("decayPill", { n: decaying.length })}</Pill>}
        </div>
        {decaying.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">{t("emptyDecay")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-3 font-medium">{t("colArticle")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colPublished")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("colTraffic")}</th>
                  <th className="px-4 py-3 font-medium">{t("colPriority")}</th>
                  <th className="w-8 px-4 py-3" aria-hidden />
                </tr>
              </thead>
              <tbody>
                {decaying.map((p) => (
                  <tr
                    key={p.title}
                    onClick={() => openWorkspace(seedFromDecay(p), t("wsRefresh", { title: p.title }))}
                    className="group cursor-pointer border-b border-line/70 transition-colors last:border-0 hover:bg-brand-50/40"
                  >
                    <td className="px-5 py-3 font-medium text-navy-800">{p.title}</td>
                    <td className="tnum px-4 py-3 text-right text-muted">
                      {t("publishedAgo", { n: p.monthsAgo })}
                    </td>
                    <td className="tnum px-4 py-3 text-right font-semibold text-negative">
                      {fmt.fmtSignedPct(p.trafficChangePct)}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={p.trafficChangePct <= -0.3 ? "negative" : "coral"}>
                        {p.trafficChangePct <= -0.3 ? t("priorityHigh") : t("priorityMedium")}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Refresh
                        width={15}
                        height={15}
                        className="text-muted transition-colors group-hover:text-brand-accent"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {nextSteps.length > 0 && <NextSteps steps={nextSteps} />}

      {/* ---- Cluster detail modal (layer 2) ---- */}
      <Modal
        open={cluster !== null}
        onClose={() => setCluster(null)}
        size="lg"
        title={cluster?.topic}
        description={
          cluster
            ? `${cluster.published}/${cluster.total} · ${fmt.fmtPct(cluster.completeness)} · ${fmt.fmtInt(
                cluster.volume
              )} ${t("colVolume").toLowerCase()}`
            : undefined
        }
      >
        {cluster && (
          <ClusterDetail
            cluster={cluster}
            t={t}
            onCreateBrief={(article) => {
              const c = cluster;
              setCluster(null);
              openWorkspace(seedFromCluster(c, article), t("wsFromCluster", { topic: c.topic }));
            }}
          />
        )}
      </Modal>

      {/* ---- Keywords → clusters bridge (layer 2) ---- */}
      <Modal open={builderOpen} onClose={() => setBuilderOpen(false)} size="lg" title={t("buildClusters")}>
        <ClusterBuilder />
      </Modal>

      {/* ---- Content workspace: brief → article draft (layer 2 / "Add") ---- */}
      <Modal open={ws !== null} onClose={() => setWs(null)} size="full" title={ws?.title}>
        {ws && <ContentBriefGenerator key={ws.nonce} seed={ws.seed} />}
      </Modal>
    </div>
  );
}

/** The compact status pill in the clusters table: the single most urgent signal. */
function clusterStatePill(c: ClusterStat, t: ReturnType<typeof useT<keyof typeof T.cs>>) {
  if (!c.hasPillar) return <Pill tone="coral">{t("missingPillar")}</Pill>;
  if (c.graph.missingLinks > 0) return <Pill tone="coral">{t("linkDebt", { n: c.graph.missingLinks })}</Pill>;
  if (c.nextGap) return <Pill tone="neutral">{t("nextGap", { title: c.nextGap.title })}</Pill>;
  return <Pill tone="positive">{t("complete")}</Pill>;
}

/** Cluster modal body: the hub-and-spoke link state + every article, each with a
 *  "Create brief" action that opens the workspace seeded for that article. */
function ClusterDetail({
  cluster,
  t,
  onCreateBrief,
}: {
  cluster: ClusterStat;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
  onCreateBrief: (article?: ClusterArticle) => void;
}) {
  const { graph } = cluster;
  const pillarPublished = graph.pillar?.status === "published";
  return (
    <div className="space-y-5">
      {/* internal-link map */}
      <div className="rounded-lg border border-line bg-canvas/60 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">{t("internalLinks")}</span>
          {graph.missingLinks > 0 ? (
            <span className="pill tnum bg-coral-soft text-coral-600">
              {t("linkMissing", { n: graph.missingLinks })}
            </span>
          ) : (
            <span className="pill bg-positive-soft text-positive">{t("linkOk")}</span>
          )}
        </div>
        <div className="mt-2.5 flex flex-col items-center gap-1.5">
          <span
            className={`rounded-pill px-3 py-1 text-xs font-semibold ${
              graph.pillar
                ? "bg-brand-600 text-white"
                : "border border-dashed border-coral-400/50 text-coral-600"
            }`}
          >
            {graph.pillar ? graph.pillar.title : t("missingPillar")}
          </span>
          {graph.links.length > 0 && (
            <ul className="mt-1 grid w-full gap-1">
              {graph.links.map((l) => (
                <li
                  key={l.from}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-xs ${
                    l.linked ? "bg-brand-50 text-brand-800" : "bg-coral-soft text-coral-600"
                  }`}
                >
                  <span aria-hidden className="font-mono">
                    {l.linked ? "──" : "╌╌"}
                  </span>
                  <span className="min-w-0 truncate">{l.from}</span>
                  {!l.linked && (
                    <span className="ml-auto shrink-0 font-medium">
                      {!l.published ? t("notPublished") : !pillarPublished ? t("noPillarShort") : t("noLink")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* article list — each is a create-brief entry point */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("clusterArticles")}</p>
        <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
          {cluster.articles.map((a) => (
            <li key={a.title} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                    a.type === "pillar" ? "bg-brand-600 text-white" : "bg-brand-50 text-brand-800"
                  }`}
                >
                  {a.type === "pillar" ? t("pillarArticle") : t("supportingArticle")}
                </span>
                <span className="min-w-0 truncate text-sm text-navy-800">{a.title}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Pill tone={a.status === "published" ? "positive" : "neutral"}>
                  {a.status === "published" ? t("statusPublished") : t("statusPlanned")}
                </Pill>
                <button
                  type="button"
                  onClick={() => onCreateBrief(a)}
                  className="inline-flex items-center gap-1 rounded-pill border border-line px-2.5 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
                >
                  <Document width={13} height={13} />
                  {t("createBrief")}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {cluster.nextGap && (
        <button
          type="button"
          onClick={() => onCreateBrief(cluster.nextGap ?? undefined)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <ArrowRight width={16} height={16} />
          {t("createBriefGap")}
        </button>
      )}
    </div>
  );
}
