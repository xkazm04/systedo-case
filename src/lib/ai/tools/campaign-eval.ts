/** AI tool — campaign / portfolio evaluation (grounded in synced Google Ads data).
 *  Builds the JSON schema, normalizes/validates the model output and provides a
 *  deterministic, data-driven demo fallback for both the single-campaign and the
 *  overall-portfolio scope. Runs through the provider-switching LLM wrapper
 *  (../../llm). Server-only. */
import { Type } from "@google/genai";
import {
  type AiResponse,
  type CampaignReportResult,
  type EvalPriority,
  type EvalRecommendation,
  type EvalScope,
} from "../../ai-types";
import {
  CAMPAIGN_TYPE_LABELS,
  TARGET_PNO,
  TARGET_ROAS,
  aggregate,
  groupByType,
  withMetrics,
  type Campaign,
  type CampaignPeriod,
} from "../../campaigns/types";
import { buildCampaignPrompt, buildOverallPrompt } from "../../campaigns/report-input";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct } from "../../format";
import { generateStructured } from "../../llm";
import { txt, cleanList } from "./_shared";

const EVAL_SYSTEM = `Jsi zkušený český PPC stratég a specialista na Google Ads v marketingové agentuře. Vyhodnocuješ výkon reklamních kampaní a připravuješ klientovi stručný hodnoticí report s konkrétními dalšími kroky.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel. Nevymýšlej si žádné metriky ani hodnoty, které v datech nejsou.
- Skóre 0–100 vyjadřuje zdraví kampaně/portfolia vůči cílovému PNO a vůči ostatním kampaním: ~80+ výborné, ~60–79 solidní, ~40–59 průměrné s rezervami, pod 40 podvýkonné.
- Doporučení musí být akční a konkrétní (navýšit/snížit rozpočet, upravit nabídky, vyloučení, cílení, kreativu, utlumit či pozastavit) a seřazená podle priority (high/medium/low).
- Odkazuj se na konkrétní čísla (ROAS, PNO, CPA, podíl na nákladech).
- Piš česky, věcně, bez marketingových frází. Drž se zadaného JSON schématu.`;

const EVAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, description: "Jednovětý verdikt o výkonu" },
    score: { type: Type.NUMBER, description: "Skóre zdraví 0–100" },
    summary: { type: Type.STRING, description: "Jeden odstavec shrnutí" },
    strengths: { type: Type.ARRAY, description: "2–4 silné stránky", items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, description: "1–4 slabiny nebo rizika", items: { type: Type.STRING } },
    recommendations: {
      type: Type.ARRAY,
      description: "2–5 konkrétních doporučených kroků s prioritou",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          priority: { type: Type.STRING, description: "Priorita: high, medium nebo low" },
        },
        required: ["title", "detail", "priority"],
        propertyOrdering: ["title", "detail", "priority"],
      },
    },
  },
  required: ["verdict", "score", "summary", "strengths", "weaknesses", "recommendations"],
  propertyOrdering: ["verdict", "score", "summary", "strengths", "weaknesses", "recommendations"],
};

function normalizePriority(v: unknown): EvalPriority {
  const s = txt(v).toLowerCase();
  return s === "high" || s === "low" ? s : "medium";
}

function normalizeReport(parsed: unknown): CampaignReportResult {
  const o = parsed as Record<string, unknown>;
  const recommendations: EvalRecommendation[] = Array.isArray(o.recommendations)
    ? o.recommendations
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ title: txt(x.title), detail: txt(x.detail), priority: normalizePriority(x.priority) }))
        .filter((x) => x.title)
        .slice(0, 6)
    : [];
  const raw = typeof o.score === "number" ? o.score : Number(o.score);
  const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
  return {
    verdict: txt(o.verdict),
    score,
    summary: txt(o.summary),
    strengths: cleanList(o.strengths, 6),
    weaknesses: cleanList(o.weaknesses, 6),
    recommendations,
  };
}

/** Flag evaluation output that's out of range or missing the decision-bearing
 *  parts (score 0–100, a verdict, a summary, at least one recommendation), so the
 *  wrapper re-prompts before the normalizer clamps an out-of-range score to 0. */
function validateReport(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const v: string[] = [];
  const raw = typeof o.score === "number" ? o.score : Number(o.score);
  if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
    v.push(`Skóre musí být číslo 0–100 (dostal jsem „${String(o.score)}“).`);
  }
  if (!txt(o.verdict)) v.push("Chybí jednovětý verdikt.");
  if (!txt(o.summary)) v.push("Chybí shrnutí (summary).");
  const recs = Array.isArray(o.recommendations)
    ? o.recommendations.filter(
        (x) => Boolean(x) && typeof x === "object" && txt((x as Record<string, unknown>).title)
      ).length
    : 0;
  if (recs === 0) v.push("Chybí doporučené kroky (recommendations).");
  return v;
}

/** Map ROAS to a 0–100 health score relative to the target — shared by the demo
 *  fallbacks so a keyless run still produces a believable, data-driven number. */
function healthScore(roas: number): number {
  if (roas <= 0) return 5;
  return Math.max(5, Math.min(99, Math.round(40 + (roas / TARGET_ROAS - 1) * 40)));
}

function demoCampaignReport(target: Campaign, all: Campaign[]): CampaignReportResult {
  const t = withMetrics(target);
  const portfolio = aggregate(all);
  const beatsTarget = t.pno > 0 && t.pno <= TARGET_PNO;
  const costShare = portfolio.cost > 0 ? target.cost / portfolio.cost : 0;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (t.roas > 0) {
    (beatsTarget ? strengths : weaknesses).push(
      `ROAS ${fmtMultiple(t.roas)} ${beatsTarget ? "překonává" : "nedosahuje"} cílovou hodnotu ${fmtMultiple(TARGET_ROAS)}.`
    );
  }
  if (t.ctr >= 0.05) strengths.push(`Vysoká míra prokliku (CTR ${fmtPct(t.ctr, 2)}).`);
  if (t.conversions > 0)
    strengths.push(`Přináší ${fmtInt(t.conversions)} konverzí při CPA ${fmtCZK(t.cpa)}.`);
  if (!beatsTarget && t.pno > 0)
    weaknesses.push(`PNO ${fmtPct(t.pno)} je nad cílem ${fmtPct(TARGET_PNO, 0)} — táhne efektivitu dolů.`);
  if (target.status === "paused") weaknesses.push("Kampaň je aktuálně pozastavená.");

  const recommendations: EvalRecommendation[] = [
    beatsTarget
      ? {
          title: "Navýšit rozpočet",
          detail: `Při ROAS ${fmtMultiple(t.roas)} pod cílovým PNO má kampaň prostor pro škálování.`,
          priority: "high",
        }
      : {
          title: "Srovnat efektivitu k cíli",
          detail: `Zkontrolovat nabídky, vyloučení a cílení a snížit PNO ${fmtPct(t.pno)} k cíli ${fmtPct(TARGET_PNO, 0)}.`,
          priority: "high",
        },
    {
      title: "Zlepšit kreativu a relevanci",
      detail: `CTR ${fmtPct(t.ctr, 2)} a konverzní poměr ${fmtPct(t.convRate, 2)} ukazují prostor v inzerátech a vstupních stránkách.`,
      priority: "medium",
    },
  ];

  return {
    verdict: `${beatsTarget ? "Efektivní kampaň nad cílem" : "Kampaň pod cílovou efektivitou"} (ROAS ${fmtMultiple(t.roas)}).`,
    score: healthScore(t.roas),
    summary: `Kampaň „${target.name}“ (${CAMPAIGN_TYPE_LABELS[target.type]}) utratila ${fmtCZK(t.cost)} a přinesla ${fmtCZK(t.conversionValue)} při ROAS ${fmtMultiple(t.roas)} a PNO ${fmtPct(t.pno)}. Tvoří ${fmtPct(costShare)} nákladů portfolia. Ukázkový výstup — připojte LLM (Claude Code v devu, Gemini v produkci) pro vyhodnocení modelem.`,
    strengths,
    weaknesses,
    recommendations,
  };
}

function demoOverallReport(all: Campaign[]): CampaignReportResult {
  const portfolio = aggregate(all);
  const rows = all.map(withMetrics);
  const types = groupByType(all);
  const best = [...rows].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...rows].filter((c) => c.cost > 0).sort((a, b) => a.roas - b.roas)[0] ?? best;
  const bestType = [...types].sort((a, b) => b.total.roas - a.total.roas)[0];
  const underTarget = portfolio.pno > 0 && portfolio.pno <= TARGET_PNO;

  const strengths: string[] = [
    `Nejvýkonnější kampaň „${best.name}“ s ROAS ${fmtMultiple(best.roas)}.`,
    `Nejefektivnější typ ${CAMPAIGN_TYPE_LABELS[bestType.type]} (ROAS ${fmtMultiple(bestType.total.roas)}).`,
  ];
  const weaknesses: string[] = [
    `Nejslabší kampaň „${worst.name}“ s ROAS ${fmtMultiple(worst.roas)} a PNO ${fmtPct(worst.pno)}.`,
  ];
  if (!underTarget)
    weaknesses.push(`Celkové PNO ${fmtPct(portfolio.pno)} je nad cílem ${fmtPct(TARGET_PNO, 0)}.`);

  const recommendations: EvalRecommendation[] = [
    {
      title: `Přesunout rozpočet do „${best.name}“`,
      detail: `Kampaň s nejlepším ROAS (${fmtMultiple(best.roas)}) unese vyšší objem při zachování efektivity.`,
      priority: "high",
    },
    {
      title: `Optimalizovat nebo utlumit „${worst.name}“`,
      detail: `Při ROAS ${fmtMultiple(worst.roas)} a nákladech ${fmtCZK(worst.cost)} přealokovat rozpočet k efektivnějším kampaním.`,
      priority: "high",
    },
    {
      title: underTarget ? "Škálovat při zachování PNO" : "Srovnat PNO k cíli",
      detail: underTarget
        ? `Portfolio s PNO ${fmtPct(portfolio.pno)} má prostor zvýšit objem, dokud zůstane pod cílem ${fmtPct(TARGET_PNO, 0)}.`
        : `Přealokovat od nákladných typů k těm s nejlepší návratností, aby PNO kleslo k ${fmtPct(TARGET_PNO, 0)}.`,
      priority: "medium",
    },
  ];

  return {
    verdict: `Portfolio ${underTarget ? "je v cíli" : "překračuje cílové PNO"} (ROAS ${fmtMultiple(portfolio.roas)}, PNO ${fmtPct(portfolio.pno)}).`,
    score: healthScore(portfolio.roas),
    summary: `${portfolio.count} kampaní utratilo ${fmtCZK(portfolio.cost)} a přineslo ${fmtCZK(portfolio.conversionValue)} při ROAS ${fmtMultiple(portfolio.roas)} a PNO ${fmtPct(portfolio.pno)} (cíl ${fmtPct(TARGET_PNO, 0)}). Výkon táhnou ${CAMPAIGN_TYPE_LABELS[bestType.type]} a brandové vyhledávání. Ukázkový výstup — připojte LLM (Claude Code v devu, Gemini v produkci) pro vyhodnocení modelem.`,
    strengths,
    weaknesses,
    recommendations,
  };
}

export function generateCampaignEvaluation(args: {
  scope: EvalScope;
  target: Campaign | null;
  campaigns: Campaign[];
  period: CampaignPeriod;
  /** account's winning-pattern lines, to ground the portfolio prompt */
  patternLines?: string[];
}): Promise<AiResponse<CampaignReportResult>> {
  const single = args.scope === "campaign" && args.target;
  return generateStructured({
    // llm-tool: campaign-eval
    id: "campaign-eval",
    prompt: single
      ? buildCampaignPrompt(args.target!, args.campaigns, args.period)
      : buildOverallPrompt(args.campaigns, args.period, args.patternLines ?? []),
    system: EVAL_SYSTEM,
    schema: EVAL_SCHEMA,
    temperature: 0.6,
    normalize: normalizeReport,
    validate: validateReport,
    demo: () =>
      single ? demoCampaignReport(args.target!, args.campaigns) : demoOverallReport(args.campaigns),
  });
}
