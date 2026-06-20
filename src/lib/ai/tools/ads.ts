/** AI tool — PPC ads. Builds the prompt + JSON schema, normalizes/validates the
 *  model output and provides a deterministic demo fallback. Runs through the
 *  provider-switching LLM wrapper (../../llm). Import only from server code. */
import { Type } from "@google/genai";
import {
  AD_LIMITS,
  PLATFORM_LABELS,
  TONE_LABELS,
  type AdRequest,
  type AdResult,
  type AiResponse,
} from "../../ai-types";
import { generateStructured } from "../../llm";
import type { SupportedLocale } from "@/lib/format";
import { skillToGenerateArgs, type Skill } from "@/lib/skills/types";
import { txt, cleanList, clamp, cleanClampedList, lenViolations } from "./_shared";

const AD_SYSTEM = `Jsi zkušený český PPC specialista a copywriter v marketingové agentuře. Píšeš reklamní texty pro vyhledávací sítě (Google Ads a Sklik) v češtině.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Striktně dodržuj limity znaků: nadpisy max ${AD_LIMITS.headline} znaků, popisky max ${AD_LIMITS.description} znaků, odznaky (callouts) max ${AD_LIMITS.callout} znaků, dlouhý nadpis max ${AD_LIMITS.longHeadline} znaků. Raději buď mírně pod limitem.
- Texty musí být konkrétní a relevantní k produktu i cílové skupině. Vyhni se prázdným frázím.
- Neslibuj nepodložená tvrzení (např. „nejlepší na světě“) ani konkrétní slevy či čísla, která nebyla zadána.
- Žádné emoji, žádné zbytečné vykřičníky, nepiš celá slova velkými písmeny.
- Nadpisy ať pokrývají různé úhly: hlavní benefit, cílová skupina, výzva k akci, důvěra/kvalita, šíře sortimentu.`;

function buildAdPrompt(req: AdRequest): string {
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

const AD_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headlines: { type: Type.ARRAY, description: `8 nadpisů, každý max ${AD_LIMITS.headline} znaků`, items: { type: Type.STRING } },
    descriptions: { type: Type.ARRAY, description: `4 popisky, každý max ${AD_LIMITS.description} znaků`, items: { type: Type.STRING } },
    callouts: { type: Type.ARRAY, description: `4 odznaky, každý max ${AD_LIMITS.callout} znaků`, items: { type: Type.STRING } },
    keywords: { type: Type.ARRAY, description: "8 návrhů klíčových slov", items: { type: Type.STRING } },
    longHeadline: { type: Type.STRING, description: `Dlouhý nadpis, max ${AD_LIMITS.longHeadline} znaků` },
    rationale: { type: Type.STRING, description: "1–2 věty zdůvodnění zvolené strategie textů" },
  },
  required: ["headlines", "descriptions", "callouts", "keywords", "longHeadline", "rationale"],
  propertyOrdering: ["headlines", "descriptions", "callouts", "keywords", "longHeadline", "rationale"],
};

function normalizeAdResult(parsed: unknown): AdResult {
  const o = parsed as Partial<AdResult>;
  return {
    // Clamp to the platform limits — the guaranteed floor even if the model (or
    // the self-repair re-prompt) leaves something over-length.
    headlines: cleanClampedList(o.headlines, 10, AD_LIMITS.headline),
    descriptions: cleanClampedList(o.descriptions, 6, AD_LIMITS.description),
    callouts: cleanClampedList(o.callouts, 6, AD_LIMITS.callout),
    keywords: cleanList(o.keywords, 14),
    longHeadline: clamp(txt(o.longHeadline), AD_LIMITS.longHeadline),
    rationale: txt(o.rationale),
  };
}

/** Flag raw ad output that exceeds the Google Ads / Sklik character limits, so
 *  the wrapper can re-prompt the model to self-correct before we clamp. */
function validateAds(parsed: unknown): string[] {
  const o = parsed as Partial<AdResult> | null;
  if (!o || typeof o !== "object") return [];
  const v: string[] = [];
  v.push(...lenViolations("Nadpis", cleanList(o.headlines, 10), AD_LIMITS.headline));
  v.push(...lenViolations("Popisek", cleanList(o.descriptions, 6), AD_LIMITS.description));
  v.push(...lenViolations("Odznak", cleanList(o.callouts, 6), AD_LIMITS.callout));
  const long = txt(o.longHeadline);
  if (long.length > AD_LIMITS.longHeadline) {
    v.push(`Dlouhý nadpis má ${long.length} znaků (limit ${AD_LIMITS.longHeadline}).`);
  }
  return v;
}

function demoAds(req: AdRequest): AdResult {
  const product = req.product.trim();
  const firstBenefit = req.benefits.split(/[,.;]/)[0]?.trim() || "Ověřená kvalita";
  const cta = req.tone === "akcni" ? "Objednejte ještě dnes" : "Nakupte pohodlně online";

  return {
    headlines: [product, firstBenefit, "Skladem, ihned k odeslání", "Doprava zdarma od 999 Kč", "Kvalita, které věříte", cta, "Vybíráme s péčí", "Oblíbená volba zákazníků"].map(
      (h) => clamp(h, AD_LIMITS.headline)
    ),
    descriptions: [
      clamp(`${product} — ${firstBenefit.toLowerCase()}. Objednejte online a mějte doma za pár dní.`, AD_LIMITS.description),
      clamp(`Pro ${req.audience.toLowerCase()}. Pečlivě vybraný sortiment a férové ceny.`, AD_LIMITS.description),
      clamp("Rychlé dodání, snadné vrácení a podpora, která vám poradí. Nakupujte bez starostí.", AD_LIMITS.description),
      clamp("Doprava zdarma od 999 Kč. Skladové zásoby a ověřené hodnocení zákazníků.", AD_LIMITS.description),
    ],
    callouts: ["Doprava zdarma", "Skladem", "Férové ceny", "Rychlé dodání"].map((c) => clamp(c, AD_LIMITS.callout)),
    keywords: (() => {
      const base = product.toLowerCase();
      return [base, `${base} koupit`, `${base} eshop`, `${base} cena`, `${base} online`, `${base} skladem`, `nejlepší ${base}`, `${base} recenze`];
    })(),
    longHeadline: clamp(`${product} — ${firstBenefit}, doprava zdarma od 999 Kč`, AD_LIMITS.longHeadline),
    rationale:
      "Ukázkový výstup: nadpisy kombinují produkt, hlavní benefit, důvěru a výzvu k akci, aby pokryly různé fáze rozhodování. Připojte LLM (Claude Code v devu, Gemini v produkci) pro generování modelem.",
  };
}

/** The PPC-ads tool as a Skill SDK plugin — the reference migration that proves
 *  the chokepoint can be driven by a self-contained, gate-covered skill module.
 *  The contract (system + schema) is unchanged, so its fingerprint + golden hold. */
export const adsSkill: Skill<AdRequest, AdResult> = {
  id: "ads",
  label: "PPC inzeráty",
  category: "marketing",
  system: AD_SYSTEM,
  schema: AD_SCHEMA,
  temperature: 1.0,
  buildPrompt: buildAdPrompt,
  normalize: normalizeAdResult,
  validate: validateAds,
  demo: demoAds,
};

export function generateAds(req: AdRequest, locale?: SupportedLocale): Promise<AiResponse<AdResult>> {
  return generateStructured({
    // llm-tool: ads
    ...skillToGenerateArgs(adsSkill, req),
    locale,
  });
}
