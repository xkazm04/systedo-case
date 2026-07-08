"use client";

import { Bolt, Check, Document, Download, Layers, Search, Share } from "@/components/icons";
import { downloadText } from "@/lib/export";
import { useT } from "@/lib/i18n/client";
import {
  TONE_LABELS,
  TONES,
  type ArticleDraftResult,
  type BriefResult,
  type KeywordClustersResult,
  type RepurposeResult,
  type Tone,
} from "@/lib/ai-types";
import { CHANNEL_LIMITS, REPURPOSE_CHANNELS } from "@/lib/distribution/generate";
import {
  briefToArticleDraftRequest,
  clusterToBriefRequest,
  draftToMarkdownDoc,
  draftToRepurposeRequest,
  parseKeywordLines,
} from "@/lib/ai/pipeline";
import { useAiTool } from "./useAiTool";
import { usePersistedForm } from "./usePersistedForm";
import {
  CharCount,
  CopyButton,
  Field,
  LoadingTimer,
  ResultMeta,
  TimeoutState,
  ToolError,
  inputClass,
} from "./primitives";

const T = {
  cs: {
    heading: "Obsahová linka",
    intro:
      "Jeden vstup, hotový obsah ven: klíčová slova se seskupí do témat, vybrané téma se rozepíše do briefu, brief do konceptu článku a článek do variant pro kanály. Každý krok je samostatné generování (4 kroky = 4 volání, počítají se do limitu) a mezi kroky můžete výsledek zkontrolovat.",
    fillExample: "Vyplnit ukázku",
    restart: "Začít znovu",
    restartTitle: "Zahodit výsledky všech kroků a začít od klíčových slov",
    step1Title: "Klíčová slova → témata",
    fieldTopic: "Zastřešující téma (volitelné)",
    placeholderTopic: "Skladování a čerstvost ořechů",
    fieldAudience: "Cílová skupina",
    placeholderAudience: "Lidé, kteří kupují ořechy do zásoby",
    fieldKeywords: "Klíčová slova (jedno na řádek, volitelně „slovo; hledanost“)",
    placeholderKeywords: "skladování ořechů; 720\njak skladovat vlašské ořechy; 210\nžluknutí ořechů; 90",
    keywordsParsed: "{n} klíčových slov připraveno",
    keywordsNeedTwo: "Zadejte alespoň 2 klíčová slova.",
    runClusters: "Seskupit do témat",
    running: "Generuji…",
    pickCluster: "Vyberte téma, ze kterého vznikne brief:",
    clusterPillar: "Pilíř: {kw}",
    clusterSupporting: "{n} podpůrných",
    clusterVolume: "Σ {n} hledání/měs.",
    step2Title: "Téma → obsahový brief",
    step2Locked: "Nejdřív seskupte klíčová slova a vyberte téma v kroku 1.",
    step2NeedAudience: "Doplňte cílovou skupinu v kroku 1 (brief ji potřebuje).",
    runBrief: "Vytvořit brief",
    briefOutline: "Osnova ({n} sekcí):",
    step3Title: "Brief → koncept článku",
    step3Locked: "Nejdřív vytvořte brief v kroku 2.",
    runDraft: "Rozepsat článek",
    draftSummary: "{blocks} bloků obsahu · {faq} otázek FAQ",
    downloadMd: "Stáhnout .md",
    downloadMdTitle: "Stáhnout koncept článku jako Markdown",
    step4Title: "Článek → distribuce do kanálů",
    step4Locked: "Nejdřív rozepište článek v kroku 3.",
    fieldChannels: "Kanály",
    fieldTone: "Tón komunikace",
    needChannel: "Vyberte alespoň jeden kanál.",
    runDistribution: "Vytvořit varianty",
    variantsDone: "Hotovo — {n} variant připravených k publikaci.",
  },
  en: {
    heading: "Content pipeline",
    intro:
      "One input, finished content out: keywords are clustered into topics, the chosen topic expands into a brief, the brief into an article draft and the article into channel variants. Each step is its own generation (4 steps = 4 calls, counted against the limit) and you can review the result between steps.",
    fillExample: "Fill example",
    restart: "Start over",
    restartTitle: "Discard every step's results and start from keywords",
    step1Title: "Keywords → topics",
    fieldTopic: "Overarching topic (optional)",
    placeholderTopic: "Nut storage and freshness",
    fieldAudience: "Target audience",
    placeholderAudience: "People who buy nuts in bulk",
    fieldKeywords: "Keywords (one per line, optionally “keyword; volume”)",
    placeholderKeywords: "storing nuts; 720\nhow to store walnuts; 210\nrancid nuts; 90",
    keywordsParsed: "{n} keywords ready",
    keywordsNeedTwo: "Enter at least 2 keywords.",
    runClusters: "Cluster into topics",
    running: "Generating…",
    pickCluster: "Pick the topic the brief will be built from:",
    clusterPillar: "Pillar: {kw}",
    clusterSupporting: "{n} supporting",
    clusterVolume: "Σ {n} searches/mo",
    step2Title: "Topic → content brief",
    step2Locked: "Cluster the keywords and pick a topic in step 1 first.",
    step2NeedAudience: "Fill in the target audience in step 1 (the brief needs it).",
    runBrief: "Create brief",
    briefOutline: "Outline ({n} sections):",
    step3Title: "Brief → article draft",
    step3Locked: "Create the brief in step 2 first.",
    runDraft: "Expand to article",
    draftSummary: "{blocks} content blocks · {faq} FAQ questions",
    downloadMd: "Download .md",
    downloadMdTitle: "Download the article draft as Markdown",
    step4Title: "Article → channel distribution",
    step4Locked: "Expand the article in step 3 first.",
    fieldChannels: "Channels",
    fieldTone: "Communication tone",
    needChannel: "Pick at least one channel.",
    runDistribution: "Create variants",
    variantsDone: "Done — {n} variants ready to publish.",
  },
} as const;

interface PipelineForm {
  topic: string;
  audience: string;
  keywordsText: string;
  /** index into the generated cluster list, or null before a pick */
  clusterIndex: number | null;
  channels: string[];
  tone: Tone;
}

const EMPTY: PipelineForm = {
  topic: "",
  audience: "",
  keywordsText: "",
  clusterIndex: null,
  channels: [...REPURPOSE_CHANNELS],
  tone: "pratelsky",
};

const EXAMPLE: Omit<PipelineForm, "clusterIndex" | "channels" | "tone"> = {
  topic: "Skladování a čerstvost ořechů",
  audience: "Lidé, kteří nakupují ořechy a semínka do zásoby a chtějí je udržet čerstvé",
  keywordsText: [
    "skladování ořechů; 720",
    "jak skladovat vlašské ořechy; 210",
    "žluknutí ořechů; 90",
    "kešu ořechy skladování; 170",
    "ořechy v lednici; 110",
    "jak dlouho vydrží ořechy; 320",
  ].join("\n"),
};

/** Structural guard for a restored draft — a stale/foreign shape is dropped. */
const isPipelineForm = (v: unknown): v is PipelineForm => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.topic === "string" &&
    typeof o.audience === "string" &&
    typeof o.keywordsText === "string" &&
    (o.clusterIndex === null || typeof o.clusterIndex === "number") &&
    Array.isArray(o.channels) &&
    o.channels.every((c) => typeof c === "string") &&
    (TONES as readonly string[]).includes(o.tone as string)
  );
};

/** One numbered stage of the pipeline; the badge flips to a check when done. */
function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6" data-testid={`pipeline-step-${n}`}>
      <div className="flex items-center gap-3">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold text-white ${
            done ? "bg-positive" : "bg-onyx"
          }`}
        >
          {done ? <Check width={14} height={14} /> : n}
        </span>
        <h3 className="text-sm font-semibold text-navy-800">{title}</h3>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Shared per-step status chrome: the loading timer or the typed error state
 *  (with the retry countdown that also paces the 8/min budget between hops). */
function StepStatus({
  tool,
}: {
  tool: {
    status: "idle" | "loading" | "done" | "error";
    error: string | null;
    retryIn: number | null;
    upgradeUrl: string | null;
    timedOut: boolean;
    expectedMs: number | null;
    reset: () => void;
  };
}) {
  if (tool.status === "loading") return <LoadingTimer expectedMs={tool.expectedMs} />;
  if (tool.status !== "error") return null;
  return tool.timedOut ? (
    <TimeoutState onRetry={tool.reset} />
  ) : (
    <ToolError
      message={tool.error ?? ""}
      onRetry={tool.reset}
      retryIn={tool.retryIn}
      upgradeUrl={tool.upgradeUrl}
    />
  );
}

const RUN_BUTTON =
  "inline-flex items-center gap-2 rounded-pill bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

/** The one-click content pipeline: keywords → clusters → brief → article draft →
 *  channel variants, chained over the EXISTING /api/ai modes with the field
 *  mappings from lib/ai/pipeline. Each step previews its result before the next
 *  runs; re-running an earlier step resets everything downstream so the chain
 *  can never show a draft that no longer matches its brief. */
export default function ContentPipeline() {
  const t = useT(T);
  const [form, setForm] = usePersistedForm<PipelineForm>("pipeline", EMPTY, {
    validate: isPipelineForm,
  });

  // Four independent slots ("pipeline" variant) so the wizard's runs never
  // clobber the standalone tools' persisted results for the same modes.
  const clusters = useAiTool<KeywordClustersResult>("keyword-clusters", "pipeline");
  const briefTool = useAiTool<BriefResult>("brief", "pipeline");
  const draftTool = useAiTool<ArticleDraftResult>("article-draft", "pipeline");
  const distTool = useAiTool<RepurposeResult>("repurpose", "pipeline");

  const parsed = parseKeywordLines(form.keywordsText);
  const clusterList = clusters.data?.result.clusters ?? [];
  const cluster = form.clusterIndex !== null ? clusterList[form.clusterIndex] : undefined;
  const briefR = briefTool.data?.result;
  const draftR = draftTool.data?.result;
  const variants = distTool.data?.result.variants ?? [];

  const audienceOk = form.audience.trim().length >= 2;

  const runClusters = () => {
    if (parsed.length < 2 || clusters.status === "loading") return;
    // Downstream results were derived from the previous clustering — drop them.
    setForm((f) => ({ ...f, clusterIndex: null }));
    briefTool.reset();
    draftTool.reset();
    distTool.reset();
    const topic = form.topic.trim();
    clusters.run({ keywords: parsed, ...(topic ? { topic } : {}) });
  };

  const runBrief = () => {
    if (!cluster || !audienceOk || briefTool.status === "loading") return;
    draftTool.reset();
    distTool.reset();
    briefTool.run(
      clusterToBriefRequest(cluster, parsed, { audience: form.audience }) as unknown as Record<
        string,
        unknown
      >
    );
  };

  const runDraft = () => {
    if (!briefR || draftTool.status === "loading") return;
    distTool.reset();
    draftTool.run(
      briefToArticleDraftRequest(briefR, { audience: form.audience }) as unknown as Record<
        string,
        unknown
      >
    );
  };

  const runDistribution = () => {
    if (!briefR || !draftR || form.channels.length === 0 || distTool.status === "loading") return;
    distTool.run(
      draftToRepurposeRequest({
        brief: briefR,
        draft: draftR,
        channels: form.channels,
        tone: form.tone,
        origin: window.location.origin,
      }) as unknown as Record<string, unknown>
    );
  };

  const restart = () => {
    setForm((f) => ({ ...f, clusterIndex: null }));
    clusters.reset();
    briefTool.reset();
    draftTool.reset();
    distTool.reset();
  };

  const exportDraftMd = () => {
    if (!briefR || !draftR) return;
    downloadText(
      `adamant-clanek-${briefR.slug || "obsah"}.md`,
      draftToMarkdownDoc(briefR, draftR),
      "text/markdown;charset=utf-8"
    );
  };

  const toggleChannel = (ch: string) =>
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }));

  const anyResult =
    clusters.status !== "idle" ||
    briefTool.status !== "idle" ||
    draftTool.status !== "idle" ||
    distTool.status !== "idle";

  return (
    <div className="space-y-5">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-navy-800">
              <Layers width={18} height={18} className="text-brand-600" />
              {t("heading")}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm text-muted">{t("intro")}</p>
          </div>
          {anyResult && (
            <button
              type="button"
              onClick={restart}
              title={t("restartTitle")}
              className="shrink-0 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
            >
              {t("restart")}
            </button>
          )}
        </div>
      </div>

      {/* step 1 — keywords in, topic clusters out */}
      <Step n={1} title={t("step1Title")} done={clusterList.length > 0}>
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, ...EXAMPLE }))}
            className="text-xs font-semibold text-brand-accent hover:text-brand-800"
          >
            {t("fillExample")}
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("fieldTopic")} htmlFor="pipeline-topic">
            <input
              id="pipeline-topic"
              type="text"
              value={form.topic}
              onChange={(e) => setForm((f) => ({ ...f, topic: e.target.value }))}
              placeholder={t("placeholderTopic")}
              className={inputClass}
            />
          </Field>
          <Field label={t("fieldAudience")} htmlFor="pipeline-audience">
            <input
              id="pipeline-audience"
              type="text"
              value={form.audience}
              onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}
              placeholder={t("placeholderAudience")}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label={t("fieldKeywords")} htmlFor="pipeline-keywords">
          <textarea
            id="pipeline-keywords"
            rows={5}
            value={form.keywordsText}
            onChange={(e) => setForm((f) => ({ ...f, keywordsText: e.target.value }))}
            placeholder={t("placeholderKeywords")}
            className={`${inputClass} resize-none font-mono text-xs`}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={runClusters}
            disabled={parsed.length < 2 || clusters.status === "loading"}
            className={RUN_BUTTON}
          >
            <Search width={16} height={16} />
            {clusters.status === "loading" ? t("running") : t("runClusters")}
          </button>
          <span className="text-xs text-muted">
            {parsed.length >= 2 ? t("keywordsParsed", { n: parsed.length }) : t("keywordsNeedTwo")}
          </span>
        </div>
        <StepStatus tool={clusters} />
        {clusterList.length > 0 && clusters.data && (
          <div className="space-y-3">
            <ResultMeta meta={clusters.data.meta} />
            <p className="text-sm font-medium text-navy-800">{t("pickCluster")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {clusterList.map((cl, i) => {
                const active = form.clusterIndex === i;
                return (
                  <button
                    key={`${cl.topic}-${i}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setForm((f) => ({ ...f, clusterIndex: i }))}
                    className={`rounded-card border p-3 text-left transition-colors ${
                      active
                        ? "border-brand-400 bg-brand-50"
                        : "border-line bg-surface hover:border-navy-200"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-navy-800">{cl.topic}</span>
                    <span className="mt-1 block text-xs text-navy-600">
                      {t("clusterPillar", { kw: cl.pillar })}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted">
                      <span>{t("clusterSupporting", { n: cl.supporting.length })}</span>
                      {typeof cl.totalVolume === "number" && cl.totalVolume > 0 && (
                        <span className="tnum">{t("clusterVolume", { n: cl.totalVolume })}</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Step>

      {/* step 2 — the chosen cluster becomes a grounded brief */}
      <Step n={2} title={t("step2Title")} done={Boolean(briefR)}>
        {!cluster ? (
          <p className="text-sm text-muted">{t("step2Locked")}</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runBrief}
                disabled={!audienceOk || briefTool.status === "loading"}
                className={RUN_BUTTON}
              >
                <Document width={16} height={16} />
                {briefTool.status === "loading" ? t("running") : t("runBrief")}
              </button>
              {!audienceOk && <span className="text-xs text-coral-600">{t("step2NeedAudience")}</span>}
            </div>
            <StepStatus tool={briefTool} />
            {briefR && briefTool.data && (
              <div className="space-y-3">
                <ResultMeta meta={briefTool.data.meta} />
                <div className="rounded-card border border-line bg-surface p-4">
                  <p className="text-sm font-semibold text-navy-800">{briefR.h1 || briefR.titleTag}</p>
                  <p className="mt-1 text-xs text-muted">{briefR.metaDescription}</p>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    {t("briefOutline", { n: briefR.outline.length })}
                  </p>
                  <ol className="mt-1.5 list-inside list-decimal space-y-0.5 text-sm text-navy-700">
                    {briefR.outline.map((s, i) => (
                      <li key={i}>{s.heading}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </>
        )}
      </Step>

      {/* step 3 — the brief expands into an article draft */}
      <Step n={3} title={t("step3Title")} done={Boolean(draftR)}>
        {!briefR ? (
          <p className="text-sm text-muted">{t("step3Locked")}</p>
        ) : (
          <>
            <button
              type="button"
              onClick={runDraft}
              disabled={draftTool.status === "loading"}
              className={RUN_BUTTON}
            >
              <Bolt width={16} height={16} />
              {draftTool.status === "loading" ? t("running") : t("runDraft")}
            </button>
            <StepStatus tool={draftTool} />
            {draftR && draftTool.data && (
              <div className="space-y-3">
                <ResultMeta meta={draftTool.data.meta} />
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4">
                  <p className="text-sm text-navy-700">
                    {t("draftSummary", { blocks: draftR.blocks.length, faq: draftR.faq.length })}
                  </p>
                  <button
                    type="button"
                    onClick={exportDraftMd}
                    title={t("downloadMdTitle")}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 text-xs font-medium text-navy-700 transition-colors hover:border-brand-300 hover:text-brand-accent"
                  >
                    <Download width={14} height={14} />
                    {t("downloadMd")}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Step>

      {/* step 4 — the article fans out into channel-native variants */}
      <Step n={4} title={t("step4Title")} done={variants.length > 0}>
        {!draftR ? (
          <p className="text-sm text-muted">{t("step4Locked")}</p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("fieldChannels")}>
                <div className="flex flex-wrap gap-2">
                  {REPURPOSE_CHANNELS.map((ch) => {
                    const active = form.channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleChannel(ch)}
                        className={`rounded-pill border px-3 py-1.5 text-xs font-medium transition-colors ${
                          active
                            ? "border-brand-400 bg-brand-50 text-brand-800"
                            : "border-line text-muted hover:border-navy-200"
                        }`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              </Field>
              <Field label={t("fieldTone")} htmlFor="pipeline-tone">
                <select
                  id="pipeline-tone"
                  value={form.tone}
                  onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value as Tone }))}
                  className={inputClass}
                >
                  {TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {TONE_LABELS[tone]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runDistribution}
                disabled={form.channels.length === 0 || distTool.status === "loading"}
                className={RUN_BUTTON}
              >
                <Share width={16} height={16} />
                {distTool.status === "loading" ? t("running") : t("runDistribution")}
              </button>
              {form.channels.length === 0 && (
                <span className="text-xs text-coral-600">{t("needChannel")}</span>
              )}
            </div>
            <StepStatus tool={distTool} />
            {variants.length > 0 && distTool.data && (
              <div className="space-y-3">
                <ResultMeta meta={distTool.data.meta} />
                <p className="text-sm font-medium text-positive">
                  {t("variantsDone", { n: variants.length })}
                </p>
                <div className="space-y-2">
                  {variants.map((v, i) => {
                    const limit = (CHANNEL_LIMITS as Record<string, number>)[v.channel];
                    return (
                      <div key={`${v.channel}-${i}`} className="rounded-card border border-line bg-surface p-4">
                        <div className="flex items-center justify-between gap-2">
                          <span className="pill bg-navy-50 text-navy-700">{v.channel}</span>
                          <div className="flex items-center gap-1.5">
                            {typeof limit === "number" && (
                              <CharCount value={v.text.length} limit={limit} />
                            )}
                            <CopyButton text={v.text} label="" />
                          </div>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-navy-700">
                          {v.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </Step>
    </div>
  );
}
