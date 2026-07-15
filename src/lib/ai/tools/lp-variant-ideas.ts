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
import { withObjectGuard } from "./_validate";
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

function buildLpVariantIdeasPrompt(req: LpVariantIdeasRequest, grounding?: string): string {
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
    // D4: ground the hypotheses in the account's real lead-quality / CVR picture, so
    // challengers target a real weakness (bad source, slow response) — not "add a
    // testimonial". Data only; the model must not invent numbers.
    ...(grounding
      ? ["", "SKUTEČNÁ DATA ÚČTU (opři hypotézy o ně, ale nevymýšlej vlastní čísla):", grounding]
      : []),
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

/** Case/whitespace-insensitive label key — lowercased, trimmed, internal whitespace
 *  collapsed to one space. Used both to de-duplicate variants and to match a variant
 *  against the control / disproven-loser labels, so „Sociální  Důkaz " and
 *  „sociální důkaz" count as the same concept. */
function labelKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The labels a challenger must NOT re-propose: the control's own label + every
 *  disproven loser, normalized. Re-proposing any of them is not a new test. */
function bannedLabels(req: LpVariantIdeasRequest): Set<string> {
  const banned = new Set<string>();
  if (req.controlLabel) banned.add(labelKey(req.controlLabel));
  for (const l of req.losers ?? []) {
    const k = labelKey(l);
    if (k) banned.add(k);
  }
  return banned;
}

/** Well-formed variants, de-duplicated by normalized label (first occurrence wins) —
 *  so „Sociální důkaz" and „sociální  důkaz" don't both count toward the ≥2 bar. */
function distinctVariants(raw: unknown[]): LpVariantIdea[] {
  const seen = new Set<string>();
  const out: LpVariantIdea[] = [];
  for (const item of raw) {
    const v = toVariant(item);
    if (!v) continue;
    const k = labelKey(v.label);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** Map the raw model output into validated concepts: trim + clamp each field, drop
 *  entries missing a label or hypothesis, DE-DUPE by label and DROP any that re-propose
 *  the control / a disproven loser, then clamp to at most 3. Falls back to the
 *  deterministic demo unless at least TWO distinct, non-banned challengers survive —
 *  an A/B test needs more than one arm, and it must not re-run a losing one. */
export function normalizeLpVariantIdeas(
  parsed: unknown,
  req: LpVariantIdeasRequest
): LpVariantIdeasResult {
  const o = parsed as Record<string, unknown> | null;
  const raw = Array.isArray(o?.variants) ? o.variants : [];
  const banned = bannedLabels(req);
  const variants = distinctVariants(raw)
    .filter((v) => !banned.has(labelKey(v.label)))
    .slice(0, 3);
  return variants.length >= 2 ? { variants } : demoLpVariantIdeas(req);
}

/** Flag an unusable set so the wrapper re-prompts once. A usable output needs at
 *  least TWO variants with DISTINCT labels (one arm is not a test), and NONE may match
 *  the control label or a disproven loser (case/whitespace-insensitive) — re-proposing
 *  a losing angle wastes the test. */
export function validateLpVariantIdeas(parsed: unknown, req: LpVariantIdeasRequest): string[] {
  return withObjectGuard((o) => {
    const raw = Array.isArray(o.variants) ? o.variants : [];
    const distinct = distinctVariants(raw);
    const banned = bannedLabels(req);
    const violations: string[] = [];
    if (distinct.length < 2) {
      violations.push(
        "Vrať alespoň DVĚ od sebe navzájem odlišné varianty (různé „label“) — jeden koncept není A/B test.",
      );
    }
    if (distinct.some((v) => banned.has(labelKey(v.label)))) {
      violations.push(
        "Nenavrhuj varianty shodné s kontrolní variantou ani s již vyvrácenými (neúspěšnými) úhly — navrhni jiné.",
      );
    }
    return violations;
  })(parsed);
}

/** Deterministic, topic-templated concepts — the keyless demo and the floor when
 *  the model returns nothing usable. Builds 2 distinct challenger angles (social
 *  proof + a sharper offer) from the topic alone; invents no metrics. */
export function demoLpVariantIdeas(req: LpVariantIdeasRequest): LpVariantIdeasResult {
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
  signal?: AbortSignal,
  /** D4: the account's lead-quality / CVR grounding (leadgen/local), appended to the
   *  USER prompt so hypotheses target a real weakness. Fingerprint = system+schema,
   *  so this runtime data leaves the contract unchanged. */
  grounding?: string
): Promise<AiResponse<LpVariantIdeasResult>> {
  return generateStructured({
    // llm-tool: lp-variant-ideas
    id: "lp-variant-ideas",
    prompt: buildLpVariantIdeasPrompt(req, grounding),
    system: LP_VARIANT_IDEAS_SYSTEM,
    schema: LP_VARIANT_IDEAS_SCHEMA,
    temperature: 0.8,
    normalize: (parsed) => normalizeLpVariantIdeas(parsed, req),
    validate: (parsed) => validateLpVariantIdeas(parsed, req),
    demo: () => demoLpVariantIdeas(req),
    locale,
    signal,
  });
}
