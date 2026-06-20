"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, Sparkles } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { fmtCZK, fmtInt, fmtPct } from "@/lib/format";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import { useAiTool } from "@/components/ai/useAiTool";
import { ResultMeta } from "@/components/ai/primitives";
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

const OPP_META: Record<Opportunity, { tone: PillTone; label: string }> = {
  high: { tone: "positive", label: "Vysoká" },
  medium: { tone: "coral", label: "Střední" },
  low: { tone: "neutral", label: "Nízká" },
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

/** The generated comparison-page scaffold, rendered inline under its row: H1,
 *  sections with bullet points, the comparison criteria as chips, the verdict and
 *  the FAQ — plus a „Předat do briefu" handoff that folds the scaffold into the
 *  existing brief-seed flow. */
function ScaffoldPanel({
  result,
  demo,
  tookMs,
  model,
  onHandoff,
}: {
  result: ComparisonOutlineResult;
  demo: boolean;
  tookMs: number;
  model: string;
  onHandoff: () => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-line bg-canvas p-4">
      <ResultMeta meta={{ model, demo, prompt: "", tookMs }} />

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Návrh H1</p>
        <h3 className="mt-1 text-base font-semibold text-navy-800">{result.h1}</h3>
      </div>

      {result.comparisonCriteria.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Srovnávací kritéria
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
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Osnova sekcí</p>
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
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Verdikt</p>
          <p className="mt-1 text-sm text-navy-800">{result.verdict}</p>
        </div>
      )}

      {result.faq.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Časté dotazy</p>
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
          Předat do briefu
          <ArrowRight className="h-4 w-4" />
        </button>
        <span className="text-xs text-muted">
          Z kostry vznikne brief v Obsahu (téma, hlavní klíčové slovo a kritéria jako klíčová slova).
        </span>
      </div>
    </div>
  );
}

/** One scored query row plus its own AI lifecycle: a „Vygenerovat srovnání"
 *  action that calls the comparison-outline tool and renders the scaffold inline.
 *  Each row owns its hook so generating one query doesn't disturb the others. */
function QueryRow({
  r,
  competitor,
  positioning,
  seoChannel,
  onCreate,
  onCreateFromOutline,
}: {
  r: ScoredQuery;
  competitor: string;
  positioning: string;
  seoChannel: SeoChannel | null;
  onCreate: (r: ScoredQuery) => void;
  onCreateFromOutline: (r: ScoredQuery, result: ComparisonOutlineResult) => void;
}) {
  const meta = OPP_META[r.opportunity];
  const acq = acquisitionFor(r, seoChannel);
  const { status, data, error, timedOut, run, reset } = useAiTool<ComparisonOutlineResult>(
    `comparison-outline:${r.query}`,
  );
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
        <td className="tnum px-4 py-3 text-right text-navy-700">{fmtInt(r.volume)}</td>
        <td className="tnum px-4 py-3 text-right text-navy-700">{r.difficulty}</td>
        <td className="tnum px-4 py-3 text-right text-muted">{r.rank ?? "—"}</td>
        <td className="px-4 py-3">
          <Pill tone={meta.tone}>{meta.label}</Pill>
        </td>
        <td className="px-4 py-3 text-right">
          {acq ? (
            <span
              className="tnum font-medium text-navy-800"
              title={`Odhad dle kanálu ${acq.channel}: CR ${fmtPct(acq.cr)} × hledanost × záměr${
                acq.estRevenue > 0 ? ` ≈ ${fmtCZK(acq.estRevenue)}/měs` : ""
              }`}
            >
              ~{fmtInt(acq.estConversions)}
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
              title="Vygenerovat kostru srovnávací stránky pro tento dotaz"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {status === "loading"
                ? "Generuji…"
                : status === "done" || status === "error"
                  ? "Znovu"
                  : "Vygenerovat srovnání"}
            </button>
            <button
              type="button"
              onClick={() => onCreate(r)}
              className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1 text-xs font-medium text-brand-700 transition-colors hover:bg-brand-50"
              title="Předat tento dotaz do AI briefu v Obsahu"
            >
              Vytvořit obsah
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
                Generuji kostru srovnávací stránky pro „{r.query}“…
              </p>
            )}
            {status === "error" && (
              <div className="rounded-lg border border-negative/30 bg-negative-soft px-4 py-3 text-sm">
                <p className="font-medium text-negative">
                  {timedOut ? "Vypršel časový limit" : "Generování selhalo"}
                </p>
                <p className="mt-0.5 text-muted">{error ?? "Zkuste to prosím znovu."}</p>
                <button
                  type="button"
                  onClick={onGenerate}
                  className="mt-2 rounded-pill border border-line px-3 py-1 text-xs font-medium text-navy-700 transition-colors hover:bg-navy-50"
                >
                  Zkusit znovu
                </button>
              </div>
            )}
            {status === "done" && data && (
              <ScaffoldPanel
                result={data.result}
                demo={data.meta.demo}
                tookMs={data.meta.tookMs}
                model={data.meta.model}
                onHandoff={() => {
                  onCreateFromOutline(r, data.result);
                  reset();
                  setOpen(false);
                }}
              />
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
}: {
  rows: ScoredQuery[];
  high: number;
  seoChannel: SeoChannel | null;
}) {
  const totalVolume = rows.reduce((a, r) => a + r.volume, 0);
  const totalConv = rows.reduce((a, r) => a + (acquisitionFor(r, seoChannel)?.estConversions ?? 0), 0);
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Vysoká příležitost</p>
        <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{high}</p>
        <p className="mt-1 text-xs text-muted">z {rows.length} dotazů</p>
      </div>
      <div className="card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Měsíční objem</p>
        <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">{fmtInt(totalVolume)}</p>
      </div>
      <div className="card p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Potenciál konverzí/měs</p>
        <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight text-navy-800">
          {seoChannel ? `~${fmtInt(totalConv)}` : "—"}
        </p>
        <p className="mt-1 text-xs text-muted">
          {seoChannel
            ? `odhad dle kanálu ${seoChannel.channel} (CR ${fmtPct(seoChannel.cr)})`
            : "napojte výkonová data"}
        </p>
      </div>
    </div>
  );
}

function TuningPanel({
  weights,
  setWeights,
  onReset,
}: {
  weights: ScoreWeights;
  setWeights: (w: ScoreWeights) => void;
  onReset: () => void;
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
        <span>Ladění skóre</span>
        <ChevronDown
          width={16}
          height={16}
          aria-hidden
          className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="space-y-5 border-t border-line px-5 py-4">
          <p className="text-xs text-muted">
            Upravte váhy podle toho, který záměr u vás nejlépe konvertuje. Žebříček se přepočítá
            okamžitě. Uloženo pro tento projekt.
          </p>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Váhy záměru</p>
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
                  aria-label={`Váha záměru ${INTENT_LABELS[k]}`}
                />
                <span className="tnum w-12 shrink-0 text-right text-navy-800">
                  {weights.intent[k].toFixed(2)}×
                </span>
              </label>
            ))}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">Prahy tierů</p>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-navy-700">Vysoká ≥</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.01}
                value={weights.highCutoff}
                onChange={(e) => setHigh(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-positive"
                aria-label="Práh pro vysokou příležitost"
              />
              <span className="tnum w-12 shrink-0 text-right text-navy-800">
                {Math.round(weights.highCutoff * 100)}%
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 text-navy-700">Střední ≥</span>
              <input
                type="range"
                min={0.05}
                max={weights.highCutoff}
                step={0.01}
                value={weights.mediumCutoff}
                onChange={(e) => setMedium(Number(e.target.value))}
                className="h-1.5 flex-1 cursor-pointer accent-coral-500"
                aria-label="Práh pro střední příležitost"
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
            Obnovit výchozí
          </button>
        </div>
      )}
    </div>
  );
}

/** Scored comparison-query table with a collapsible "Ladění skóre" tuning panel
 *  and a per-row "Vytvořit srovnávací obsah" action.
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
    router.push(`/app/${project.id}/obsah`);
  }

  function onCreate(r: ScoredQuery) {
    seedAndRoute({
      topic: briefTopic(r),
      primaryKeyword: r.query,
      keywords: [{ keyword: r.query, volume: r.volume, competition: INTENT_LABELS[r.intent] }],
    });
  }

  /** Fold a generated comparison scaffold into the existing brief-seed handoff:
   *  topic = the generated H1, primaryKeyword = the query, keywords = the
   *  comparison criteria (plus the query itself, grounded with its volume). */
  function onCreateFromOutline(r: ScoredQuery, result: ComparisonOutlineResult) {
    seedAndRoute({
      topic: result.h1 || briefTopic(r),
      primaryKeyword: r.query,
      keywords: [
        { keyword: r.query, volume: r.volume, competition: INTENT_LABELS[r.intent] },
        ...result.comparisonCriteria.map((c) => ({ keyword: c, volume: 0, competition: "" })),
      ],
    });
  }

  return (
    <div className="space-y-6">
      <SummaryCards rows={rows} high={highCount} seoChannel={seoChannel} />

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <span className="shrink-0 text-sm font-medium text-navy-800">Zdroj dotazů</span>
        <select
          value={selectedListId}
          onChange={(e) => setSelectedListId(e.target.value)}
          aria-label="Zdroj dotazů"
          className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400"
        >
          <option value="">Ukázkové dotazy</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          {lists.length === 0
            ? "Uložte seznam v modulu Klíčová slova a vyberte ho zde — engine pak běží na vašich reálných dotazech."
            : selectedList
              ? derived.length > 0
                ? `${derived.length} srovnávacích dotazů z „${selectedList.name}“`
                : `„${selectedList.name}“ nemá srovnávací dotazy — zobrazuji ukázku`
              : "Vyberte uložený seznam klíčových slov pro reálné dotazy."}
        </span>
      </div>

      <div className="card p-5">
        <p className="text-sm font-semibold text-navy-800">Ukotvení srovnání (volitelné, ale doporučené)</p>
        <p className="mt-1 text-xs text-muted">
          Bez nich vznikne jen obecná kostra. Vyplňte konkurenta a čím se lišíte — stránka pak
          srovnává reálně, ne přes zástupné fráze.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy-700">Konkurent / srovnávané řešení</span>
            <input
              type="text"
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              placeholder="např. Konkurent X"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-navy-700">Vaše pozice / čím se lišíte</span>
            <input
              type="text"
              value={positioning}
              onChange={(e) => setPositioning(e.target.value)}
              placeholder="např. levnější, česká podpora, napojení na Sklik"
              className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm outline-none transition focus:border-brand-400 focus:bg-surface"
            />
          </label>
        </div>
      </div>

      <TuningPanel
        weights={weights}
        setWeights={setWeights}
        onReset={() => setWeights(defaultWeights)}
      />

      <div className="card overflow-hidden">
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
                <th
                  className="px-4 py-3 text-right font-medium"
                  title="Odhadované konverze/měs, pokud dotaz získáte — z reálné konverzní míry organického kanálu × hledanost × záměr"
                >
                  Akvizice
                </th>
                <th className="px-4 py-3 text-right font-medium">Akce</th>
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
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Skóre = objem × váha záměru × prostor v SERP ÷ obtížnost. Bílá místa (kde zatím
          nerankujete) mají přednost. Váhy a prahy upravíte v panelu „Ladění skóre“. Sloupec{" "}
          <strong>Akvizice</strong> = odhad konverzí/měs z reálné konverzní míry organického kanálu
          (CR × hledanost × záměr), aby žebříček odrážel očekávané výsledky, ne jen hledanost.
        </div>
      </div>
    </div>
  );
}
