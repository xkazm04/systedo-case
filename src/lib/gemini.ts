/** Server-only Gemini integration for the PPC ad generator (Úkol 3).
 *
 *  Design choices that matter:
 *   - Structured output: we pass a JSON schema (responseSchema) so the model
 *     returns validated, typed data — not free text we have to parse heuristically.
 *   - Key stays on the server: GEMINI_API_KEY is read here and never reaches the
 *     client; the browser only ever sees the generated result.
 *   - Graceful fallback: with no API key the module returns a deterministic demo
 *     so the page is fully usable straight from the repo, clearly flagged as demo.
 *
 *  This file must only ever be imported from server code (the route handler).
 */
import { GoogleGenAI, Type } from "@google/genai";
import {
  AD_LIMITS,
  PLATFORM_LABELS,
  TONE_LABELS,
  type AdRequest,
  type AdResponse,
  type AdResult,
} from "./ai-types";

const MODEL = "gemini-3-flash-preview";

const SYSTEM_INSTRUCTION = `Jsi zkušený český PPC specialista a copywriter v marketingové agentuře. Píšeš reklamní texty pro vyhledávací sítě (Google Ads a Sklik) v češtině.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Striktně dodržuj limity znaků: nadpisy max ${AD_LIMITS.headline} znaků, popisky max ${AD_LIMITS.description} znaků, odznaky (callouts) max ${AD_LIMITS.callout} znaků, dlouhý nadpis max ${AD_LIMITS.longHeadline} znaků. Raději buď mírně pod limitem než přes.
- Texty musí být konkrétní a relevantní k produktu i cílové skupině. Vyhni se prázdným frázím.
- Neslibuj nepodložená tvrzení (např. „nejlepší na světě“) ani konkrétní slevy či čísla, která nebyla zadána.
- Žádné emoji, žádné zbytečné vykřičníky, nepiš celá slova velkými písmeny.
- Nadpisy ať pokrývají různé úhly: hlavní benefit, cílová skupina, výzva k akci, důvěra/kvalita, šíře sortimentu.`;

function buildPrompt(req: AdRequest): string {
  return [
    "Vytvoř sadu výkonnostních PPC inzerátů pro tuto kampaň.",
    "",
    `Platforma: ${PLATFORM_LABELS[req.platform]}`,
    `Produkt nebo služba: ${req.product}`,
    `Hlavní výhody / USP: ${req.benefits}`,
    `Cílová skupina: ${req.audience}`,
    `Tón komunikace: ${TONE_LABELS[req.tone]}`,
    "",
    "Vygeneruj:",
    `- 8 nadpisů (headlines), každý max ${AD_LIMITS.headline} znaků, vzájemně se lišící úhlem,`,
    `- 4 popisky (descriptions), každý max ${AD_LIMITS.description} znaků,`,
    `- 4 odznaky (callouts), každý max ${AD_LIMITS.callout} znaků,`,
    "- 8 návrhů klíčových slov pro tuto kampaň,",
    `- 1 dlouhý nadpis (longHeadline) max ${AD_LIMITS.longHeadline} znaků,`,
    "- krátké zdůvodnění (rationale, 1–2 věty), proč jsou texty postavené takto.",
  ].join("\n");
}

const SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headlines: {
      type: Type.ARRAY,
      description: `8 nadpisů, každý max ${AD_LIMITS.headline} znaků`,
      items: { type: Type.STRING },
    },
    descriptions: {
      type: Type.ARRAY,
      description: `4 popisky, každý max ${AD_LIMITS.description} znaků`,
      items: { type: Type.STRING },
    },
    callouts: {
      type: Type.ARRAY,
      description: `4 odznaky, každý max ${AD_LIMITS.callout} znaků`,
      items: { type: Type.STRING },
    },
    keywords: {
      type: Type.ARRAY,
      description: "8 návrhů klíčových slov",
      items: { type: Type.STRING },
    },
    longHeadline: {
      type: Type.STRING,
      description: `Dlouhý nadpis, max ${AD_LIMITS.longHeadline} znaků`,
    },
    rationale: {
      type: Type.STRING,
      description: "1–2 věty zdůvodnění zvolené strategie textů",
    },
  },
  required: ["headlines", "descriptions", "callouts", "keywords", "longHeadline", "rationale"],
  propertyOrdering: [
    "headlines",
    "descriptions",
    "callouts",
    "keywords",
    "longHeadline",
    "rationale",
  ],
};

const cleanList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

function normalizeResult(parsed: Partial<AdResult>): AdResult {
  return {
    headlines: cleanList(parsed.headlines, 10),
    descriptions: cleanList(parsed.descriptions, 6),
    callouts: cleanList(parsed.callouts, 6),
    keywords: cleanList(parsed.keywords, 14),
    longHeadline: typeof parsed.longHeadline === "string" ? parsed.longHeadline.trim() : "",
    rationale: typeof parsed.rationale === "string" ? parsed.rationale.trim() : "",
  };
}

export async function generateAds(req: AdRequest): Promise<AdResponse> {
  const prompt = buildPrompt(req);
  const start = Date.now();
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      result: demoAds(req),
      meta: { model: MODEL, demo: true, prompt, tookMs: Date.now() - start },
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: SCHEMA,
      temperature: 1.0,
    },
  });

  const text = response.text;
  if (!text) throw new Error("Model vrátil prázdnou odpověď.");

  const result = normalizeResult(JSON.parse(text) as Partial<AdResult>);
  if (result.headlines.length === 0) throw new Error("Model nevrátil žádné nadpisy.");

  return {
    result,
    meta: { model: MODEL, demo: false, prompt, tookMs: Date.now() - start },
  };
}

// --- keyless fallback -------------------------------------------------------

const clamp = (s: string, n: number): string =>
  s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";

/** Deterministic, limit-respecting sample so the page works without an API key. */
function demoAds(req: AdRequest): AdResult {
  const product = req.product.trim();
  const firstBenefit = req.benefits.split(/[,.;]/)[0]?.trim() || "Ověřená kvalita";
  const cta = req.tone === "akcni" ? "Objednejte ještě dnes" : "Nakupte pohodlně online";

  const headlines = [
    product,
    firstBenefit,
    "Skladem, ihned k odeslání",
    "Doprava zdarma od 999 Kč",
    "Kvalita, které věříte",
    cta,
    "Vybíráme s péčí",
    "Oblíbená volba zákazníků",
  ].map((h) => clamp(h, AD_LIMITS.headline));

  const descriptions = [
    clamp(`${product} — ${firstBenefit.toLowerCase()}. Objednejte online a mějte doma za pár dní.`, AD_LIMITS.description),
    clamp(`Pro ${req.audience.toLowerCase()}. Pečlivě vybraný sortiment a férové ceny.`, AD_LIMITS.description),
    clamp("Rychlé dodání, snadné vrácení a podpora, která vám poradí. Nakupujte bez starostí.", AD_LIMITS.description),
    clamp("Doprava zdarma od 999 Kč. Skladové zásoby a ověřené hodnocení zákazníků.", AD_LIMITS.description),
  ];

  const callouts = ["Doprava zdarma", "Skladem", "Férové ceny", "Rychlé dodání"].map((c) =>
    clamp(c, AD_LIMITS.callout)
  );

  const base = product.toLowerCase();
  const keywords = [
    base,
    `${base} koupit`,
    `${base} eshop`,
    `${base} cena`,
    `${base} online`,
    `${base} skladem`,
    `nejlepší ${base}`,
    `${base} recenze`,
  ];

  return {
    headlines,
    descriptions,
    callouts,
    keywords,
    longHeadline: clamp(`${product} — ${firstBenefit}, doprava zdarma od 999 Kč`, AD_LIMITS.longHeadline),
    rationale:
      "Ukázkový výstup: nadpisy kombinují produkt, hlavní benefit, důvěru a výzvu k akci, aby pokryly různé fáze rozhodování. Doplňte GEMINI_API_KEY pro generování modelem.",
  };
}
