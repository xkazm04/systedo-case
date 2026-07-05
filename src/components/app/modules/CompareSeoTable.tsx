"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Sparkles } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { useFormatters, useT } from "@/lib/i18n/client";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import { useAiTool } from "@/components/ai/useAiTool";
import { RefineBar, ResultMeta } from "@/components/ai/primitives";
import type { ComparisonOutlineResult } from "@/lib/ai-types";
import {
  acquisitionFor,
  DEFAULT_SCORE_WEIGHTS,
  deriveCompareQueries,
  INTENT_LABELS,
  scoreQueries,
  type Opportunity,
  type ScoredQuery,
  type ScoreWeights,
  type SeoChannel,
} from "@/lib/seo-compare/compute";
import type { CompareIntent, CompareQuery } from "@/lib/seo-compare/sample";
import type { KeywordList } from "@/lib/keywords/types";

const T = {
  cs: {
    highOpp: "Vysoká příležitost",
    ofQueries: "z {n} dotazů",
    monthlyVolume: "Měsíční objem",
    convPotential: "Potenciál konverzí/měs",
    channelEst: "odhad dle kanálu {ch} (CR {cr})",
    connectData: "napojte výkonová data",
    tuningPanel: "Ladění skóre",
    tuningHint: "Upravte váhy podle toho, který záměr u vás nejlépe konvertuje. Žebříček se přepočítá okamžitě. Uloženo pro tento projekt.",
    intentWeights: "Váhy záměru",
    intentWeightAria: "Váha záměru {label}",
    tierThresholds: "Prahy tierů",
    highGe: "Vysoká ≥",
    mediumGe: "Střední ≥",
    highOppAria: "Práh pro vysokou příležitost",
    mediumOppAria: "Práh pro střední příležitost",
    resetDefaults: "Obnovit výchozí",
    querySource: "Zdroj dotazů",
    sampleQueries: "Ukázkové dotazy",
    noListsHint: "Uložte seznam v modulu Klíčová slova a vyberte ho zde — engine pak běží na vašich reálných dotazech.",
    listCompareQueries: "{n} srovnávacích dotazů z „{name}“",
    listNoCompare: "„{name}“ nemá srovnávací dotazy — zobrazuji ukázku",
    selectListHint: "Vyberte uložený seznam klíčových slov pro reálné dotazy.",
    anchorTitle: "Ukotvení srovnání (volitelné, ale doporučené)",
    anchorHint: "Bez nich vznikne jen obecná kostra. Vyplňte konkurenta a čím se lišíte — stránka pak srovnává reálně, ne přes zástupné fráze.",
    competitorLabel: "Konkurent / srovnávané řešení",
    competitorPlaceholder: "např. Konkurent X",
    positioningLabel: "Vaše pozice / čím se lišíte",
    positioningPlaceholder: "např. levnější, česká podpora, napojení na Sklik",
    colQuery: "Dotaz",
    colIntent: "Záměr",
    colVolume: "Objem",
    colDifficulty: "Obtížnost",
    colRank: "Pozice",
    colOpportunity: "Příležitost",
    colAcquisition: "Akvizice",
    colAcquisitionTitle: "Odhadované konverze/měs, pokud dotaz získáte — z reálné konverzní míry organického kanálu × hledanost × záměr",
    colAction: "Akce",
    oppHigh: "Vysoká",
    oppMedium: "Střední",
    oppLow: "Nízká",
    acqTitle: "Odhad dle kanálu {ch}: CR {cr} × hledanost × záměr{rev}",
    acqRevSuffix: " ≈ {rev}/měs",
    generateBtn: "Vygenerovat srovnání",
    generatingBtn: "Generuji…",
    regenerateBtn: "Znovu",
    generateTitle: "Vygenerovat kostru srovnávací stránky pro tento dotaz",
    createContent: "Vytvořit obsah",
    createContentTitle: "Předat tento dotaz do AI briefu v Obsahu",
    generatingRow: "Generuji kostru srovnávací stránky pro „{q}“…",
    errorTitle: "Generování selhalo",
    timeoutTitle: "Vypršel časový limit",
    errorHint: "Zkuste to prosím znovu.",
    retryBtn: "Zkusit znovu",
    scaffoldH1: "Návrh H1",
    scaffoldCriteria: "Srovnávací kritéria",
    scaffoldSections: "Osnova sekcí",
    scaffoldVerdict: "Verdikt",
    scaffoldFaq: "Časté dotazy",
    handoffBtn: "Předat do briefu",
    handoffHint: "Z kostry vznikne brief v Obsahu (téma, hlavní klíčové slovo a kritéria jako klíčová slova).",
    tableFooter: "Skóre = objem × váha záměru × prostor v SERP ÷ obtížnost. Bílá místa (kde zatím nerankujete) mají přednost. Váhy a prahy upravíte v panelu „Ladění skóre“. Sloupec",
    tableFooterAcq: "= odhad konverzí/měs z reálné konverzní míry organického kanálu (CR × hledanost × záměr), aby žebříček odrážel očekávané výsledky, ne jen hledanost.",
    topicVs: "{query} — srovnání",
    topicAlternative: "Alternativy: {query}",
    topicPricing: "{query} / ceník",
    topicReview: "{query} — recenze",
  },
  en: {
    highOpp: "High opportunity",
    ofQueries: "of {n} queries",
    monthlyVolume: "Monthly volume",
    convPotential: "Conversion potential/mo",
    channelEst: "estimate via {ch} channel (CR {cr})",
    connectData: "connect performance data",
    tuningPanel: "Score tuning",
    tuningHint: "Adjust weights to reflect which intent converts best for you. Rankings update instantly. Saved per project.",
    intentWeights: "Intent weights",
    intentWeightAria: "Intent weight {label}",
    tierThresholds: "Tier thresholds",
    highGe: "High ≥",
    mediumGe: "Medium ≥",
    highOppAria: "Threshold for high opportunity",
    mediumOppAria: "Threshold for medium opportunity",
    resetDefaults: "Reset to defaults",
    querySource: "Query source",
    sampleQueries: "Sample queries",
    noListsHint: "Save a list in the Keywords module and select it here — the engine will run on your real queries.",
    listCompareQueries: "{n} comparison queries from “{name}”",
    listNoCompare: "“{name}” has no comparison queries — showing sample",
    selectListHint: "Select a saved keyword list for real queries.",
    anchorTitle: "Comparison anchor (optional but recommended)",
    anchorHint: "Without these, only a generic scaffold is generated. Fill in the competitor and your differentiator — the page will compare with real data, not placeholder phrases.",
    competitorLabel: "Competitor / compared solution",
    competitorPlaceholder: "e.g. Competitor X",
    positioningLabel: "Your positioning / differentiator",
    positioningPlaceholder: "e.g. cheaper, local support, Sklik integration",
    colQuery: "Query",
    colIntent: "Intent",
    colVolume: "Volume",
    colDifficulty: "Difficulty",
    colRank: "Rank",
    colOpportunity: "Opportunity",
    colAcquisition: "Acquisition",
    colAcquisitionTitle: "Estimated conversions/mo if you rank for this query — from the organic channel's real conversion rate × search volume × intent",
    colAction: "Action",
    oppHigh: "High",
    oppMedium: "Medium",
    oppLow: "Low",
    acqTitle: "Estimate via {ch} channel: CR {cr} × volume × intent{rev}",
    acqRevSuffix: " ≈ {rev}/mo",
    generateBtn: "Generate comparison",
    generatingBtn: "Generating…",
    regenerateBtn: "Regenerate",
    generateTitle: "Generate a comparison page scaffold for this query",
    createContent: "Create content",
    createContentTitle: "Send this query to the AI brief in Content",
    generatingRow: "Generating comparison page scaffold for “{q}”…",
    errorTitle: "Generation failed",
    timeoutTitle: "Request timed out",
    errorHint: "Please try again.",
    retryBtn: "Retry",
    scaffoldH1: "Proposed H1",
    scaffoldCriteria: "Comparison criteria",
    scaffoldSections: "Section outline",
    scaffoldVerdict: "Verdict",
    scaffoldFaq: "Frequently asked questions",
    handoffBtn: "Send to brief",
    handoffHint: "The scaffold becomes a brief in Content (topic, primary keyword, and criteria as keywords).",
    tableFooter: "Score = volume × intent weight × SERP gap ÷ difficulty. Gaps (where you don't rank yet) are prioritised. Adjust weights and thresholds in the “Score tuning” panel. Column",
    tableFooterAcq: "= estimated conversions/mo from the organic channel's real conversion rate (CR × volume × intent), so rankings reflect expected outcomes, not just search volume.",
    topicVs: "{query} — comparison",
    topicAlternative: "Alternatives: {query}",
    topicPricing: "{query} / pricing",
    topicReview: "{query} — review",
  },
} as const;

const OPP_META: Record<Opportunity, { tone: PillTone; tKey: "oppHigh" | "oppMedium" | "oppLow" }> = {
  high: { tone: "positive", tKey: "oppHigh" },
  medium: { tone: "coral", tKey: "oppMedium" },
  low: { tone: "neutral", tKey: "oppLow" },
};

/** Intent slider order — buying-stage descending so pricing leads. */
const INTENT_ORDER: CompareIntent[] = ["pricing", "alternative", "vs", "review"];

const weightsKey = (projectId: string) => `app:seo-weights:${projectId}`;

/** Validate a parsed blob into ScoreWeights, falling back per-field to defaults
 *  (and to defaults entirely on anything malformed) so a corrupt localStorage
 *  entry can never break scoring. */
function coerceWeights(raw: unknown): ScoreWeights {
  if (!raw || typeof raw !== "object") return DEFAULT_SCORE_WEIGHTS;
  const r = raw as Partial<ScoreWeights>;
  const intentIn = (r.intent ?? {}) as Partial<Record<CompareIntent, number>>;
  const intent = { ...DEFAULT_SCORE_WEIGHTS.intent };
  for (const k of INTENT_ORDER) {
    const v = intentIn[k];
    if (typeof v === "number" && Number.isFinite(v)) intent[k] = v;
  }
  const num = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    intent,
    highCutoff: num(r.highCutoff, DEFAULT_SCORE_WEIGHTS.highCutoff),
    mediumCutoff: num(r.mediumCutoff, DEFAULT_SCORE_WEIGHTS.mediumCutoff),
  };
}

/** Lazy initializer: read the per-project saved weights once, guarding SSR. */
function loadWeights(projectId: string): ScoreWeights {
  if (typeof window === "undefined") return DEFAULT_SCORE_WEIGHTS;
  try {
    const raw = window.localStorage.getItem(weightsKey(projectId));
    if (!raw) return DEFAULT_SCORE_WEIGHTS;
    return coerceWeights(JSON.parse(raw));
  } catch {
    /* corrupt or unavailable storage — fall back to the defaults */
    return DEFAULT_SCORE_WEIGHTS;
  }
}

/** Turn a comparison query into a content topic the brief tool can act on. The
 *  framing follows the intent: a "vs" query wants a head-to-head comparison, an
 *  "alternative" query an alternatives roundup, a "pricing" query a pricing page.
 *  Keeps the chosen keyword as the primary. */
function briefTopic(r: ScoredQuery, t: ReturnType<typeof useT<keyof typeof T.cs>>): string {
  switch (r.intent) {
    case "vs":
      return t("topicVs", { query: r.query });
    case "alternative":
      return t("topicAlternative", { query: r.query });
    case "pricing":
      return t("topicPricing", { query: r.query });
    case "review":
      return t("topicReview", { query: r.query });
  }
}

/** The generated comparison-page scaffold, rendered inline under its row: H1,
 *  sections with bullet points, the comparison criteria as chips, the verdict and
 *  the FAQ — plus a "Send to brief" handoff that folds the scaffold into the
 *  existing brief-seed flow. */
function ScaffoldPanel({
  result,
  demo,
  tookMs,
  model,
  onHandoff,
  t,
}: {
  result: ComparisonOutlineResult;
  demo: boolean;
  tookMs: number;
  model: string;
  onHandoff: () => void;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-line bg-canvas p-4">
      <ResultMeta meta={{ model, demo, prompt: "", tookMs }} />

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("scaffoldH1")}</p>
        <h3 className="mt-1 text-base font-semibold text-navy-800">{result.h1}</h3>
      </div>

      {result.comparisonCriteria.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            {t("scaffoldCriteria")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {result.comparisonCriteria.map((c, i) => (
              <Pill key={`${c}-${i}`} tone="navy">
                {c}
              </Pill>
            ))}
          </div>
        </div>
      )}

      {result.sections.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("scaffoldSections")}</p>
          {result.sections.map((s, i) => (
            <div key={`${s.heading}-${i}`} className="rounded-lg border border-line bg-surface p-3">
              <p className="text-sm font-semibold text-navy-800">{s.heading}</p>
              {s.points.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-navy-700">
                  {s.points.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {result.verdict && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">{t("scaffoldVerdict")}</p>
          <p className="mt-1 text-sm text-navy-800">{result.verdict}</p>
        </div>
      )}

      {result.faq.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("scaffoldFaq")}</p>
          {result.faq.map((f, i) => (
            <div key={`${f.q}-${i}`} className="rounded-lg border border-line bg-surface p-3">
              <p className="text-sm font-medium text-navy-800">{f.q}</p>
              <p className="mt-1 text-sm text-navy-700">{f.a}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onHandoff}
          className="inline-flex items-center gap-1.5 rounded-pill bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 active:scale-[0.99]"
        >
          {t("handoffBtn")}
          <ArrowRight className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted">{t("handoffHint")}</span>
      </div>
    </div>
  );
}

/** One scored query row plus its own AI lifecycle: a "Generate comparison"
 *  action that calls the comparison-outline tool and renders the scaffold inline.
 *  Each row owns its hook so generating one query doesn't disturb the others. */
function QueryRow({
  r,
  competitor,
  positioning,
  seoChannel,
  onCreate,
  onCreateFromOutline,
  t,
  fmt,
}: {
  r: ScoredQuery;
  competitor: string;
  positioning: string;
  seoChannel: SeoChannel | null;
  onCreate: (r: ScoredQuery) => void;
  onCreateFromOutline: (r: ScoredQuery, result: ComparisonOutlineResult) => void;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
  fmt: ReturnType<typeof useFormatters>;
}) {
  const meta = OPP_META[r.opportunity];
  const acq = acquisitionFor(r, seoChannel);
  const { status, data, error, timedOut, run, reset, refine, canRefine } =
    useAiTool<ComparisonOutlineResult>(`comparison-outline:${r.query}`);
  const [open, setOpen] = useState(false);

  function onGenerate() {
    setOpen(true);
    void run({
      mode: "comparison-outline",
      query: r.query,
      intent: r.intent,
      volume: r.volume,
      ...(competitor ? { competitor } : {}),
      ...(positioning ? { positioning } : {}),
    });
  }

  return (
    <>
      <tr className="border-b border-line/70">
        <td className="px-5 py-3 font-medium text-navy-800">{r.query}</td>
        <td className="px-4 py-3">
          <Pill tone="brand">{INTENT_LABELS[r.intent]}</Pill>
        </td>
        <td className="tnum px-4 py-3 text-right text-navy-700">{fmt.fmtInt(r.volume)}</td>
        <td className="tnum px-4 py-3 text-right text-navy-700">{r.difficulty}</td>
        <td className="tnum px-4 py-3 text-right text-muted">{r.rank ?? "—"}</td>
        <td className="px-4 py-3">
          <Pill tone={meta.tone}>{t(meta.tKey)}</Pill>
        </td>
        <td className="px-4 py-3 text-right">
          {acq ? (
            <span
              className="tnum font-medium text-navy-800"
              title={t("acqTitle", {
                ch: acq.channel,
                cr: fmt.fmtPct(acq.cr),
                rev: acq.estRevenue > 0 ? t("acqRevSuffix", { rev: fmt.fmtCZK(acq.estRevenue) }) : "",
              })}
            >
              ~{fmt.fmtInt(acq.estConversions)}
            </span>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={status === "loading"}
              className="inline-flex items-center gap-1 rounded-pill border border-brand-300 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-60"
              title={t("generateTitle")}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {status === "loading"
                ? t("generatingBtn")
                : status === "done" || status === "error"
                  ? t("regenerateBtn")
                  : t("generateBtn")}
            </button>
            <button
              type="button"
              onClick={() => onCreate(r)}
              className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
              title={t("createContentTitle")}
            >
              {t("createContent")}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {open && (status === "loading" || status === "error" || data) && (
        <tr className="border-b border-line/70">
          <td colSpan={8} className="px-5 pb-4">
            {status === "loading" && (
              <p className="rounded-lg border border-line bg-canvas px-4 py-3 text-sm text-muted">
                {t("generatingRow", { q: r.query })}
              </p>
            )}
            {status === "error" && (
              <div className="rounded-lg border border-negative/30 bg-negative-soft px-4 py-3 text-sm">
                <p className="font-medium text-negative">
                  {timedOut ? t("timeoutTitle") : t("errorTitle")}
                </p>
                <p className="mt-0.5 text-muted">{error ?? t("errorHint")}</p>
                <button
                  type="button"
                  onClick={onGenerate}
                  className="mt-2 rounded-pill border border-line px-3 py-1 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-50"
                >
                  {t("retryBtn")}
                </button>
              </div>
            )}
            {status === "done" && data && (
              <div className="space-y-3">
                <ScaffoldPanel
                  result={data.result}
                  demo={data.meta.demo}
                  tookMs={data.meta.tookMs}
                  model={data.meta.model}
                  t={t}
                  onHandoff={() => {
                    onCreateFromOutline(r, data.result);
                    reset();
                    setOpen(false);
                  }}
                />
                {canRefine && <RefineBar onRefine={refine} />}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function SummaryCards({
  rows,
  high,
  seoChannel,
  t,
  fmt,
}: {
  rows: ScoredQuery[];
  high: number;
  seoChannel: SeoChannel | null;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
  fmt: ReturnType<typeof useFormatters>;
}) {
  const totalVolume = rows.reduce((a, r) => a + r.volume, 0);
  const totalConv = rows.reduce((a, r) => a + (acquisitionFor(r, seoChannel)?.estConversions ?? 0), 0);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("highOpp")}</p>
        <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{high}</p>
        <p className="mt-1 text-xs text-muted">{t("ofQueries", { n: rows.length })}</p>
      </div>
      <div className="card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("monthlyVolume")}</p>
        <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmt.fmtInt(totalVolume)}</p>
      </div>
      <div className="card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("convPotential")}</p>
        <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
          {seoChannel ? `~${fmt.fmtInt(totalConv)}` : "—"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {seoChannel
            ? t("channelEst", { ch: seoChannel.channel, cr: fmt.fmtPct(seoChannel.cr) })
            : t("connectData")}
        </p>
      </div>
    </div>
  );
}

function TuningPanel({
  weights,
  setWeights,
  onReset,
  t,
  fmt,
}: {
  weights: ScoreWeights;
  setWeights: (w: ScoreWeights) => void;
  onReset: () => void;
  t: ReturnType<typeof useT<keyof typeof T.cs>>;
  fmt: ReturnType<typeof useFormatters>;
}) {
  const [open, setOpen] = useState(false);

  const setIntent = (k: CompareIntent, v: number) =>
    setWeights({ ...weights, intent: { ...weights.intent, [k]: v } });

  const setHigh = (v: number) =>
    // keep the medium cutoff strictly below the high cutoff
    setWeights({ ...weights, highCutoff: v, mediumCutoff: Math.min(weights.mediumCutoff, v) });

  const setMedium = (v: number) =>
    setWeights({ ...weights, mediumCutoff: Math.min(v, weights.highCutoff) });

  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-navy-800 transition-colors hover:bg-navy-50"
      >
        <span>{t("tuningPanel")}</span>
        <ChevronDown
          width={16}
          height={16}
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-5 py-4">
          <p className="text-xs text-muted">{t("tuningHint")}</p>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("intentWeights")}</p>
            {INTENT_ORDER.map((k) => (
              <label key={k} className="flex items-center gap-3 text-sm">
                <span className="w-28 shrink-0 text-navy-700">{INTENT_LABELS[k]}</span>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.05}
                  value={weights.intent[k]}
                  onChange={(e) => setIntent(k, Number(e.target.value))}
                  className="h-1.5 flex-1 cursor-pointer accent-brand-600"
                  aria-label={t("intentWeightAria", { label: INTENT_LABELS[k] })}
                />
                <span className="tnum w-12 shrink-0 text-right text-navy-800">
                  {fmt.fmtMultiple(weights.intent[k], 2)}
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("tierThresholds")}</p>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-navy-700">{t("highGe")}</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={weights.highCutoff}
                onChange={(e) => setHigh(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-positive"
                aria-label={t("highOppAria")}
              />
              <span className="tnum w-12 shrink-0 text-right text-navy-800">
                {Math.round(weights.highCutoff * 100)}%
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-navy-700">{t("mediumGe")}</span>
              <input
                type="range"
                min={0.05}
                max={weights.highCutoff}
                step={0.01}
                value={weights.mediumCutoff}
                onChange={(e) => setMedium(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-coral-500"
                aria-label={t("mediumOppAria")}
              />
              <span className="tnum w-12 shrink-0 text-right text-navy-800">
                {Math.round(weights.mediumCutoff * 100)}%
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={onReset}
            className="rounded-pill border border-line px-3 py-1 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-50"
          >
            {t("resetDefaults")}
          </button>
        </div>
      )}
    </div>
  );
}

/** Scored comparison-query table with a collapsible "Score tuning" panel
 *  and a per-row "Create content" action.
 *
 *  Scoring runs here (client) so the panel re-ranks live: scoreQueries(queries,
 *  weights) is memoized on both. The tuned intent weights + tier thresholds are
 *  persisted per project to localStorage so they survive reloads.
 *
 *  Mirrors KeywordsModule.onCreateBrief / DecayTable: the action writes a
 *  BriefSeed for the chosen query to session storage, then routes to Obsah,
 *  where the brief tool reads the seed on mount and pre-fills the draft. */
export default function CompareSeoTable({
  queries,
  defaultWeights = DEFAULT_SCORE_WEIGHTS,
  seoChannel,
}: {
  queries: CompareQuery[];
  defaultWeights?: ScoreWeights;
  seoChannel: SeoChannel | null;
}) {
  const project = useProject();
  const pid = project.id;
  const router = useRouter();
  const fmt = useFormatters();
  const t = useT(T);

  // Lazy init from per-project localStorage (SSR-guarded); falls back to default.
  const [weights, setWeights] = useState<ScoreWeights>(() => loadWeights(project.id));

  // Optional real grounding for the comparison pages (so they don't render a blank
  // placeholder skeleton): the competitor + the user's own positioning, filled once.
  const [competitor, setCompetitor] = useState("");
  const [positioning, setPositioning] = useState("");

  // Real-data seam: the user's saved keyword lists, so the engine can run on their
  // actual research instead of the static sample. Empty in the local/keyless demo
  // (lists live in the tenant store) → the engine falls back to the sample queries.
  const [lists, setLists] = useState<KeywordList[]>([]);
  const [selectedListId, setSelectedListId] = useState("");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/keywords/lists${pid ? `?projectId=${pid}` : ""}`)
      .then((r) => (r.ok ? r.json() : { lists: [] }))
      .then((d) => {
        if (!cancelled) setLists(Array.isArray(d?.lists) ? d.lists : []);
      })
      .catch(() => {
        /* non-fatal — stay on the sample queries */
      });
    return () => {
      cancelled = true;
    };
  }, [pid]);

  // Persist the tuned weights so the panel reopens the way the user left it.
  useEffect(() => {
    try {
      window.localStorage.setItem(weightsKey(project.id), JSON.stringify(weights));
    } catch {
      /* storage may be unavailable (e.g. private mode) — non-fatal */
    }
  }, [project.id, weights]);

  const selectedList = lists.find((l) => l.id === selectedListId);
  const derived = useMemo(
    () => (selectedList ? deriveCompareQueries(selectedList.keywords) : []),
    [selectedList],
  );
  // Score real saved-keyword queries when a list with comparison queries is picked,
  // else the passed sample.
  const sourceQueries = selectedList && derived.length > 0 ? derived : queries;
  const rows = useMemo(() => scoreQueries(sourceQueries, weights), [sourceQueries, weights]);
  const highCount = useMemo(() => rows.filter((r) => r.opportunity === "high").length, [rows]);

  /** Write a brief seed for the chosen query to session storage and route to
   *  Obsah, where the brief tool reads the seed on mount and pre-fills the draft. */
  function seedAndRoute(seed: BriefSeed) {
    try {
      sessionStorage.setItem(briefSeedKey(project.id), JSON.stringify(seed));
    } catch {
      /* non-critical — the brief tool still opens, just unseeded */
    }
    router.push(`/app/${project.id}/obsahovy-engine`);
  }

  function onCreate(r: ScoredQuery) {
    seedAndRoute({
      topic: briefTopic(r, t),
      primaryKeyword: r.query,
      keywords: [{ keyword: r.query, volume: r.volume, competition: INTENT_LABELS[r.intent] }],
    });
  }

  /** Fold a generated comparison scaffold into the existing brief-seed handoff:
   *  topic = the generated H1, primaryKeyword = the query, keywords = the
   *  comparison criteria (plus the query itself, grounded with its volume). */
  function onCreateFromOutline(r: ScoredQuery, result: ComparisonOutlineResult) {
    seedAndRoute({
      topic: result.h1 || briefTopic(r, t),
      primaryKeyword: r.query,
      keywords: [
        { keyword: r.query, volume: r.volume, competition: INTENT_LABELS[r.intent] },
        ...result.comparisonCriteria.map((c) => ({ keyword: c, volume: 0, competition: "" })),
      ],
    });
  }

  return (
    <div className="stagger space-y-6">
      <SummaryCards rows={rows} high={highCount} seoChannel={seoChannel} t={t} fmt={fmt} />

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="shrink-0 text-sm font-medium text-navy-800">{t("querySource")}</span>
        <select
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          aria-label={t("querySource")}
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400"
        >
          <option value="">{t("sampleQueries")}</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {lists.length === 0
            ? t("noListsHint")
            : selectedList
              ? derived.length > 0
                ? t("listCompareQueries", { n: derived.length, name: selectedList.name })
                : t("listNoCompare", { name: selectedList.name })
              : t("selectListHint")}
        </span>
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-navy-800">{t("anchorTitle")}</p>
        <p className="mt-1 text-xs text-muted">{t("anchorHint")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy-700">{t("competitorLabel")}</span>
            <input
              type="text"
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              placeholder={t("competitorPlaceholder")}
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy-700">{t("positioningLabel")}</span>
            <input
              type="text"
              value={positioning}
              onChange={(e) => setPositioning(e.target.value)}
              placeholder={t("positioningPlaceholder")}
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
        </div>
      </div>

      <TuningPanel
        weights={weights}
        setWeights={setWeights}
        onReset={() => setWeights(defaultWeights)}
        t={t}
        fmt={fmt}
      />

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-3 font-medium">{t("colQuery")}</th>
                <th className="px-4 py-3 font-medium">{t("colIntent")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colVolume")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colDifficulty")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colRank")}</th>
                <th className="px-4 py-3 font-medium">{t("colOpportunity")}</th>
                <th
                  className="px-4 py-3 text-right font-medium"
                  title={t("colAcquisitionTitle")}
                >
                  {t("colAcquisition")}
                </th>
                <th className="px-4 py-3 text-right font-medium">{t("colAction")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <QueryRow
                  key={r.query}
                  r={r}
                  competitor={competitor}
                  positioning={positioning}
                  seoChannel={seoChannel}
                  onCreate={onCreate}
                  onCreateFromOutline={onCreateFromOutline}
                  t={t}
                  fmt={fmt}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          {t("tableFooter")}{" "}
          <strong>{t("colAcquisition")}</strong> {t("tableFooterAcq")}
        </div>
      </div>
    </div>
  );
}
