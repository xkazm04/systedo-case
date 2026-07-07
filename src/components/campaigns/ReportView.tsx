"use client";

import { Check, Info, Target, TrendDown } from "@/components/icons";
import { PromptDisclosure, ResultMeta } from "@/components/ai/primitives";
import {
  evalPriorityLabel,
  type CampaignReport,
  type EvalPriority,
  type ReportHistoryPoint,
} from "@/lib/ai-types";
import { useT } from "@/lib/i18n/client";
import { useLocale } from "@/lib/i18n/LocaleProvider";
import ScoreTimeline from "./ScoreTimeline";

const T = {
  cs: {
    scoreHealthy: "Zdravé",
    scoreReserves: "S rezervami",
    scoreUnder: "Podvýkonné",
    scoreTitle: "Skóre zdraví 0–100",
    cachedNote: "Z mezipaměti — beze změny vstupů, bez nového volání modelu.",
    cachedTitle:
      "Vstupy (kampaně i období) se nezměnily, proto se zobrazil uložený výsledek bez nového placeného volání modelu.",
    staleNote: "Data se od tohoto vyhodnocení změnila — doporučujeme přehodnotit.",
    staleTitle:
      "Od uložení tohoto vyhodnocení proběhla synchronizace, která změnila podkladové metriky. Skóre a doporučení nemusí odpovídat aktuálním číslům.",
    strengths: "Silné stránky",
    weaknesses: "Slabiny a rizika",
    recommendations: "Doporučené další kroky",
    copyScore: "{verdict} (skóre {score}/100)",
    copyStrengths: "SILNÉ STRÁNKY:",
    copyWeaknesses: "SLABINY:",
    copyRecommendations: "DOPORUČENÉ KROKY:",
  },
  en: {
    scoreHealthy: "Healthy",
    scoreReserves: "Room to improve",
    scoreUnder: "Underperforming",
    scoreTitle: "Health score 0–100",
    cachedNote: "From cache — inputs unchanged, no new model call.",
    cachedTitle:
      "Inputs (campaigns and period) have not changed, so the saved result is shown without a new paid model call.",
    staleNote: "Data has changed since this evaluation — consider re-evaluating.",
    staleTitle:
      "A sync after this evaluation changed the underlying metrics. Its score and recommendations may no longer match the numbers on screen.",
    strengths: "Strengths",
    weaknesses: "Weaknesses & risks",
    recommendations: "Recommended next steps",
    copyScore: "{verdict} (score {score}/100)",
    copyStrengths: "STRENGTHS:",
    copyWeaknesses: "WEAKNESSES:",
    copyRecommendations: "RECOMMENDED STEPS:",
  },
} as const;

type TFn = ReturnType<typeof useT<keyof typeof T.cs>>;

function scoreTone(score: number, t: TFn): { ring: string; text: string; label: string } {
  if (score >= 70) return { ring: "border-positive/40 bg-positive-soft", text: "text-positive", label: t("scoreHealthy") };
  if (score >= 40) return { ring: "border-navy-200 bg-navy-50", text: "text-navy-700", label: t("scoreReserves") };
  return { ring: "border-coral-400/40 bg-coral-soft", text: "text-coral-600", label: t("scoreUnder") };
}

const PRIORITY_TONE: Record<EvalPriority, string> = {
  high: "bg-negative-soft text-negative",
  medium: "bg-brand-50 text-brand-800",
  low: "bg-navy-50 text-muted",
};

export default function ReportView({
  report,
  history,
  cached,
  stale,
  clientSafe,
}: {
  report: CampaignReport;
  /** every score this scope/campaign has earned, for the trend timeline */
  history?: ReportHistoryPoint[];
  /** true when this evaluation was served from the input-hash cache (no new
   *  model call), so the user understands why "Re-evaluate" returned instantly */
  cached?: boolean;
  /** true when a sync after this evaluation changed the underlying metrics, so
   *  the stored report no longer matches the data on screen */
  stale?: boolean;
  /** client-facing render (public shared link): hide the internal AI chrome —
   *  the model/cost pill and the raw-prompt disclosure a client shouldn't see */
  clientSafe?: boolean;
}) {
  const t = useT(T);
  const { locale } = useLocale();
  const r = report.result;
  const tone = scoreTone(r.score, t);

  const copyAllText = [
    t("copyScore", { verdict: r.verdict, score: r.score }),
    "",
    r.summary,
    `\n${t("copyStrengths")}`,
    ...r.strengths.map((s) => `+ ${s}`),
    `\n${t("copyWeaknesses")}`,
    ...r.weaknesses.map((s) => `! ${s}`),
    `\n${t("copyRecommendations")}`,
    ...r.recommendations.map((a) => `→ [${evalPriorityLabel(a.priority, locale)}] ${a.title}: ${a.detail}`),
  ].join("\n");

  return (
    <div className="space-y-5">
      {!clientSafe && (
        <ResultMeta meta={report.meta} copyAllText={copyAllText} createdAt={report.createdAt} />
      )}

      {/* stale wins over cached: "the data moved on" matters more than "this
          render was free" when both apply */}
      {stale ? (
        <p
          className="flex items-center gap-1.5 rounded-lg bg-coral-soft px-3 py-2 text-xs font-medium text-coral-600"
          title={t("staleTitle")}
        >
          <Info width={13} height={13} className="shrink-0" />
          {t("staleNote")}
        </p>
      ) : (
        cached && (
          <p
            className="flex items-center gap-1.5 rounded-lg bg-navy-50 px-3 py-2 text-xs text-muted"
            title={t("cachedTitle")}
          >
            <Info width={13} height={13} className="shrink-0 text-brand-600" />
            {t("cachedNote")}
          </p>
        )
      )}

      {/* score + verdict */}
      <div className="flex items-start gap-4 rounded-card border border-navy-200 bg-navy-50 p-5">
        <div
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-2xl border ${tone.ring}`}
          title={t("scoreTitle")}
        >
          <span className={`tnum text-2xl font-bold ${tone.text}`}>{r.score}</span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`pill ${tone.ring} ${tone.text}`}>
              <Target width={12} height={12} />
              {tone.label}
            </span>
          </div>
          <p className="mt-2 font-semibold text-navy-800">{r.verdict}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-navy-700">{r.summary}</p>
        </div>
      </div>

      {history && history.length >= 2 && (
        <ScoreTimeline history={history} currentCreatedAt={report.createdAt} />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        {r.strengths.length > 0 && (
          <section>
            <h4 className="mb-2.5 text-sm font-semibold text-navy-800">{t("strengths")}</h4>
            <ul className="space-y-2.5">
              {r.strengths.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-positive-soft text-positive">
                    <Check width={12} height={12} />
                  </span>
                  <span className="leading-snug">{s}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.weaknesses.length > 0 && (
          <section>
            <h4 className="mb-2.5 text-sm font-semibold text-navy-800">{t("weaknesses")}</h4>
            <ul className="space-y-2.5">
              {r.weaknesses.map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-navy-700">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-coral-soft text-coral-600">
                    <TrendDown width={12} height={12} />
                  </span>
                  <span className="leading-snug">{s}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {r.recommendations.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-baseline justify-between">
            <h4 className="text-sm font-semibold text-navy-800">{t("recommendations")}</h4>
            <span className="text-xs text-muted">{r.recommendations.length}</span>
          </div>
          <ol className="space-y-2.5">
            {r.recommendations.map((a, i) => (
              <li key={i} className="flex gap-3 rounded-card border border-line bg-surface p-4">
                <span className="tnum grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-navy-800">{a.title}</p>
                    <span className={`pill ${PRIORITY_TONE[a.priority]}`}>
                      {evalPriorityLabel(a.priority, locale)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-navy-600">{a.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!clientSafe && <PromptDisclosure prompt={report.meta.prompt} />}
    </div>
  );
}
