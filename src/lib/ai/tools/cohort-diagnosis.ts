/** AI tool — cohort diagnosis (grounded in the computed CAC/LTV cohort economics).
 *  Reads the per-cohort numbers the LTV module already computed and returns a
 *  concise Czech diagnosis: which cohort is the problem and the single lever to
 *  pull first. Builds the prompt + JSON schema, normalizes/validates the model
 *  output and provides a deterministic, data-driven demo fallback that picks the
 *  lowest LTV:CAC cohort. Runs through the provider-switching LLM wrapper
 *  (../../llm). The model gets ONLY real figures and must not invent any.
 *  Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  CohortDiagnosisCohort,
  CohortDiagnosisRequest,
  CohortDiagnosisResult,
  TrendDirection,
} from "../../ai-types";
import { fmtCZK, fmtMultiple, fmtPct, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { txt, cleanList } from "./_shared";
import { refineLines } from "./refine";

function cohortDiagnosisSystem(eshop: boolean): string {
  const domain = eshop ? "e-shopy a opakované nákupy" : "produktové a SaaS firmy";
  const lever = eshop ? "zvýšit opakované nákupy / hodnotu objednávky" : "zvýšit retenci/ARPU";
  const retention = eshop ? "M3 opakování" : "M3 retence";
  return `Jsi zkušený český analytik jednotkové ekonomiky (CAC, LTV, návratnost) pro ${domain}. Děláš stručnou diagnostiku akvizičních kohort pro zakladatele.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel. Nevymýšlej si žádné metriky, kohorty ani hodnoty, které v datech nejsou.
- Urči JEDNU nejproblematičtější kohortu (nejnižší poměr LTV:CAC, případně nejdelší / chybějící návratnost) a pojmenuj ji přesně tak, jak je označená v datech.
- Doporuč JEDEN nejúčinnější páku, kterou má smysl řešit jako první (snížit CAC, ${lever}, nebo přealokovat rozpočet) — konkrétně a akčně, ne obecně.
- Odkazuj se na konkrétní čísla z dat (CAC, LTV, LTV:CAC, návratnost, ${retention}).
- Cíl je LTV:CAC ≥ 3 a co nejkratší návratnost. Pod 1 je akvizice ztrátová.
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`;
}

const TREND_LABEL: Record<TrendDirection, string> = {
  improving: "zlepšuje se (LTV:CAC roste od nejstarší k nejnovější kohortě)",
  worsening: "zhoršuje se (LTV:CAC klesá od nejstarší k nejnovější kohortě)",
  flat: "beze změny",
};

function cohortLine(c: CohortDiagnosisCohort, eshop: boolean): string {
  const payback = c.paybackMonth != null ? `${c.paybackMonth} měs.` : "> horizont (nevrací se)";
  return [
    `- ${c.month}:`,
    `CAC ${fmtCZK(c.cac)},`,
    `LTV ${fmtCZK(c.ltv)},`,
    `LTV:CAC ${fmtMultiple(c.ltvCac)},`,
    `návratnost ${payback},`,
    `${eshop ? "M3 opakování" : "M3 retence"} ${fmtPct(c.m3)},`,
    `${eshop ? "zákazníků" : "registrací"} ${c.signups}`,
  ].join(" ");
}

function buildCohortDiagnosisPrompt(req: CohortDiagnosisRequest): string {
  const eshop = req.eshop ?? false;
  const retention = eshop ? "M3 opakování" : "M3 retence";
  const labels = req.cohorts.map((c) => c.month).join(", ");
  return [
    `Níže jsou reálná, již spočítaná data akvizičních kohort (CAC, LTV, LTV:CAC, návratnost, ${retention}).`,
    "Zanalyzuj jednotkovou ekonomiku a připrav krátkou diagnostiku.",
    "",
    "SOUHRN PORTFOLIA:",
    `Blended CAC ${fmtCZK(req.blendedCac)}, průměrné LTV:CAC ${fmtMultiple(req.avgLtvCac)}, průměrná návratnost ${
      req.avgPayback != null ? `${req.avgPayback.toFixed(1)} měs.` : "—"
    }.`,
    req.trend ? `Trend kohort: ${TREND_LABEL[req.trend]}.` : "",
    "",
    "KOHORTY (od nejstarší po nejnovější):",
    ...req.cohorts.map((c) => cohortLine(c, eshop)),
    "",
    `Povolené názvy kohort pro pole „worstCohort": ${labels}.`,
    "",
    'Vrať: „summary" (krátký odstavec čtení ekonomiky), „worstCohort" (přesný název nejproblematičtější kohorty z dat), „recommendation" (jedna nejúčinnější páka k řešení jako první) a volitelně „risks" (1–3 rizika). Vycházej pouze z uvedených čísel.',
    ...refineLines(req.refine),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const COHORT_DIAGNOSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: "Krátký odstavec shrnující jednotkovou ekonomiku kohort" },
    worstCohort: {
      type: Type.STRING,
      description: "Přesný název (month) nejproblematičtější kohorty z předaných dat",
    },
    recommendation: {
      type: Type.STRING,
      description: "Jedna nejúčinnější páka, kterou řešit jako první (konkrétní akce)",
    },
    risks: {
      type: Type.ARRAY,
      description: "1–3 rizika nebo na co si dát pozor",
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "worstCohort", "recommendation"],
  propertyOrdering: ["summary", "worstCohort", "recommendation", "risks"],
};

/** The cohort with the lowest LTV:CAC — the deterministic "worst" pick used by
 *  the demo and as the floor for an empty / off-list model worstCohort. */
function worstCohortOf(cohorts: CohortDiagnosisCohort[]): CohortDiagnosisCohort | null {
  if (cohorts.length === 0) return null;
  return cohorts.reduce((worst, c) => (c.ltvCac < worst.ltvCac ? c : worst), cohorts[0]!);
}

function normalizeCohortDiagnosis(
  parsed: unknown,
  req: CohortDiagnosisRequest
): CohortDiagnosisResult {
  const o = parsed as Record<string, unknown> | null;
  const labels = new Set(req.cohorts.map((c) => c.month));
  const fallback = demoCohortDiagnosis(req);

  // Keep the model's worstCohort only when it names a real cohort; otherwise fall
  // back to the deterministically lowest LTV:CAC pick so the field is always valid.
  const rawWorst = txt(o?.worstCohort);
  const worstCohort = labels.has(rawWorst) ? rawWorst : fallback.worstCohort;

  const risks = cleanList(o?.risks, 3);
  const result: CohortDiagnosisResult = {
    summary: txt(o?.summary) || fallback.summary,
    worstCohort,
    recommendation: txt(o?.recommendation) || fallback.recommendation,
  };
  if (risks.length > 0) result.risks = risks;
  else if (fallback.risks && fallback.risks.length > 0) result.risks = fallback.risks;
  return result;
}

/** Flag a hollow diagnosis (no summary / recommendation, or a worstCohort that
 *  isn't one of the supplied labels) so the wrapper re-prompts once instead of
 *  rendering an empty card the normalizer would silently paper over. */
function validateCohortDiagnosis(parsed: unknown, req: CohortDiagnosisRequest): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const labels = new Set(req.cohorts.map((c) => c.month));
  const v: string[] = [];
  if (!txt(o.summary)) v.push("Chybí shrnutí (summary).");
  if (!txt(o.recommendation)) v.push("Chybí doporučení (recommendation).");
  const worst = txt(o.worstCohort);
  if (!worst) v.push("Chybí název problémové kohorty (worstCohort).");
  else if (labels.size > 0 && !labels.has(worst)) {
    v.push(`„worstCohort" musí být jedna z předaných kohort: ${[...labels].join(", ")}.`);
  }
  return v;
}

/** Deterministic, data-driven diagnosis: pick the lowest LTV:CAC cohort and emit
 *  a templated Czech reading. The keyless demo and the floor for empty fields. */
function demoCohortDiagnosis(req: CohortDiagnosisRequest): CohortDiagnosisResult {
  const worst = worstCohortOf(req.cohorts);
  if (!worst) {
    return {
      summary:
        "Nejsou k dispozici žádné kohorty k vyhodnocení. Doplňte akviziční data (CAC, LTV, retenci) z product analytics. Ukázkový výstup — připojte LLM (Claude v devu, Gemini v produkci) pro diagnostiku od modelu.",
      worstCohort: "—",
      recommendation: "Nejdřív zaveďte měření kohort (registrace → retence → tržby), pak vyhodnoťte ekonomiku.",
    };
  }

  const payback =
    worst.paybackMonth != null ? `za ${worst.paybackMonth} měs.` : "se v rámci horizontu nevrací";
  const belowGoal = worst.ltvCac < 3;
  const losing = worst.ltvCac < 1;

  // Choose the single most impactful lever from the numbers: if CAC dwarfs LTV,
  // attack CAC; if retention is weak, push retention/ARPU; otherwise reallocate.
  const cacHeavy = worst.ltv > 0 && worst.cac / worst.ltv >= 0.4;
  const weakRetention = worst.m3 < 0.4;
  let recommendation: string;
  if (losing && cacHeavy) {
    recommendation = `Snižte CAC kohorty ${worst.month} (${fmtCZK(worst.cac)}/registraci) — utlumte nejdražší kanály a přesuňte rozpočet ke kohortám s nejlepší LTV:CAC, než přidáte další objem.`;
  } else if (weakRetention) {
    recommendation = `Zvedněte retenci/ARPU kohorty ${worst.month} (M3 retence jen ${fmtPct(worst.m3)}) — onboarding a aktivace v prvních týdnech protáhnou křivku a zvednou LTV ${fmtCZK(worst.ltv)}.`;
  } else {
    recommendation = `Přealokujte rozpočet od kohorty ${worst.month} (LTV:CAC ${fmtMultiple(worst.ltvCac)}) ke kohortám s vyšší návratností — neškálujte akvizici, dokud se LTV:CAC nedostane k cíli ≥ 3×.`;
  }

  const risks: string[] = [];
  if (belowGoal) {
    risks.push(
      `Kohorta ${worst.month} má LTV:CAC ${fmtMultiple(worst.ltvCac)} pod cílem 3× — rychlejší akvizice prohlubuje ztrátu.`
    );
  }
  if (worst.paybackMonth == null) {
    risks.push(`Návratnost kohorty ${worst.month} přesahuje horizont — kapitál se váže příliš dlouho.`);
  }

  return {
    summary: `Nejslabší je kohorta ${worst.month}: CAC ${fmtCZK(worst.cac)}, LTV ${fmtCZK(worst.ltv)}, tedy LTV:CAC ${fmtMultiple(
      worst.ltvCac
    )} (návratnost ${payback}). Při průměru portfolia ${fmtMultiple(req.avgLtvCac)} ${
      belowGoal ? "táhne ekonomiku pod cíl 3×" : "drží blízko cíle"
    }. Ukázkový výstup — připojte LLM (Claude v devu, Gemini v produkci) pro diagnostiku od modelu.`,
    worstCohort: worst.month,
    recommendation,
    risks: risks.length > 0 ? risks : undefined,
  };
}

export function generateCohortDiagnosis(
  req: CohortDiagnosisRequest,
  locale?: SupportedLocale
): Promise<AiResponse<CohortDiagnosisResult>> {
  return generateStructured({
    // llm-tool: cohort-diagnosis
    id: "cohort-diagnosis",
    prompt: buildCohortDiagnosisPrompt(req),
    system: cohortDiagnosisSystem(req.eshop ?? false),
    schema: COHORT_DIAGNOSIS_SCHEMA,
    temperature: 0.6,
    normalize: (parsed) => normalizeCohortDiagnosis(parsed, req),
    validate: (parsed) => validateCohortDiagnosis(parsed, req),
    demo: () => demoCohortDiagnosis(req),
    locale,
  });
}
