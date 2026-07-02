/** AI tool — SEO content brief. Builds the prompt + JSON schema, normalizes/
 *  validates the model output and provides a deterministic demo fallback. Runs
 *  through the provider-switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import {
  SEO_LIMITS,
  CONTENT_TYPE_LABELS,
  type AiResponse,
  type BriefRequest,
  type BriefResult,
} from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { txt, cleanList, clamp, cap, slugify } from "./_shared";
import { refineLines } from "./refine";

const BRIEF_SYSTEM = `Jsi český SEO a obsahový stratég v marketingové agentuře. Připravuješ zadání (brief) pro tvorbu obsahu na web a e-shop.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Title tag max ${SEO_LIMITS.titleTag} znaků, meta description max ${SEO_LIMITS.metaDescription} znaků (raději mírně pod limitem).
- Hlavní klíčové slovo (přesně v zadaném znění) musí přirozeně zaznít na třech místech: v title tagu, v meta description a v nadpisu PRVNÍ H2 sekce osnovy. Stačí jednou na každém místě — žádný keyword stuffing.
- slug: malá písmena bez diakritiky, slova spojená pomlčkou, krátký a výstižný.
- Osnova (outline) ať má logickou strukturu H2 sekcí s konkrétními odrážkami, co v sekci zaznít.
- FAQ ať jsou reálné dotazy, které uživatelé hledají.
- Žádné keyword stuffing, žádné prázdné fráze. Obsah musí být užitečný a věcný.
- Drž se zadaného JSON schématu.`;

function buildBriefPrompt(req: BriefRequest): string {
  const kw = (req.keywords ?? []).slice(0, 12);
  const keywordBlock = kw.length
    ? [
        "",
        "Reálná data z Keyword Planneru (měsíční hledanost a konkurence) — vycházej z nich:",
        ...kw.map(
          (k) => `- ${k.keyword}: ${k.volume}/měs, konkurence ${k.competition}`
        ),
        "Upřednostni v osnově a klíčových slovech témata s vysokou hledaností a nižší konkurencí.",
      ]
    : [];
  return [
    "Připrav SEO obsahový brief pro tuto stránku.",
    "",
    `Typ obsahu: ${CONTENT_TYPE_LABELS[req.contentType]}`,
    `Téma: ${req.topic}`,
    `Hlavní klíčové slovo: ${req.primaryKeyword}`,
    `Cílová skupina: ${req.audience}`,
    ...keywordBlock,
    "",
    "Vygeneruj:",
    `- title tag (max ${SEO_LIMITS.titleTag} znaků) obsahující hlavní klíčové slovo,`,
    `- meta description (max ${SEO_LIMITS.metaDescription} znaků) obsahující hlavní klíčové slovo,`,
    "- H1 nadpis a URL slug,",
    "- osnovu 5–7 sekcí (H2) s odrážkami; nadpis první sekce ať obsahuje hlavní klíčové slovo,",
    "- 4 časté dotazy s odpověďmi (FAQ),",
    "- 8 souvisejících klíčových slov,",
    "- 4 návrhy kotevního textu pro interní odkazy,",
    "- krátké zdůvodnění (rationale).",
    // Refine note (re-run steering) rides on the USER prompt only — the system
    // prompt + schema stay byte-identical, so the gate/golden fingerprint holds.
    ...refineLines(req.refine),
  ].join("\n");
}

const BRIEF_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    titleTag: { type: Type.STRING, description: `SEO title, max ${SEO_LIMITS.titleTag} znaků` },
    metaDescription: { type: Type.STRING, description: `Meta description, max ${SEO_LIMITS.metaDescription} znaků` },
    h1: { type: Type.STRING, description: "Hlavní nadpis stránky" },
    slug: { type: Type.STRING, description: "URL slug, malá písmena, bez diakritiky, slova spojená pomlčkou" },
    outline: {
      type: Type.ARRAY,
      description: "5–7 sekcí H2 s odrážkami",
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING },
          points: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["heading", "points"],
        propertyOrdering: ["heading", "points"],
      },
    },
    faq: {
      type: Type.ARRAY,
      description: "4 dotazy a odpovědi",
      items: {
        type: Type.OBJECT,
        properties: { question: { type: Type.STRING }, answer: { type: Type.STRING } },
        required: ["question", "answer"],
        propertyOrdering: ["question", "answer"],
      },
    },
    keywords: { type: Type.ARRAY, description: "8 souvisejících klíčových slov", items: { type: Type.STRING } },
    internalLinks: { type: Type.ARRAY, description: "4 návrhy kotevního textu", items: { type: Type.STRING } },
    rationale: { type: Type.STRING, description: "1–2 věty zdůvodnění" },
  },
  required: ["titleTag", "metaDescription", "h1", "slug", "outline", "faq", "keywords", "internalLinks", "rationale"],
  propertyOrdering: ["titleTag", "metaDescription", "h1", "slug", "outline", "faq", "keywords", "internalLinks", "rationale"],
};

function normalizeBriefResult(parsed: unknown): BriefResult {
  const o = parsed as Record<string, unknown>;
  const outline = Array.isArray(o.outline)
    ? o.outline
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ heading: txt(x.heading), points: cleanList(x.points, 8) }))
        .filter((x) => x.heading)
        .slice(0, 8)
    : [];
  const faq = Array.isArray(o.faq)
    ? o.faq
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ question: txt(x.question), answer: txt(x.answer) }))
        .filter((x) => x.question)
        .slice(0, 8)
    : [];
  return {
    // Clamp the SEO fields to their best-practice limits (guaranteed floor).
    titleTag: clamp(txt(o.titleTag), SEO_LIMITS.titleTag),
    metaDescription: clamp(txt(o.metaDescription), SEO_LIMITS.metaDescription),
    h1: txt(o.h1),
    slug: txt(o.slug),
    outline,
    faq,
    keywords: cleanList(o.keywords, 12),
    internalLinks: cleanList(o.internalLinks, 8),
    rationale: txt(o.rationale),
  };
}

/** Flag raw brief output whose title tag / meta description exceed the SEO
 *  limits, so the wrapper can re-prompt before we clamp. */
function validateBrief(parsed: unknown): string[] {
  const o = parsed as Partial<BriefResult> | null;
  if (!o || typeof o !== "object") return [];
  const v: string[] = [];
  const tt = txt(o.titleTag);
  if (tt.length > SEO_LIMITS.titleTag) {
    v.push(`Title tag má ${tt.length} znaků (limit ${SEO_LIMITS.titleTag}).`);
  }
  const md = txt(o.metaDescription);
  if (md.length > SEO_LIMITS.metaDescription) {
    v.push(`Meta description má ${md.length} znaků (limit ${SEO_LIMITS.metaDescription}).`);
  }
  return v;
}

function demoBrief(req: BriefRequest): BriefResult {
  const topic = req.topic.trim();
  const kw = req.primaryKeyword.trim();
  const aud = req.audience.trim().toLowerCase();
  return {
    titleTag: clamp(`${cap(topic)} | Mionelo`, SEO_LIMITS.titleTag),
    metaDescription: clamp(
      `${cap(topic)}: praktické tipy a doporučení pro ${aud}. Přehledný průvodce krok za krokem.`,
      SEO_LIMITS.metaDescription
    ),
    h1: cap(topic),
    slug: slugify(kw || topic),
    outline: [
      { heading: `Proč na tématu „${topic}“ záleží`, points: ["Hlavní přínosy", "Pro koho je obsah určený"] },
      { heading: "Na co se zaměřit", points: ["Klíčová kritéria výběru", "Časté chyby"] },
      { heading: "Praktické tipy krok za krokem", points: ["Doporučený postup", "Tipy do praxe"] },
      { heading: "Doporučené produkty", points: ["Tipy z nabídky", "Na co se zaměřit"] },
      { heading: "Časté dotazy", points: ["Odpovědi na nejčastější otázky"] },
    ],
    faq: [
      { question: `Co je u tématu „${topic}“ nejdůležitější?`, answer: "Doplní AI po nastavení GEMINI_API_KEY." },
      { question: "Pro koho se obsah hodí?", answer: `Zejména pro ${aud}.` },
      { question: "Jak často téma řešit?", answer: "Záleží na potřebách čtenáře — brief slouží jako kostra." },
    ],
    keywords: [kw, `${kw} tipy`, `${kw} návod`, `jak na ${kw}`, `${kw} doporučení`].filter(Boolean),
    internalLinks: ["Související kategorie", "Doporučené produkty", "Další články na blogu", "Bestsellery"],
    rationale:
      "Ukázkový brief: title a meta v SEO limitech, osnova H2 a FAQ. Připojte LLM (Claude Code v devu, Gemini v produkci) pro plnou verzi od modelu.",
  };
}

export function generateBrief(
  req: BriefRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<BriefResult>> {
  return generateStructured({
    // llm-tool: brief
    id: "brief",
    prompt: buildBriefPrompt(req),
    system: BRIEF_SYSTEM,
    schema: BRIEF_SCHEMA,
    temperature: 0.9,
    normalize: normalizeBriefResult,
    validate: validateBrief,
    demo: () => demoBrief(req),
    locale,
    signal,
  });
}
