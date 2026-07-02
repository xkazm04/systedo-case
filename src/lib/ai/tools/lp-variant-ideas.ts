/** AI tool — landing-page variant / hypothesis generator. From a topic / keyword
 *  context (the experiment's cluster + name + any keywords) it returns 2–3 distinct
 *  CHALLENGER landing-page variant concepts to test against the control — each a
 *  testable hypothesis with a headline draft, primary CTA and a one-line rationale.
 *  Turns the LP experimenty module's hand-authored variant strings into AI-drafted
 *  concepts a marketer can ship straight into a test.
 *
 *  Scope: the topic + keywords only — there is no real conversion dataset, so the
 *  model is told to invent NO metrics (no fake conversion rates / traffic). Builds
 *  the prompt + JSON schema, normalizes (trim, clamp to 3, drop entries missing a
 *  label or hypothesis) and validates (≥ 1 well-formed concept), with a deterministic
 *  demo() that templates 2 challenger angles from the topic so a clean checkout
 *  works keyless. Runs through the provider-switching LLM wrapper (../../llm).
 *  Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  LpVariantIdea,
  LpVariantIdeasRequest,
  LpVariantIdeasResult,
} from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { txt, clamp } from "./_shared";
import { refineLines } from "./refine";

const LP_VARIANT_IDEAS_SYSTEM = `Jsi český CRO specialista (optimalizace konverzního poměru) a copywriter pro landing pages. Z tématu a klíčových slov navrhuješ konkurenční varianty landing page (challengery), které se otestují proti stávající kontrolní variantě v A/B testu.

Pravidla:
- Navrhni 2–3 OD SEBE ODLIŠNÉ koncepty variant — každý ať testuje jinou hypotézu (jiný úhel, jiný hlavní benefit, jiná struktura nabídky), ne jen přeformulování téhož.
- Každá varianta se musí lišit od kontrolní varianty — nenabízej znovu to, co už dělá kontrola.
- Jsou-li uvedeny už OTESTOVANÉ A NEÚSPĚŠNÉ úhly, nenavrhuj je znovu — jsou vyvrácené. Cílem je překonat uvedený konverzní poměr kontroly.
- Pro KAŽDOU variantu vrať: „label“ (krátký výstižný název konceptu), „hypothesis“ (testovatelná hypotéza — proč by mohla porazit kontrolu), „headline“ (konkrétní návrh hlavního nadpisu stránky), „primaryCTA“ (text hlavního tlačítka, krátký a akční) a „rationale“ (jednou větou proč koncept dává smysl vzhledem k tématu a klíčovým slovům).
- Vycházej z předaného tématu a klíčových slov. NEVYMÝŠLEJ si žádná čísla — žádné konverzní poměry, návštěvnost ani statistiky; ty vzejdou z reálného testu, ne od tebe.
- Piš výhradně česky, gramaticky správně, s diakritikou a bez prázdných marketingových frází.
- Vrať POUZE jeden validní JSON objekt dle schématu — žádný text okolo, žádné markdown bloky, žádné komentáře.`;

function buildLpVariantIdeasPrompt(req: LpVariantIdeasRequest): string {
  const keywords = (req.keywords ?? []).filter((k) => k.trim().length > 0);
  const losers = (req.losers ?? []).filter((l) => l.trim().length > 0);
  return [
    "Navrhni konkurenční varianty (challengery) landing page pro tento A/B test.",
    "",
    `Téma / klastr landing page: ${req.topic}`,
    keywords.length > 0 ? `Klíčová slova / fráze: ${keywords.join(", ")}` : "",
    req.controlLabel ? `Stávající kontrolní varianta: ${req.controlLabel}` : "",
    req.controlDescription ? `Úhel kontroly: ${req.controlDescription}` : "",
    typeof req.controlCvr === "number" && req.controlCvr > 0
      ? `Konverzní poměr kontroly k překonání: ${(req.controlCvr * 100).toFixed(1)} %`
      : "",
    losers.length > 0
      ? `Už otestováno a NEPORAZILO kontrolu (tyto úhly NENAVRHUJ znovu, jsou vyvrácené): ${losers.join(", ")}`
      : "",
    "",
    "Vrať pole „variants“ se 2–3 odlišnými koncepty. Každý koncept je objekt { label, hypothesis, headline, primaryCTA, rationale }. Každá varianta ať testuje jinou hypotézu, liší se od kontroly a nepoužívá už vyvrácený úhel. Nevymýšlej žádná čísla.",
    ...refineLines(req.refine),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const LP_VARIANT_IDEAS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    variants: {
      type: Type.ARRAY,
      description: "2–3 odlišné koncepty konkurenčních variant landing page",
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "Krátký výstižný název konceptu varianty" },
          hypothesis: {
            type: Type.STRING,
            description: "Testovatelná hypotéza — proč by varianta mohla porazit kontrolu",
          },
          headline: { type: Type.STRING, description: "Konkrétní návrh hlavního nadpisu stránky" },
          primaryCTA: { type: Type.STRING, description: "Text hlavního tlačítka (krátký, akční)" },
          rationale: {
            type: Type.STRING,
            description: "Jednou větou proč koncept dává smysl vzhledem k tématu",
          },
        },
        required: ["label", "hypothesis", "headline", "primaryCTA", "rationale"],
        propertyOrdering: ["label", "hypothesis", "headline", "primaryCTA", "rationale"],
      },
    },
  },
  required: ["variants"],
  propertyOrdering: ["variants"],
};

/** Sanitize one raw model concept into a valid variant, or null to drop it. A
 *  usable concept needs at least a label and a hypothesis; the remaining fields
 *  are trimmed + clamped and left empty when absent. */
function toVariant(raw: unknown): LpVariantIdea | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = txt(o.label);
  const hypothesis = txt(o.hypothesis);
  if (!label || !hypothesis) return null;
  return {
    label: clamp(label, 80),
    hypothesis: clamp(hypothesis, 280),
    headline: clamp(txt(o.headline), 120),
    primaryCTA: clamp(txt(o.primaryCTA), 40),
    rationale: clamp(txt(o.rationale), 240),
  };
}

/** Map the raw model output into validated concepts: trim + clamp each field,
 *  drop entries missing a label or hypothesis, and clamp to at most 3. Falls back
 *  to the deterministic demo when nothing usable survives. */
function normalizeLpVariantIdeas(
  parsed: unknown,
  req: LpVariantIdeasRequest
): LpVariantIdeasResult {
  const o = parsed as Record<string, unknown> | null;
  const raw = Array.isArray(o?.variants) ? o.variants : [];
  const variants = raw
    .map(toVariant)
    .filter((v): v is LpVariantIdea => v !== null)
    .slice(0, 3);
  return variants.length > 0 ? { variants } : demoLpVariantIdeas(req);
}

/** Flag an empty / hollow set so the wrapper re-prompts once: at least one concept
 *  with a label and a hypothesis must be present. */
function validateLpVariantIdeas(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const raw = Array.isArray(o.variants) ? o.variants : [];
  const wellFormed = raw.map(toVariant).filter((v): v is LpVariantIdea => v !== null);
  if (wellFormed.length === 0) {
    return [
      "Výstup neobsahuje použitelnou variantu — vrať pole „variants“ s alespoň jedním konceptem, který má vyplněný „label“ i „hypothesis“.",
    ];
  }
  return [];
}

/** Deterministic, topic-templated concepts — the keyless demo and the floor when
 *  the model returns nothing usable. Builds 2 distinct challenger angles (social
 *  proof + a sharper offer) from the topic alone; invents no metrics. */
function demoLpVariantIdeas(req: LpVariantIdeasRequest): LpVariantIdeasResult {
  const topic = req.topic.trim() || "vaše téma";
  return {
    variants: [
      {
        label: "Důraz na sociální důkaz",
        hypothesis: `Návštěvníci hledající „${topic}“ potřebují důvěru — reference a počty zákazníků nahoře zvýší konverzi oproti kontrole.`,
        headline: `${topic}, kterému věří tisíce firem`,
        primaryCTA: "Vyzkoušet zdarma",
        rationale: "Sociální důkaz snižuje vnímané riziko hned v úvodu stránky.",
      },
      {
        label: "Ostřejší nabídka a benefit",
        hypothesis: `Konkrétní hlavní benefit a jasná nabídka pro „${topic}“ překoná obecnou kontrolní variantu.`,
        headline: `${topic} bez složitostí — výsledky od prvního dne`,
        primaryCTA: "Začít hned",
        rationale: "Konkrétní benefit a akční CTA cílí na vyšší nákupní záměr.",
      },
    ],
  };
}

export function generateLpVariantIdeas(
  req: LpVariantIdeasRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<LpVariantIdeasResult>> {
  return generateStructured({
    // llm-tool: lp-variant-ideas
    id: "lp-variant-ideas",
    prompt: buildLpVariantIdeasPrompt(req),
    system: LP_VARIANT_IDEAS_SYSTEM,
    schema: LP_VARIANT_IDEAS_SCHEMA,
    temperature: 0.8,
    normalize: (parsed) => normalizeLpVariantIdeas(parsed, req),
    validate: validateLpVariantIdeas,
    demo: () => demoLpVariantIdeas(req),
    locale,
    signal,
  });
}
