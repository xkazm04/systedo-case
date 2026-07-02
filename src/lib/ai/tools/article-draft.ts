/** AI tool — article draft. Turns an approved SEO brief (title/meta/outline/FAQ/
 *  keywords) into a near-publishable article draft in the app's headless content
 *  model: a typed `Block[]` body + `FaqItem[]`, the exact shape the ArticleBody
 *  renderer on /clanek consumes. Runs through the provider-switching LLM wrapper
 *  (../../llm). A deterministic demo builds a minimal valid Block[] from the brief
 *  so a clean checkout renders a draft keyless. Server-only.
 *
 *  The model emits a FLAT block schema (a `type` discriminator + the optional
 *  fields each kind uses) because the CLI provider embeds the JSON schema as text
 *  and follows a flat shape far more reliably than a deep anyOf union. We then
 *  strictly normalize each raw block into a valid typed Block, dropping anything
 *  malformed — correctness over coverage. Supported kinds: p, h2, h3, ul, ol,
 *  callout, cta (a safe subset of the real Block union). */
import { Type } from "@google/genai";
import type {
  AiResponse,
  ArticleDraftRequest,
  ArticleDraftResult,
} from "../../ai-types";
import { CONTENT_TYPE_LABELS } from "../../ai-types";
import type { Block, CalloutBlock, FaqItem } from "../../article";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { txt, cleanList, slugify } from "./_shared";
import { refineLines } from "./refine";

const ARTICLE_DRAFT_SYSTEM = `Jsi český obsahový stratég a copywriter. Z hotového SEO briefu rozepisuješ plnohodnotný koncept článku připravený k publikaci.

Pravidla:
- Piš výhradně česky, gramaticky správně, s diakritikou a bez prázdných korporátních frází.
- Vyjdi z předané osnovy (H2 sekce a jejich odrážky): pro KAŽDOU sekci osnovy vytvoř nadpis (blok typu „h2") a pod ním 1–2 odstavce (bloky typu „p") plus případně seznam (blok typu „ul" nebo „ol").
- Hned na začátku napiš úvodní odstavec (perex) navazující na meta description.
- Zařaď přesně jeden blok typu „callout" (užitečný tip nebo varování) a na konci přesně jeden blok typu „cta" s pobídkou k akci.
- Klíčová slova z briefu zapracuj přirozeně do textu — žádné keyword stuffing.
- Text musí být věcný, čtivý a užitečný, ne výplň.
- Každý blok je objekt s polem „type". Podle typu vyplň:
  - „p": pole „text" (odstavec).
  - „h2" / „h3": pole „text" (nadpis sekce / podsekce).
  - „ul" / „ol": pole „items" (pole řetězců — odrážky).
  - „callout": pole „variant" („tip" | „info" | „warn"), volitelně „title", a pole „text".
  - „cta": pole „text" (pobídka), „cta" (text tlačítka); odkaz doplní aplikace.
- Odstavce drž krátké (2–4 věty). Celkem vrať nejvýše ~16 bloků — buď stručný a věcný, ne mnohomluvný.
- Vrať POUZE jeden validní JSON objekt dle schématu (pole „blocks" a „faq") — žádný text okolo, žádné markdown bloky, žádné komentáře.`;

function buildArticleDraftPrompt(req: ArticleDraftRequest): string {
  const kw = req.keywords.slice(0, 12);
  const outlineBlock = req.outline.length
    ? req.outline.flatMap((s) => [
        `## ${s.heading}`,
        ...s.points.map((p) => `  - ${p}`),
      ])
    : ["(osnova není k dispozici — vyjdi z tématu a meta description)"];
  const faqBlock = req.faq.length
    ? req.faq.map((f) => `- ${f.question}`)
    : [];
  return [
    "Rozepiš tento hotový brief do plnohodnotného konceptu článku.",
    "",
    `Titulek (H1): ${req.h1 || req.titleTag}`,
    `Title tag: ${req.titleTag}`,
    `Meta description: ${req.metaDescription}`,
    req.audience ? `Cílová skupina: ${req.audience}` : "",
    req.contentType ? `Typ obsahu: ${CONTENT_TYPE_LABELS[req.contentType]}` : "",
    "",
    "Osnova, kterou článek dodrží (každý nadpis = jedna sekce H2):",
    ...outlineBlock,
    "",
    kw.length ? `Klíčová slova k přirozenému zapracování: ${kw.join(", ")}` : "",
    faqBlock.length ? "" : "",
    faqBlock.length ? "Časté dotazy, které článek zodpoví (vrať je v poli „faq“):" : "",
    ...faqBlock,
    "",
    'Vrať objekt s polem „blocks" (tělo článku jako sekvence bloků) a polem „faq" (otázka + odpověď).',
    "Pořadí bloků: úvodní odstavec, pak pro každou sekci osnovy nadpis h2 + odstavce/seznam, jeden callout a na konci jeden cta.",
    ...refineLines(req.refine),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

// Flat block schema: a `type` discriminator plus every optional field any
// supported kind uses. The model fills only the fields its `type` needs; we
// strictly map each raw block into a valid typed Block in normalize().
const ARTICLE_DRAFT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    blocks: {
      type: Type.ARRAY,
      description: "Tělo článku jako sekvence typovaných bloků",
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: "p | h2 | h3 | ul | ol | callout | cta",
          },
          text: { type: Type.STRING, description: "Text odstavce / nadpisu / calloutu / pobídky" },
          items: {
            type: Type.ARRAY,
            description: "Položky seznamu (jen pro ul / ol)",
            items: { type: Type.STRING },
          },
          variant: { type: Type.STRING, description: "tip | info | warn (jen pro callout)" },
          title: { type: Type.STRING, description: "Volitelný nadpis calloutu" },
          cta: { type: Type.STRING, description: "Text tlačítka (jen pro cta)" },
        },
        required: ["type"],
        propertyOrdering: ["type", "text", "items", "variant", "title", "cta"],
      },
    },
    faq: {
      type: Type.ARRAY,
      description: "Časté dotazy a odpovědi",
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          answer: { type: Type.STRING },
        },
        required: ["question", "answer"],
        propertyOrdering: ["question", "answer"],
      },
    },
  },
  required: ["blocks", "faq"],
  propertyOrdering: ["blocks", "faq"],
};

const CALLOUT_VARIANTS: ReadonlySet<CalloutBlock["variant"]> = new Set(["tip", "info", "warn"]);

/** Slug-safe id for an H2/H3 anchor, falling back to a positional id so the
 *  table-of-contents + deep links always resolve. */
function headingId(text: string, index: number): string {
  return slugify(text) || `sekce-${index + 1}`;
}

/** Strictly map one raw model block into a valid typed Block, or null to drop it.
 *  Inlines are kept as plain strings — the simplest valid Inline — so the output
 *  always satisfies the real Block union without inventing link/bold nodes. */
function toBlock(raw: unknown, index: number): Block | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = txt(o.type).toLowerCase();
  switch (type) {
    case "p": {
      const text = txt(o.text);
      return text ? { type: "p", content: [text] } : null;
    }
    case "h2":
    case "h3": {
      const text = txt(o.text);
      return text ? { type, id: headingId(text, index), text } : null;
    }
    case "ul":
    case "ol": {
      const items = cleanList(o.items, 12).map((s) => [s]);
      return items.length ? { type, items } : null;
    }
    case "callout": {
      const text = txt(o.text);
      if (!text) return null;
      const variant = txt(o.variant).toLowerCase() as CalloutBlock["variant"];
      const block: CalloutBlock = {
        type: "callout",
        variant: CALLOUT_VARIANTS.has(variant) ? variant : "tip",
        content: [text],
      };
      const title = txt(o.title);
      if (title) block.title = title;
      return block;
    }
    case "cta": {
      const text = txt(o.text);
      const cta = txt(o.cta) || "Zjistit více";
      return text ? { type: "cta", text, href: "/cena", kind: "internal", cta } : null;
    }
    default:
      return null;
  }
}

function normalizeFaq(parsed: unknown): FaqItem[] {
  return Array.isArray(parsed)
    ? parsed
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ q: txt(x.question), a: [txt(x.answer)] as FaqItem["a"] }))
        .filter((x) => x.q && txt(x.a[0]))
        .slice(0, 8)
    : [];
}

/** Deterministic draft from the brief alone — the keyless demo and the floor when
 *  the model returns nothing usable. Builds a minimal but valid Block[]. */
function demoArticleDraft(req: ArticleDraftRequest): ArticleDraftResult {
  const blocks: Block[] = [];
  blocks.push({
    type: "p",
    content: [
      req.metaDescription ||
        `Tento koncept článku „${req.h1 || req.titleTag}“ vychází ze schváleného briefu. Po připojení LLM (Claude v devu, Gemini v produkci) model osnovu rozepíše do plného textu.`,
    ],
  });
  req.outline.forEach((section, i) => {
    blocks.push({ type: "h2", id: headingId(section.heading, i), text: section.heading });
    blocks.push({
      type: "p",
      content: [
        `Sekce „${section.heading}“ z osnovy briefu — připravená k rozepsání.`,
      ],
    });
    if (section.points.length) {
      blocks.push({ type: "ul", items: section.points.slice(0, 12).map((p) => [p]) });
    }
  });
  blocks.push({
    type: "callout",
    variant: "tip",
    title: "Ukázkový koncept",
    content: [
      "Toto je deterministický náhled konceptu sestavený z briefu. Plnou verzi od modelu získáte po připojení LLM.",
    ],
  });
  blocks.push({
    type: "cta",
    text: "Chcete obsah na míru? Připravíme strategii i texty.",
    href: "/cena",
    kind: "internal",
    cta: "Zobrazit ceník",
  });

  const faq: FaqItem[] = req.faq.length
    ? req.faq.slice(0, 8).map((f) => ({ q: f.question, a: [f.answer] as FaqItem["a"] }))
    : [{ q: `Co se v článku „${req.h1 || req.titleTag}“ dozvím?`, a: ["Doplní AI po nastavení LLM."] as FaqItem["a"] }];

  return { blocks, faq };
}

/** Flag a draft with no usable body blocks so the wrapper can re-prompt once. */
function validateArticleDraft(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o) return [];
  const raw = Array.isArray(o.blocks) ? o.blocks : [];
  const valid = raw.map((b, i) => toBlock(b, i)).filter((b): b is Block => b !== null);
  if (valid.length === 0) {
    return ["Návrh neobsahuje žádný platný blok textu — vrať tělo článku jako pole „blocks“."];
  }
  return [];
}

export function generateArticleDraft(
  req: ArticleDraftRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<ArticleDraftResult>> {
  const fallback = (): ArticleDraftResult => demoArticleDraft(req);

  const normalize = (parsed: unknown): ArticleDraftResult => {
    const o = parsed as Record<string, unknown> | null;
    const raw = Array.isArray(o?.blocks) ? o.blocks : [];
    const blocks = raw
      .map((b, i) => toBlock(b, i))
      .filter((b): b is Block => b !== null);
    const faq = normalizeFaq(o?.faq);
    const demo = fallback();
    return {
      blocks: blocks.length ? blocks : demo.blocks,
      faq: faq.length ? faq : demo.faq,
    };
  };

  return generateStructured({
    // llm-tool: article-draft
    id: "article-draft",
    prompt: buildArticleDraftPrompt(req),
    system: ARTICLE_DRAFT_SYSTEM,
    schema: ARTICLE_DRAFT_SCHEMA,
    temperature: 0.8,
    normalize,
    validate: validateArticleDraft,
    demo: fallback,
    locale,
    signal,
  });
}
