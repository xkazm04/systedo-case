"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown } from "@/components/icons";
import { Pill, type PillTone } from "@/components/ui";
import { fmtInt } from "@/lib/format";
import { useProject } from "@/lib/projects/context";
import { briefSeedKey } from "@/lib/projects/brief-seed";
import type { BriefSeed } from "@/components/ai/KeywordResearch";
import {
  DEFAULT_SCORE_WEIGHTS,
  INTENT_LABELS,
  scoreQueries,
  type Opportunity,
  type ScoredQuery,
  type ScoreWeights,
} from "@/lib/seo-compare/compute";
import type { CompareIntent, CompareQuery } from "@/lib/seo-compare/sample";

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

function SummaryCards({ rows, high }: { rows: ScoredQuery[]; high: number }) {
  const totalVolume = rows.reduce((a, r) => a + r.volume, 0);
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
      <div className="card flex flex-col justify-center p-5">
        <p className="text-sm font-semibold text-navy-800">Vytvořit srovnávací obsah</p>
        <p className="mt-1 text-xs text-muted">
          Vyberte dotaz v tabulce a předejte ho s objemem a záměrem do AI briefu.
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
}: {
  queries: CompareQuery[];
  defaultWeights?: ScoreWeights;
}) {
  const project = useProject();
  const router = useRouter();

  // Lazy init from per-project localStorage (SSR-guarded); falls back to default.
  const [weights, setWeights] = useState<ScoreWeights>(() => loadWeights(project.id));

  // Persist the tuned weights so the panel reopens the way the user left it.
  useEffect(() => {
    try {
      window.localStorage.setItem(weightsKey(project.id), JSON.stringify(weights));
    } catch {
      /* storage may be unavailable (e.g. private mode) — non-fatal */
    }
  }, [project.id, weights]);

  const rows = useMemo(() => scoreQueries(queries, weights), [queries, weights]);
  const highCount = useMemo(() => rows.filter((r) => r.opportunity === "high").length, [rows]);

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
    <div className="space-y-6">
      <SummaryCards rows={rows} high={highCount} />

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
        <div className="border-t border-line px-5 py-3 text-xs text-muted">
          Skóre = objem × váha záměru × prostor v SERP ÷ obtížnost. Bílá místa (kde zatím
          nerankujete) mají přednost. Váhy a prahy upravíte v panelu „Ladění skóre“.
        </div>
      </div>
    </div>
  );
}
