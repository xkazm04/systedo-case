/** AI tool — performance analysis (grounded in the dashboard dataset). Builds the
 *  prompt + JSON schema, normalizes/validates the model output and provides a
 *  deterministic, data-driven demo fallback. Runs through the provider-switching
 *  LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import {
  type AiResponse,
  type AnalysisRequest,
  type AnalysisResult,
} from "../../ai-types";
import { buildSnapshot, snapshotToPromptText, type Snapshot } from "../../snapshot";
import { fmtCZK, fmtMultiple, fmtPct, fmtSignedPct, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { txt, cleanList } from "./_shared";

const ANALYSIS_SYSTEM = `Jsi zkušený český specialista na výkonnostní marketing a e-commerce. Připravuješ stručné, srozumitelné shrnutí výkonu pro klienta.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel. Nevymýšlej si žádné metriky ani hodnoty, které v datech nejsou.
- Odkazuj se na konkrétní kanály a čísla z dat (např. PNO daného kanálu, ROAS, podíl na obratu).
- Buď konkrétní a akční: doporučení musí být něco, co PPC specialista reálně udělá (úprava rozpočtů a nabídek, řízení PNO, škálování nejlepších kanálů, oprava nejslabších).
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`;

function buildAnalysisPrompt(snapshotText: string): string {
  return [
    "Níže jsou reálná výkonnostní data klienta z marketingových kampaní.",
    "Zanalyzuj je jako PPC specialista a připrav krátké shrnutí pro klienta.",
    "",
    "DATA:",
    snapshotText,
    "",
    "Na základě těchto čísel urči: jednovětý verdikt, krátké shrnutí, co se daří (wins), kde jsou rizika (risks) a 3–4 konkrétní další kroky (actions). Vycházej pouze z uvedených dat.",
  ].join("\n");
}

const ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: "Jednovětý verdikt o výkonu" },
    summary: { type: Type.STRING, description: "Jeden odstavec shrnutí" },
    wins: { type: Type.ARRAY, description: "3–4 věci, které se daří", items: { type: Type.STRING } },
    risks: { type: Type.ARRAY, description: "2–3 rizika nebo na co si dát pozor", items: { type: Type.STRING } },
    actions: {
      type: Type.ARRAY,
      description: "3–4 konkrétní doporučené kroky",
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, detail: { type: Type.STRING } },
        required: ["title", "detail"],
        propertyOrdering: ["title", "detail"],
      },
    },
  },
  required: ["headline", "summary", "wins", "risks", "actions"],
  propertyOrdering: ["headline", "summary", "wins", "risks", "actions"],
};

function normalizeAnalysisResult(parsed: unknown): AnalysisResult {
  const o = parsed as Record<string, unknown>;
  const actions = Array.isArray(o.actions)
    ? o.actions
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ title: txt(x.title), detail: txt(x.detail) }))
        .filter((x) => x.title)
        .slice(0, 6)
    : [];
  return {
    headline: txt(o.headline),
    summary: txt(o.summary),
    wins: cleanList(o.wins, 6),
    risks: cleanList(o.risks, 6),
    actions,
  };
}

/** Flag analysis output missing the actionable parts (empty wins/risks/actions
 *  or no verdict), so the wrapper re-prompts instead of rendering a hollow card
 *  that the normalizer would have silently passed through. */
function validateAnalysis(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const v: string[] = [];
  if (!txt(o.headline)) v.push("Chybí jednovětý verdikt (headline).");
  if (cleanList(o.wins, 6).length === 0) v.push("Chybí body „co se daří“ (wins).");
  if (cleanList(o.risks, 6).length === 0) v.push("Chybí rizika (risks).");
  const actions = Array.isArray(o.actions)
    ? o.actions.filter(
        (x) => Boolean(x) && typeof x === "object" && txt((x as Record<string, unknown>).title)
      ).length
    : 0;
  if (actions === 0) v.push("Chybí konkrétní doporučené kroky (actions).");
  return v;
}

function demoAnalysis(s: Snapshot): AnalysisResult {
  const c = s.current;
  const pnoUnder = c.pno <= s.goalPno;
  const paid = s.channels.filter((ch) => ch.cost > 0);
  const best = [...paid].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...paid].sort((a, b) => b.pno - a.pno)[0];
  const revUp = s.delta.revenue >= 0;

  const wins: string[] = [
    `Obrat ${revUp ? "vzrostl" : "klesl"} o ${fmtSignedPct(s.delta.revenue).replace("+", "")} meziobdobně.`,
  ];
  if (best) wins.push(`Nejefektivnější kanál ${best.channel} s ROAS ${fmtMultiple(best.roas)}.`);
  wins.push(pnoUnder ? `Celkové PNO ${fmtPct(c.pno)} je pod cílem ${fmtPct(s.goalPno, 0)}.` : `Konverzní poměr ${fmtPct(c.cr, 2)}.`);

  const risks: string[] = [];
  if (worst) risks.push(`${worst.channel} má nejvyšší PNO ${fmtPct(worst.pno)} — táhne efektivitu dolů.`);
  risks.push(
    pnoUnder
      ? `Náklady ${fmtSignedPct(s.delta.cost)} meziobdobně — hlídat tempo růstu.`
      : `Celkové PNO ${fmtPct(c.pno)} je nad cílem ${fmtPct(s.goalPno, 0)}.`
  );

  const actions: { title: string; detail: string }[] = [];
  if (best)
    actions.push({
      title: `Posílit ${best.channel}`,
      detail: `Kanál s nejlepším ROAS (${fmtMultiple(best.roas)}) má prostor pro navýšení rozpočtu.`,
    });
  if (worst)
    actions.push({
      title: `Optimalizovat ${worst.channel}`,
      detail: `Při PNO ${fmtPct(worst.pno)} zkontrolovat nabídky, vyloučení a kvalitu cílení.`,
    });
  actions.push(
    pnoUnder
      ? {
          title: "Škálovat při zachování PNO",
          detail: `PNO ${fmtPct(c.pno)} dává prostor zvýšit objem, dokud zůstane pod cílem ${fmtPct(s.goalPno, 0)}.`,
        }
      : {
          title: "Srovnat PNO k cíli",
          detail: "Přealokovat rozpočet od nákladných kanálů k těm s nejlepší návratností.",
        }
  );

  return {
    headline: `${pnoUnder ? "PNO je pod cílem" : "PNO překračuje cíl"}, obrat ${revUp ? "roste" : "klesá"} (${fmtSignedPct(s.delta.revenue)}).`,
    summary: `Za posledních ${s.periodLabel} dosáhl ${s.client.name} obratu ${fmtCZK(c.revenue)} při nákladech ${fmtCZK(c.cost)}, což odpovídá PNO ${fmtPct(c.pno)} (cíl ${fmtPct(s.goalPno, 0)}) a ROAS ${fmtMultiple(c.roas)}. Konverze ${s.delta.conversions >= 0 ? "vzrostly" : "klesly"} o ${fmtSignedPct(s.delta.conversions).replace("+", "")}. Ukázkový výstup — připojte LLM (Claude Code v devu, Gemini v produkci) pro analýzu od modelu.`,
    wins,
    risks,
    actions,
  };
}

export function generateAnalysis(req: AnalysisRequest, locale?: SupportedLocale): Promise<AiResponse<AnalysisResult>> {
  const snapshot = buildSnapshot(req.period);
  return generateStructured({
    // llm-tool: analysis
    id: "analysis",
    prompt: buildAnalysisPrompt(snapshotToPromptText(snapshot)),
    system: ANALYSIS_SYSTEM,
    schema: ANALYSIS_SCHEMA,
    // Strictly-grounded numeric read (5/5): keep temperature low so the verdict
    // stays consistent and faithful to the figures, not embellished.
    temperature: 0.4,
    normalize: normalizeAnalysisResult,
    validate: validateAnalysis,
    demo: () => demoAnalysis(snapshot),
    locale,
  });
}
