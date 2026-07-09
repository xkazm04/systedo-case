/** AI tool — organic (zero ad-spend) channel research. From a project's business
 *  context (type, brand, offering, localities, competitors, seed keywords) it
 *  returns a RANKED plan of free visibility channels — directories, marketplaces,
 *  communities, owned content, PR, partnerships — each with a fit score (0–100),
 *  an effort level, why it fits THIS business and 2–4 concrete first actions. This
 *  is the "where can I get seen for free" counterpart to the paid Campaigns module.
 *
 *  Grounded strictly in the supplied context: the model must not invent competitor
 *  facts or metrics; it reasons about channels from the business type + offering.
 *  normalize() slugifies each channel name into a stable id, clamps fit, coerces
 *  the category/effort to known sets and caps the arrays; a deterministic demo()
 *  builds a curated per-type plan from the shared catalog so the keyless path (and
 *  the floor when the model returns nothing usable) is still a real, useful plan.
 *  Runs through the provider-switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  ChannelResearchRequest,
  ChannelResearchResult,
} from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import type { ProjectType } from "@/lib/projects/types";
import {
  CHANNEL_CATEGORIES,
  type ChannelCategory,
  type ChannelEffort,
  type OrganicChannel,
} from "@/lib/organic-channels/types";
import { baseChannelPlan } from "@/lib/organic-channels/sample";
import { generateStructured } from "../../llm";
import { cleanList, slugify, txt } from "./_shared";
import { refineLines } from "./refine";

const CHANNEL_RESEARCH_SYSTEM = `Jsi český stratég pro organickou (bezplatnou) viditelnost. Firmě sestavuješ plán kanálů, kde se může zviditelnit ZDARMA — bez rozpočtu na reklamu (placené PPC řeší jiný modul).

Uvažuj o těchto typech kanálů:
- katalogy a zápisy (Google Business Profile, Firmy.cz, Mapy.cz, oborové katalogy),
- porovnávače / marketplace se zdarma výpisem (Zboží.cz, Heureka),
- komunity (Facebook skupiny, Reddit, oborová fóra, Product Hunt),
- vlastní obsah (SEO/blog, YouTube, newsletter),
- organické sociální sítě,
- PR a hostování (podcasty, hostující články, reference),
- partnerství a spolupráce (tvůrci, okolní/nekonkurenční podniky).

Pravidla:
- Doporuč 6–9 KONKRÉTNÍCH kanálů vhodných přesně pro tuto firmu a její typ. Preferuj kanály relevantní na českém trhu.
- Vycházej VÝHRADNĚ z předaného kontextu (typ podnikání, značka, nabídka, lokality, konkurence, klíčová slova). Nevymýšlej si čísla ani fakta o konkurenci.
- Každý kanál musí být bezplatný na vstup (žádné placené PPC/nákup médií).
- Pro každý kanál vrať: „name" (název kanálu), „category" (jedna z: ${CHANNEL_CATEGORIES.join(" | ")}), „fit" (0–100, jak dobře sedí této firmě), „effort" (low | medium | high), „rationale" (jednou větou proč sedí PRÁVĚ této firmě), „payoff" (co konkrétně přinese) a „firstActions" (2–4 konkrétní první kroky).
- Seřaď kanály od nejvyššího „fit" po nejnižší. Nedávej dva stejné kanály.
- Volitelně u kanálu vrať „url" (kam se zapsat) a „contentAngle" (námět příspěvku k předání do tvorby obsahu).
- Vrať i „summary": jednu větu, kde má firma největší bezplatnou příležitost.
- Piš česky, věcně, bez marketingových frází, a vracej POUZE jeden validní JSON objekt dle schématu — žádný text okolo.`;

/** Czech framing per project type, so the prompt speaks the business's language. */
const TYPE_FRAMING: Record<ProjectType, string> = {
  eshop: "e-shop (prodej fyzického zboží)",
  app: "digitální produkt / SaaS aplikace",
  leadgen: "generování poptávek (leadgen) pro služby",
  content: "obsahový web / publisher",
  local: "lokální podnik / služby s provozovnou",
};

const KNOWN_TYPES = new Set<string>(["eshop", "app", "leadgen", "content", "local"]);

/** Resolve the request's project type to a known ProjectType, defaulting to eshop
 *  (the broadest channel mix) when the caller sends something unexpected. */
function resolveType(v: string): ProjectType {
  return (KNOWN_TYPES.has(v) ? v : "eshop") as ProjectType;
}

function buildChannelResearchPrompt(req: ChannelResearchRequest): string {
  const type = resolveType(req.projectType);
  const lines = [
    "Sestav plán bezplatných (organických) kanálů viditelnosti pro tuto firmu.",
    "",
    `Typ podnikání: ${TYPE_FRAMING[type]}`,
    `Značka / firma: ${req.brand}`,
  ];
  if (req.offering) lines.push(`Nabídka: ${req.offering}`);
  if (req.localities && req.localities.length > 0) {
    lines.push(`Lokality: ${req.localities.join(", ")}`);
  }
  if (req.competitors && req.competitors.length > 0) {
    lines.push(`Konkurence (jen pro rámec, nevymýšlej si o ní čísla): ${req.competitors.join(", ")}`);
  }
  if (req.keywords && req.keywords.length > 0) {
    lines.push(`Klíčová slova, která publikum hledá: ${req.keywords.join(", ")}`);
  }
  lines.push(
    "",
    `Vrať „summary" (jedna věta o největší bezplatné příležitosti) a „channels" — 6–9 kanálů seřazených podle „fit" sestupně, každý s poli name, category, fit, effort, rationale, payoff, firstActions (volitelně url, contentAngle).`
  );
  lines.push(...refineLines(req.refine));
  return lines.filter((l) => l !== "").join("\n");
}

const CHANNEL_RESEARCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Jedna věta o největší bezplatné příležitosti firmy",
    },
    channels: {
      type: Type.ARRAY,
      description: "Bezplatné kanály viditelnosti, seřazené podle fit sestupně",
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Název kanálu" },
          category: {
            type: Type.STRING,
            description: `Kategorie kanálu, jedna z: ${CHANNEL_CATEGORIES.join(" | ")}`,
          },
          fit: { type: Type.NUMBER, description: "Vhodnost pro tuto firmu, 0–100" },
          effort: { type: Type.STRING, description: "Náročnost: low | medium | high" },
          rationale: { type: Type.STRING, description: "Proč kanál sedí právě této firmě" },
          payoff: { type: Type.STRING, description: "Co konkrétně kanál přinese" },
          firstActions: {
            type: Type.ARRAY,
            description: "2–4 konkrétní první kroky",
            items: { type: Type.STRING },
          },
          url: { type: Type.STRING, description: "Kam se zapsat (volitelné)" },
          contentAngle: {
            type: Type.STRING,
            description: "Námět příspěvku k předání do tvorby obsahu (volitelné)",
          },
        },
        required: ["name", "category", "fit", "effort", "rationale", "payoff", "firstActions"],
        propertyOrdering: [
          "name",
          "category",
          "fit",
          "effort",
          "rationale",
          "payoff",
          "firstActions",
          "url",
          "contentAngle",
        ],
      },
    },
  },
  required: ["summary", "channels"],
  propertyOrdering: ["summary", "channels"],
};

const CATEGORY_SET = new Set<string>(CHANNEL_CATEGORIES);
const EFFORT_SET = new Set<string>(["low", "medium", "high"]);

const coerceCategory = (v: unknown): ChannelCategory => {
  const c = txt(v).toLowerCase();
  return (CATEGORY_SET.has(c) ? c : "content") as ChannelCategory;
};

const coerceEffort = (v: unknown): ChannelEffort => {
  const e = txt(v).toLowerCase();
  return (EFFORT_SET.has(e) ? e : "medium") as ChannelEffort;
};

const clampFit = (v: unknown): number => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 60;
  return Math.max(0, Math.min(100, n));
};

/** The curated per-type plan, grounded in the request context — the keyless demo
 *  and the floor when the model returns nothing usable. Deterministic off the brand. */
export function demoChannelResearch(req: ChannelResearchRequest): ChannelResearchResult {
  const type = resolveType(req.projectType);
  const channels = baseChannelPlan(
    type,
    {
      brand: req.brand,
      category: req.offering,
      locality: req.localities?.[0],
    },
    req.brand
  );
  return {
    summary: `Ukázkový plán bezplatných kanálů pro ${req.brand}. Připojte LLM (Claude v devu, Gemini v produkci) pro plán na míru.`,
    channels,
  };
}

/** Map the raw model output into a validated, ranked plan: slugify names into
 *  stable ids (deduped), clamp fit, coerce category/effort to known sets, and cap
 *  the arrays. Falls back to the curated demo when nothing usable survives. */
function normalizeChannelResearch(
  parsed: unknown,
  req: ChannelResearchRequest
): ChannelResearchResult {
  const o = parsed as Record<string, unknown> | null;
  const raw = Array.isArray(o?.channels) ? o.channels : [];
  const seen = new Set<string>();
  const channels: OrganicChannel[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const name = txt(x.name);
    if (!name) continue;
    const id = slugify(name) || `kanal-${channels.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const firstActions = cleanList(x.firstActions, 4);
    const channel: OrganicChannel = {
      id,
      name,
      category: coerceCategory(x.category),
      fit: clampFit(x.fit),
      effort: coerceEffort(x.effort),
      rationale: txt(x.rationale),
      payoff: txt(x.payoff),
      firstActions: firstActions.length > 0 ? firstActions : ["Založte a vyplňte profil."],
    };
    const url = txt(x.url);
    if (url) channel.url = url.slice(0, 300);
    const contentAngle = txt(x.contentAngle);
    if (contentAngle) channel.contentAngle = contentAngle;
    channels.push(channel);
  }

  if (channels.length === 0) return demoChannelResearch(req);
  channels.sort((a, b) => b.fit - a.fit);
  return { summary: txt(o?.summary) || demoChannelResearch(req).summary, channels };
}

/** Flag an empty / hollow plan so the wrapper re-prompts once: the plan needs at
 *  least a couple of named channels, each with a rationale. */
function validateChannelResearch(parsed: unknown): string[] {
  const o = parsed as Record<string, unknown> | null;
  if (!o || typeof o !== "object") return [];
  const raw = Array.isArray(o.channels) ? o.channels : [];
  const named = raw.filter((c) => c && typeof c === "object" && txt((c as Record<string, unknown>).name));
  if (named.length < 3) {
    return [`Plán má málo kanálů — vrať alespoň 3 konkrétní bezplatné kanály v poli „channels".`];
  }
  return [];
}

export function generateChannelResearch(
  req: ChannelResearchRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<ChannelResearchResult>> {
  return generateStructured({
    // llm-tool: channel-research
    id: "channel-research",
    prompt: buildChannelResearchPrompt(req),
    system: CHANNEL_RESEARCH_SYSTEM,
    schema: CHANNEL_RESEARCH_SCHEMA,
    temperature: 0.6,
    normalize: (parsed) => normalizeChannelResearch(parsed, req),
    validate: (parsed) => validateChannelResearch(parsed),
    demo: () => demoChannelResearch(req),
    locale,
    signal,
  });
}
