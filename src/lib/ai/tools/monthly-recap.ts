/** AI tool — monthly recap. Like `analysis`, but grounded on the caller's OWN
 *  project dataset (resolved + tenancy-checked by the route) and framed to the
 *  project's business type, so the recap fits non-eshop projects (local / leadgen
 *  / content) instead of always reading as e-commerce. Metric-neutral result
 *  shape. Runs through the provider-switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import {
  type AiResponse,
  type MonthlyRecapRequest,
  type MonthlyRecapResult,
} from "../../ai-types";
import { buildSnapshot, snapshotToPromptText, type Snapshot } from "../../snapshot";
import type { PerformanceData } from "../../types";
import type { ProjectType } from "../../projects/types";
import { fmtCZK, fmtPct, fmtSignedPct, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { txt, cleanList, cleanTitledList, countTitled } from "./_shared";
import { refineLines } from "./refine";

export const MONTHLY_RECAP_SYSTEM = `Jsi zkušený český marketingový stratég. Připravuješ měsíční rekapitulaci výkonu pro klienta.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel a z typu podnikání klienta. Nevymýšlej si žádné metriky ani hodnoty, které v datech nejsou.
- Přizpůsob rámování typu podnikání: u e-shopu mluv o obratu, PNO a ROAS; u lokálního podniku, leadgenu nebo obsahového webu spíš o poptávkách, návštěvnosti, viditelnosti a konverzích — nepředpokládej e-commerce, pokud to data nedokládají.
- Buď konkrétní a akční: priority musí být něco, co tým reálně příští měsíc udělá.
- Piš česky, věcně, bez vaty a marketingových frází.
- Drž se zadaného JSON schématu.`;

function buildRecapPrompt(
  snapshotText: string,
  businessType?: string,
  refine?: string,
  // C2: extra grounding (e.g. lead-source quality / CPQL / velocity for leadgen &
  // local) appended to the DATA block. USER-prompt only → fingerprint unchanged.
  groundingContext?: string
): string {
  return [
    "Níže je měsíční přehled výkonu klienta z marketingových kampaní.",
    ...(businessType ? [`Typ podnikání klienta: ${businessType}.`] : []),
    "Připrav měsíční rekapitulaci a rámuj ji podle tohoto typu podnikání.",
    "",
    "DATA:",
    snapshotText,
    ...(groundingContext ? ["", groundingContext] : []),
    "",
    "Na základě těchto čísel urči: jednovětý verdikt (headline), odstavec shrnutí (summary), 3–4 hlavní úspěchy (highlights), 2–3 věci k hlídání (watchouts) a 3–4 priority na příští měsíc (priorities). Vycházej pouze z uvedených dat.",
    // Refine note (re-run steering) rides on the USER prompt only — the system
    // prompt + schema stay byte-identical, so the gate/golden fingerprint holds.
    ...refineLines(refine),
  ].join("\n");
}

const MONTHLY_RECAP_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: "Jednovětý verdikt o výkonu za měsíc" },
    summary: { type: Type.STRING, description: "Jeden odstavec shrnutí" },
    highlights: { type: Type.ARRAY, description: "3–4 hlavní úspěchy", items: { type: Type.STRING } },
    watchouts: { type: Type.ARRAY, description: "2–3 věci, na které si dát pozor", items: { type: Type.STRING } },
    priorities: {
      type: Type.ARRAY,
      description: "3–4 priority na příští měsíc",
      items: {
        type: Type.OBJECT,
        properties: { title: { type: Type.STRING }, detail: { type: Type.STRING } },
        required: ["title", "detail"],
        propertyOrdering: ["title", "detail"],
      },
    },
  },
  required: ["headline", "summary", "highlights", "watchouts", "priorities"],
  propertyOrdering: ["headline", "summary", "highlights", "watchouts", "priorities"],
};

function normalizeRecap(parsed: unknown): MonthlyRecapResult {
  const o = parsed as Record<string, unknown>;
  return {
    headline: txt(o.headline),
    summary: txt(o.summary),
    highlights: cleanList(o.highlights, 6),
    watchouts: cleanList(o.watchouts, 6),
    priorities: cleanTitledList(o.priorities, 6),
  };
}

/** Flag output missing the actionable parts, so the wrapper re-prompts instead of
 *  rendering a hollow recap the normalizer would have silently passed through. */
function validateRecap(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const v: string[] = [];
  if (!txt(o.headline)) v.push("Chybí jednovětý verdikt (headline).");
  if (cleanList(o.highlights, 6).length === 0) v.push("Chybí hlavní úspěchy (highlights).");
  if (cleanList(o.watchouts, 6).length === 0) v.push("Chybí věci k hlídání (watchouts).");
  if (countTitled(o.priorities) === 0) v.push("Chybí priority na příští měsíc (priorities).");
  return v;
}

export function demoRecap(s: Snapshot, businessType?: string): MonthlyRecapResult {
  const c = s.current;
  const pnoUnder = c.pno <= s.goalPno;
  const paid = s.channels.filter((ch) => ch.cost > 0);
  const best = [...paid].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...paid].sort((a, b) => b.pno - a.pno)[0];
  const revUp = s.delta.revenue >= 0;

  const highlights: string[] = [
    `Obrat ${revUp ? "vzrostl" : "klesl"} o ${fmtSignedPct(s.delta.revenue).replace("+", "")} meziměsíčně.`,
    `Konverze ${s.delta.conversions >= 0 ? "vzrostly" : "klesly"} o ${fmtSignedPct(s.delta.conversions).replace("+", "")}.`,
  ];
  if (best) highlights.push(`Nejefektivnější kanál ${best.channel} táhne výsledky.`);

  const watchouts: string[] = [];
  if (worst) watchouts.push(`${worst.channel} má nejvyšší PNO ${fmtPct(worst.pno)} — hlídat efektivitu.`);
  watchouts.push(pnoUnder ? `Náklady ${fmtSignedPct(s.delta.cost)} meziměsíčně — sledovat tempo.` : `Celkové PNO ${fmtPct(c.pno)} je nad cílem ${fmtPct(s.goalPno, 0)}.`);

  const priorities: { title: string; detail: string }[] = [];
  if (best) priorities.push({ title: `Posílit ${best.channel}`, detail: "Kanál s nejlepší návratností má prostor pro navýšení objemu." });
  if (worst) priorities.push({ title: `Optimalizovat ${worst.channel}`, detail: `Při PNO ${fmtPct(worst.pno)} zkontrolovat cílení, nabídky a vyloučení.` });
  priorities.push({ title: "Udržet tempo konverzí", detail: "Zaměřit se na nejsilnější vstupní body a opakovat, co v měsíci fungovalo." });

  return {
    headline: `Měsíc ${revUp ? "s růstem" : "s poklesem"} obratu (${fmtSignedPct(s.delta.revenue)})${businessType ? `, ${businessType}` : ""}.`,
    summary: `Za ${s.periodLabel} dosáhl ${s.client.name} obratu ${fmtCZK(c.revenue)} při nákladech ${fmtCZK(c.cost)} (PNO ${fmtPct(c.pno)}, cíl ${fmtPct(s.goalPno, 0)}). Ukázkový výstup — připojte LLM (Claude Code v devu, Gemini v produkci) pro rekapitulaci od modelu.`,
    highlights,
    watchouts,
    priorities,
  };
}

export function generateMonthlyRecap(
  req: MonthlyRecapRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal,
  // The project's dataset + business-type label, resolved + tenancy-checked by the
  // route (undefined → base case-study grounding, no type framing).
  data?: PerformanceData,
  businessType?: string,
  // C2: lead/local signal grounding for the DATA block (undefined for e-shop/base).
  groundingContext?: string,
  // R01: the project type shapes the DATA block's metric vocabulary (a leadgen/local
  // recap must not be fed e-shop Obrat/ROAS). Undefined → e-shop default.
  projectType?: ProjectType
): Promise<AiResponse<MonthlyRecapResult>> {
  const snapshot = buildSnapshot(req.period, "previous", data);
  return generateStructured({
    // llm-tool: monthly-recap
    id: "monthly-recap",
    prompt: buildRecapPrompt(snapshotToPromptText(snapshot, projectType), businessType, req.refine, groundingContext),
    system: MONTHLY_RECAP_SYSTEM,
    schema: MONTHLY_RECAP_SCHEMA,
    // Strictly-grounded numeric read: keep temperature low so the recap stays
    // faithful to the figures, not embellished.
    temperature: 0.4,
    normalize: normalizeRecap,
    validate: validateRecap,
    demo: () => demoRecap(snapshot, businessType),
    locale,
    signal,
  });
}
