"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useOptionalProject } from "@/lib/projects/context";
import { ArrowRight, Bolt, Check, Gauge, Network, Search } from "@/components/icons";
import { useFormatters, useT } from "@/lib/i18n/client";
import type {
  BriefKeyword,
  KeywordCluster,
  KeywordClustersResult,
} from "@/lib/ai-types";
import {
  COMPETITION_LABELS,
  KEYWORD_INTENT_LABELS,
  type KeywordIdea,
  type KeywordIntent,
  type KeywordResult,
} from "@/lib/keywords/types";
import { useAiTool } from "./useAiTool";
import {
  Field,
  LoadingTimer,
  RefineBar,
  ResultMeta,
  TimeoutState,
  ToolEmpty,
  ToolError,
  inputClass,
} from "./primitives";

const T = {
  cs: {
    formHeading: "Téma k prozkoumání",
    fillExample: "Vyplnit ukázku",
    fieldSeed: "Klíčové slovo / téma",
    fieldUrl: "Cílová URL (volitelné)",
    submitSearching: "Hledám…",
    submitSearch: "Najít klíčová slova",
    footerNote: "Reálná hledanost a konkurence z Google Ads Keyword Planneru u připojeného účtu; jinak realistická ukázková data. „Příležitost“ kombinuje vysokou hledanost s nízkou konkurencí.",
    emptyTitle: "Výzkum klíčových slov se zobrazí tady",
    emptyBody: "Zadejte téma. Nástroj najde související dotazy s hledaností, konkurencí a CPC, seřadí je podle příležitosti a předá výběr do obsahového briefu.",
    emptyHint: "Tip: zkuste „Vyplnit ukázku“ a klikněte na Najít klíčová slova.",
    loadingLabel: "Sestavuji návrhy klíčových slov…",
    errorDefault: "Něco se pokazilo.",
    errorConnect: "Nepodařilo se spojit se serverem.",
    resultsBadge: "{n} návrhů",
    sourceLive: "Google Ads · živá data",
    sourceDemo: "Ukázková data",
    selectedCount: "{n} vybráno",
    clusterButton: "Seskupit do klastrů",
    clusteringButton: "Seskupuji…",
    clusterTitleHoverSelected: "Seskupit vybraná slova do tematických klastrů",
    clusterTitleHoverAll: "Seskupit všechna slova do tematických klastrů",
    saveList: "Uložit seznam",
    saving: "Ukládám…",
    saved: "Uloženo",
    clustersHeading: "Tematické klastry ({n})",
    clustersIntro: "Každý klastr je připravená struktura obsahu: jedna pilířová stránka a k ní podpůrné podstránky. Tlačítkem „Vytvořit brief“ pošlete pilíř i podpůrná slova rovnou do obsahového briefu.",
    filterAll: "Vše",
    briefFromSelection: "Vytvořit brief z výběru ({n})",
    briefFromTop: "Vytvořit brief z TOP slov",
    perMonth: "/měs",
    competition: "konkurence",
    cpc: "CPC",
    opportunity: "Příležitost",
    clusterPillarLabel: "Pilíř",
    clusterSupportingLabel: "Podpůrná slova ({n})",
    clusterCreateBrief: "Vytvořit brief",
    clusterVolumeHint: "{n}/měs",
  },
  en: {
    formHeading: "Topic to research",
    fillExample: "Fill example",
    fieldSeed: "Keyword / topic",
    fieldUrl: "Target URL (optional)",
    submitSearching: "Searching…",
    submitSearch: "Find keywords",
    footerNote: "Real search volume and competition from Google Ads Keyword Planner when connected; otherwise realistic sample data. “Opportunity” combines high volume with low competition.",
    emptyTitle: "Keyword research will appear here",
    emptyBody: "Enter a topic. The tool finds related queries with search volume, competition and CPC, ranks them by opportunity and passes your selection to the content brief.",
    emptyHint: "Tip: try “Fill example” and click Find keywords.",
    loadingLabel: "Building keyword suggestions…",
    errorDefault: "Something went wrong.",
    errorConnect: "Could not connect to the server.",
    resultsBadge: "{n} suggestions",
    sourceLive: "Google Ads · live data",
    sourceDemo: "Sample data",
    selectedCount: "{n} selected",
    clusterButton: "Cluster into topics",
    clusteringButton: "Clustering…",
    clusterTitleHoverSelected: "Cluster selected keywords into topic groups",
    clusterTitleHoverAll: "Cluster all keywords into topic groups",
    saveList: "Save list",
    saving: "Saving…",
    saved: "Saved",
    clustersHeading: "Topic clusters ({n})",
    clustersIntro: "Each cluster is a ready-made content structure: one pillar page with supporting sub-pages. Click “Create brief” to pass the pillar and supporting keywords straight to the content brief.",
    filterAll: "All",
    briefFromSelection: "Create brief from selection ({n})",
    briefFromTop: "Create brief from TOP keywords",
    perMonth: "/mo",
    competition: "competition",
    cpc: "CPC",
    opportunity: "Opportunity",
    clusterPillarLabel: "Pillar",
    clusterSupportingLabel: "Supporting keywords ({n})",
    clusterCreateBrief: "Create brief",
    clusterVolumeHint: "{n}/mo",
  },
} as const;

type Status = "idle" | "loading" | "done" | "error";
type IntentFilter = "all" | KeywordIntent;

export interface BriefSeed {
  topic: string;
  primaryKeyword: string;
  keywords: BriefKeyword[];
}

const COMP_COLOR: Record<string, string> = {
  low: "text-positive",
  medium: "text-coral-600",
  high: "text-negative",
};

/** Keyword research + content-gap tool. Pulls keyword ideas with real volume /
 *  competition / CPC (Google Ads Keyword Planner when connected, deterministic
 *  sample otherwise), ranks them by opportunity, and hands the selection to the
 *  brief tool — grounding content planning in actual demand. */
export default function KeywordResearch({
  onCreateBrief,
  onSaved,
  initialSeed,
}: {
  onCreateBrief: (seed: BriefSeed) => void;
  onSaved?: () => void;
  /** Prefill + auto-run for a seed handed in from elsewhere (e.g. a Lokální
   *  coverage gap → "prozkoumat klíčová slova"), so the bridge lands on results. */
  initialSeed?: string;
}) {
  const t = useT(T);
  const fmt = useFormatters();
  const { status: authStatus } = useSession();
  const project = useOptionalProject();
  const pid = project?.id;
  const [seed, setSeed] = useState(initialSeed ?? "");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<KeywordResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<IntentFilter>("all");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");

  // AI clustering of the current research into pillar + supporting topic clusters.
  const clusters = useAiTool<KeywordClustersResult>("keyword-clusters");

  const canSubmit = seed.trim().length >= 2 && status !== "loading";

  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setError(null);
    setSelected(new Set());
    setFilter("all");
    setSaveState("idle");
    clusters.reset();
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: seed.trim(), url: url.trim() || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error ?? t("errorDefault"));
        setStatus("error");
        return;
      }
      setResult(json as KeywordResult);
      setStatus("done");
    } catch {
      setError(t("errorConnect"));
      setStatus("error");
    }
  }

  // Auto-run once when a seed was handed in (the Lokální-gap bridge), so the maker
  // lands straight on the demand for that service×area instead of an empty field.
  const autoRan = useRef(false);
  useEffect(() => {
    if (initialSeed && !autoRan.current) {
      autoRan.current = true;
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (kw: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(kw)) next.delete(kw);
      else next.add(kw);
      return next;
    });

  const visible = useMemo(
    () => (result ? result.ideas.filter((i) => filter === "all" || i.intent === filter) : []),
    [result, filter]
  );

  const createBrief = () => {
    if (!result) return;
    const picks = result.ideas.filter((i) => selected.has(i.keyword));
    const chosen = picks.length ? picks : result.ideas.slice(0, 8);
    // Highest-opportunity pick becomes the primary keyword (ideas are sorted desc).
    const primary = chosen[0]?.keyword ?? result.seed;
    onCreateBrief({
      topic: result.seed,
      primaryKeyword: primary,
      keywords: chosen.map((i) => ({
        keyword: i.keyword,
        volume: i.avgMonthlySearches,
        competition: i.competition,
      })),
    });
  };

  /** Send the current research (selected keywords, or the full set) to the AI
   *  clustering tool. Carries volume + classified intent so the model groups by
   *  real demand and intent rather than the bare phrases. */
  const runClusters = () => {
    if (!result) return;
    const picks = selected.size > 0 ? result.ideas.filter((i) => selected.has(i.keyword)) : result.ideas;
    clusters.run({
      topic: result.seed,
      keywords: picks.map((i) => ({
        keyword: i.keyword,
        volume: i.avgMonthlySearches,
        intent: i.intent,
      })),
    });
  };

  // Lookup from the current research, so a cluster's keywords carry their real
  // volume + competition into the brief handoff (the cluster payload omits them).
  const ideaByKeyword = useMemo(() => {
    const map = new Map<string, KeywordIdea>();
    if (result) for (const i of result.ideas) map.set(i.keyword, i);
    return map;
  }, [result]);

  /** Reuse the existing brief handoff for a single cluster pillar: the cluster
   *  topic becomes the brief topic, the pillar the primary keyword, and the
   *  supporting keywords the grounding set. */
  const briefFromCluster = (cluster: KeywordCluster) => {
    const toBriefKeyword = (keyword: string): BriefKeyword => {
      const idea = ideaByKeyword.get(keyword);
      return {
        keyword,
        volume: idea?.avgMonthlySearches ?? 0,
        competition: idea?.competition ?? "",
      };
    };
    onCreateBrief({
      topic: cluster.topic || result?.seed || cluster.pillar,
      primaryKeyword: cluster.pillar,
      keywords: [cluster.pillar, ...cluster.supporting].map(toBriefKeyword),
    });
  };

  /** Persist the current research as a named list. Selected keywords are tagged
   *  "core", the rest "watch" — ready for negative tagging in the saved panel. */
  const saveList = async () => {
    if (!result || saveState === "saving") return;
    setSaveState("saving");
    try {
      const keywords = result.ideas.map((i) => ({
        keyword: i.keyword,
        intent: i.intent,
        opportunity: i.opportunity,
        avgMonthlySearches: i.avgMonthlySearches,
        competition: i.competition,
        tag: selected.has(i.keyword) ? "core" : "watch",
      }));
      const res = await fetch("/api/keywords/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: result.seed, seed: result.seed, source: result.source, keywords, projectId: pid }),
      });
      if (!res.ok) {
        setSaveState("idle");
        return;
      }
      setSaveState("saved");
      onSaved?.();
    } catch {
      setSaveState("idle");
    }
  };

  const intentsPresent = result ? result.groups.map((g) => g.intent) : [];

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
      <form onSubmit={run} className="card space-y-5 p-6 lg:sticky lg:top-24">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-navy-800">{t("formHeading")}</h2>
          <button
            type="button"
            onClick={() => {
              setSeed("ořechy");
              setUrl("");
            }}
            className="text-xs font-semibold text-brand-accent hover:text-brand-800"
          >
            {t("fillExample")}
          </button>
        </div>

        <Field label={t("fieldSeed")} htmlFor="kw-seed">
          <input
            id="kw-seed"
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="ořechy"
            className={inputClass}
          />
        </Field>

        <Field label={t("fieldUrl")} htmlFor="kw-url">
          <input
            id="kw-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mionelo.cz/orechy"
            className={inputClass}
          />
        </Field>

        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100"
        >
          {status === "loading" ? (
            <>
              <Gauge width={17} height={17} className="animate-pulse" />
              {t("submitSearching")}
            </>
          ) : (
            <>
              <Search width={17} height={17} />
              {t("submitSearch")}
            </>
          )}
        </button>

        <p className="text-xs leading-relaxed text-muted">
          {t("footerNote")}
        </p>
      </form>

      <div className="min-w-0">
        {status === "idle" && (
          <ToolEmpty
            icon={Search}
            title={t("emptyTitle")}
            body={t("emptyBody")}
            hint={t("emptyHint")}
          />
        )}
        {status === "loading" && (
          <div className="card flex animate-fade-in items-center justify-center gap-3 p-12 text-sm text-muted">
            <Gauge width={18} height={18} className="animate-pulse text-brand-600" />
            {t("loadingLabel")}
          </div>
        )}
        {status === "error" && <ToolError message={error ?? ""} onRetry={() => setStatus("idle")} />}

        {status === "done" && result && (
          <div className="animate-fade-up space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill bg-navy-50 text-navy-700">{t("resultsBadge", { n: result.ideas.length })}</span>
                <span
                  className={`pill ${
                    result.source === "google-ads" ? "bg-positive-soft text-positive" : "bg-coral-soft text-coral-600"
                  }`}
                >
                  {result.source === "google-ads" ? t("sourceLive") : t("sourceDemo")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {selected.size > 0 && (
                  <span className="text-xs text-muted">{t("selectedCount", { n: selected.size })}</span>
                )}
                <button
                  type="button"
                  onClick={runClusters}
                  disabled={clusters.status === "loading"}
                  title={
                    selected.size > 0
                      ? t("clusterTitleHoverSelected")
                      : t("clusterTitleHoverAll")
                  }
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-60"
                >
                  <Network width={13} height={13} />
                  {clusters.status === "loading" ? t("clusteringButton") : t("clusterButton")}
                </button>
                {authStatus === "authenticated" && (
                  <button
                    type="button"
                    onClick={saveList}
                    disabled={saveState !== "idle"}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-semibold text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent disabled:opacity-60"
                  >
                    {saveState === "saved" ? (
                      <>
                        <Check width={13} height={13} /> {t("saved")}
                      </>
                    ) : (
                      <>{saveState === "saving" ? t("saving") : t("saveList")}</>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* AI clustering output — pillar + supporting topic clusters over the
                current research, each with a one-click brief handoff. */}
            {clusters.status === "loading" && <LoadingTimer expectedMs={clusters.expectedMs} />}
            {clusters.status === "error" &&
              (clusters.timedOut ? (
                <TimeoutState onRetry={runClusters} />
              ) : (
                <ToolError message={clusters.error ?? ""} onRetry={runClusters} retryIn={clusters.retryIn} upgradeUrl={clusters.upgradeUrl} />
              ))}
            {clusters.status === "done" && clusters.data && (
              <div className="animate-fade-up space-y-3 rounded-card border border-line bg-canvas/60 p-4">
                <div className="flex items-center gap-2">
                  <Network width={16} height={16} className="text-brand-accent" />
                  <h3 className="text-sm font-semibold text-navy-800">
                    {t("clustersHeading", { n: clusters.data.result.clusters.length })}
                  </h3>
                </div>
                <ResultMeta meta={clusters.data.meta} />
                <p className="text-xs leading-relaxed text-muted">
                  {t("clustersIntro")}
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {clusters.data.result.clusters.map((cluster, i) => (
                    <ClusterCard
                      key={`${cluster.pillar}-${i}`}
                      cluster={cluster}
                      onCreateBrief={() => briefFromCluster(cluster)}
                      t={t}
                      fmt={fmt}
                    />
                  ))}
                </ul>
                {clusters.canRefine && <RefineBar onRefine={clusters.refine} />}
              </div>
            )}

            {/* intent filter */}
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
              {(["all", ...intentsPresent] as IntentFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                  className={`shrink-0 rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                    filter === f
                      ? "border-brand-400 bg-brand-50 text-brand-800"
                      : "border-line text-muted hover:border-navy-200"
                  }`}
                >
                  {f === "all" ? t("filterAll") : KEYWORD_INTENT_LABELS[f]}
                </button>
              ))}
            </div>

            <ul className="space-y-2">
              {visible.map((idea) => (
                <IdeaRow
                  key={idea.keyword}
                  idea={idea}
                  checked={selected.has(idea.keyword)}
                  onToggle={() => toggle(idea.keyword)}
                  t={t}
                  fmt={fmt}
                />
              ))}
            </ul>

            <div className="sticky bottom-4 flex justify-end">
              <button
                type="button"
                onClick={createBrief}
                className="inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-pop transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99]"
              >
                <Bolt width={16} height={16} />
                {selected.size > 0
                  ? t("briefFromSelection", { n: selected.size })
                  : t("briefFromTop")}
                <ArrowRight width={16} height={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaRow({
  idea,
  checked,
  onToggle,
  t,
  fmt,
}: {
  idea: KeywordIdea;
  checked: boolean;
  onToggle: () => void;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
  fmt: ReturnType<typeof useFormatters>;
}) {
  return (
    <li>
      <label
        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
          checked ? "border-brand-400 bg-brand-50" : "border-line hover:border-navy-200"
        }`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          className="h-4 w-4 shrink-0 accent-brand-600"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-navy-800">{idea.keyword}</span>
            <span className="pill bg-navy-50 text-muted">{KEYWORD_INTENT_LABELS[idea.intent]}</span>
          </span>
          <span className="mt-0.5 block text-xs text-muted">
            <span className="tnum">{fmt.fmtInt(idea.avgMonthlySearches)}</span>{t("perMonth")} · {t("competition")}{" "}
            <span className={COMP_COLOR[idea.competition]}>{COMPETITION_LABELS[idea.competition]}</span> · {t("cpc")}{" "}
            <span className="tnum">
              {fmt.fmtCZK(idea.lowBidCzk)}–{fmt.fmtCZK(idea.highBidCzk)}
            </span>
          </span>
        </span>
        <span className="w-16 shrink-0 text-right">
          <span className="text-[13px] text-muted">{t("opportunity")}</span>
          <span className="mt-0.5 flex items-center justify-end gap-1.5">
            <span className="h-1.5 w-8 overflow-hidden rounded-full bg-navy-50" aria-hidden>
              <span
                className="block h-full rounded-full bg-brand-500"
                style={{ width: `${idea.opportunity}%` }}
              />
            </span>
            <span className="tnum text-xs font-semibold text-navy-800">{idea.opportunity}</span>
          </span>
        </span>
      </label>
    </li>
  );
}

/** One topic cluster: the pillar keyword (the page to build first), its
 *  supporting keywords (the subpages), the summed monthly volume, and a one-click
 *  handoff that seeds the content brief from this cluster. */
function ClusterCard({
  cluster,
  onCreateBrief,
  t,
  fmt,
}: {
  cluster: KeywordCluster;
  onCreateBrief: () => void;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
  fmt: ReturnType<typeof useFormatters>;
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
              {t("clusterVolumeHint", { n: fmt.fmtInt(cluster.totalVolume) })}
            </span>
          )}
        </div>
        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">{t("clusterPillarLabel")}</p>
        <p className="mt-0.5 text-sm font-medium text-navy-800">{cluster.pillar}</p>
        {cluster.supporting.length > 0 && (
          <>
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">
              {t("clusterSupportingLabel", { n: cluster.supporting.length })}
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
        {t("clusterCreateBrief")}
        <ArrowRight width={13} height={13} />
      </button>
    </li>
  );
}
