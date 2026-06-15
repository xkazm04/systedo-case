/** Server-only AI tools layer. Defines the app's structured-generation tools
 *  (PPC ads, SEO brief, performance analysis, campaign/portfolio evaluation) and
 *  runs them all through the provider-switching LLM wrapper (./llm):
 *  Claude Code CLI in development, Gemini in production.
 *
 *  Each tool:
 *   - Structured output: passes a JSON schema so the model returns validated,
 *     typed data — never free text we parse heuristically.
 *   - Graceful fallback: a deterministic demo when no provider is available,
 *     clearly flagged, so the whole app works straight from the repo.
 *
 *  Every model call goes through `generateStructured` — the single chokepoint.
 *  Import only from server code (the route handlers).
 */
import { Type } from "@google/genai";
import {
  AD_LIMITS,
  PLATFORM_LABELS,
  SEO_LIMITS,
  TONE_LABELS,
  CONTENT_TYPE_LABELS,
  type AdRequest,
  type AdResult,
  type AiResponse,
  type AnalysisRequest,
  type AnalysisResult,
  type BriefRequest,
  type BriefResult,
  type CampaignReportResult,
  type EvalPriority,
  type EvalRecommendation,
  type EvalScope,
} from "./ai-types";
import { buildSnapshot, snapshotToPromptText, type Snapshot } from "./snapshot";
import {
  CAMPAIGN_TYPE_LABELS,
  TARGET_PNO,
  TARGET_ROAS,
  aggregate,
  groupByType,
  withMetrics,
  type Campaign,
  type CampaignPeriod,
} from "./campaigns/types";
import { buildCampaignPrompt, buildOverallPrompt } from "./campaigns/report-input";
import { fmtCZK, fmtInt, fmtMultiple, fmtPct, fmtSignedPct } from "./format";
import { generateStructured } from "./llm";

// --- shared helpers ---------------------------------------------------------

const txt = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

const cleanList = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, max)
    : [];

const clamp = (s: string, n: number): string =>
  s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…";

/** Like cleanList, but also clamps each item to a max character length so the
 *  server never emits over-limit ad copy that Google Ads / Sklik would reject. */
const cleanClampedList = (v: unknown, maxCount: number, maxLen: number): string[] =>
  cleanList(v, maxCount).map((s) => clamp(s, maxLen));

/** Collect char-limit violations for a list of strings (used for self-repair). */
const lenViolations = (label: string, items: string[], max: number): string[] =>
  items
    .map((s, i) => (s.length > max ? `${label} #${i + 1} má ${s.length} znaků (limit ${max}).` : null))
    .filter((v): v is string => v !== null);

const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

// Diacritics -> ASCII for slugs, keyed by numeric code point. An explicit map is
// dependency-free and predictable (no String.normalize or locale assumptions).
const DIACRITICS: Record<number, string> = {
  0x00e1: "a", 0x00e0: "a", 0x00e2: "a", 0x00e4: "a", 0x010d: "c", 0x0107: "c",
  0x00e7: "c", 0x010f: "d", 0x00e9: "e", 0x011b: "e", 0x00e8: "e", 0x00ea: "e",
  0x00eb: "e", 0x00ed: "i", 0x00ef: "i", 0x00ee: "i", 0x013a: "l", 0x013e: "l",
  0x0142: "l", 0x0148: "n", 0x00f1: "n", 0x00f3: "o", 0x00f4: "o", 0x00f6: "o",
  0x00f8: "o", 0x0159: "r", 0x0155: "r", 0x0161: "s", 0x015b: "s", 0x0165: "t",
  0x00fa: "u", 0x016f: "u", 0x00fc: "u", 0x00fb: "u", 0x00fd: "y", 0x00ff: "y",
  0x017e: "z", 0x017a: "z", 0x017c: "z",
};

const slugify = (s: string): string =>
  Array.from(s.toLowerCase())
    .map((ch) => DIACRITICS[ch.codePointAt(0) ?? 0] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// ===========================================================================
// Tool 1 — PPC ads
// ===========================================================================

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

export function generateAds(req: AdRequest): Promise<AiResponse<AdResult>> {
  return generateStructured({
    // llm-tool: ads
    prompt: buildAdPrompt(req),
    system: AD_SYSTEM,
    schema: AD_SCHEMA,
    temperature: 1.0,
    normalize: normalizeAdResult,
    validate: validateAds,
    demo: () => demoAds(req),
  });
}

// ===========================================================================
// Tool 2 — SEO content brief
// ===========================================================================

const BRIEF_SYSTEM = `Jsi český SEO a obsahový stratég v marketingové agentuře. Připravuješ zadání (brief) pro tvorbu obsahu na web a e-shop.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Title tag max ${SEO_LIMITS.titleTag} znaků, meta description max ${SEO_LIMITS.metaDescription} znaků (raději mírně pod limitem). Obojí ať obsahuje hlavní klíčové slovo přirozeně.
- slug: malá písmena bez diakritiky, slova spojená pomlčkou, krátký a výstižný.
- Osnova (outline) ať má logickou strukturu H2 sekcí s konkrétními odrážkami, co v sekci zaznít.
- FAQ ať jsou reálné dotazy, které uživatelé hledají.
- Žádné keyword stuffing, žádné prázdné fráze. Obsah musí být užitečný a věcný.
- Drž se zadaného JSON schématu.`;

function buildBriefPrompt(req: BriefRequest): string {
  return [
    "Připrav SEO obsahový brief pro tuto stránku.",
    "",
    `Typ obsahu: ${CONTENT_TYPE_LABELS[req.contentType]}`,
    `Téma: ${req.topic}`,
    `Hlavní klíčové slovo: ${req.primaryKeyword}`,
    `Cílová skupina: ${req.audience}`,
    "",
    "Vygeneruj:",
    `- title tag (max ${SEO_LIMITS.titleTag} znaků),`,
    `- meta description (max ${SEO_LIMITS.metaDescription} znaků),`,
    "- H1 nadpis a URL slug,",
    "- osnovu 5–7 sekcí (H2) s odrážkami,",
    "- 4 časté dotazy s odpověďmi (FAQ),",
    "- 8 souvisejících klíčových slov,",
    "- 4 návrhy kotevního textu pro interní odkazy,",
    "- krátké zdůvodnění (rationale).",
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

export function generateBrief(req: BriefRequest): Promise<AiResponse<BriefResult>> {
  return generateStructured({
    // llm-tool: brief
    prompt: buildBriefPrompt(req),
    system: BRIEF_SYSTEM,
    schema: BRIEF_SCHEMA,
    temperature: 0.9,
    normalize: normalizeBriefResult,
    validate: validateBrief,
    demo: () => demoBrief(req),
  });
}

// ===========================================================================
// Tool 3 — performance analysis (grounded in the dataset)
// ===========================================================================

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

export function generateAnalysis(req: AnalysisRequest): Promise<AiResponse<AnalysisResult>> {
  const snapshot = buildSnapshot(req.period);
  return generateStructured({
    // llm-tool: analysis
    prompt: buildAnalysisPrompt(snapshotToPromptText(snapshot)),
    system: ANALYSIS_SYSTEM,
    schema: ANALYSIS_SCHEMA,
    temperature: 0.7,
    normalize: normalizeAnalysisResult,
    demo: () => demoAnalysis(snapshot),
  });
}

// ===========================================================================
// Tool 4 — campaign / portfolio evaluation (grounded in synced Google Ads data)
// ===========================================================================

const EVAL_SYSTEM = `Jsi zkušený český PPC stratég a specialista na Google Ads v marketingové agentuře. Vyhodnocuješ výkon reklamních kampaní a připravuješ klientovi stručný hodnoticí report s konkrétními dalšími kroky.

Pravidla:
- Vycházej VÝHRADNĚ z předaných čísel. Nevymýšlej si žádné metriky ani hodnoty, které v datech nejsou.
- Skóre 0–100 vyjadřuje zdraví kampaně/portfolia vůči cílovému PNO a vůči ostatním kampaním: ~80+ výborné, ~60–79 solidní, ~40–59 průměrné s rezervami, pod 40 podvýkonné.
- Doporučení musí být akční a konkrétní (navýšit/snížit rozpočet, upravit nabídky, vyloučení, cílení, kreativu, utlumit či pozastavit) a seřazená podle priority (high/medium/low).
- Odkazuj se na konkrétní čísla (ROAS, PNO, CPA, podíl na nákladech).
- Piš česky, věcně, bez marketingových frází. Drž se zadaného JSON schématu.`;

const EVAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    verdict: { type: Type.STRING, description: "Jednovětý verdikt o výkonu" },
    score: { type: Type.NUMBER, description: "Skóre zdraví 0–100" },
    summary: { type: Type.STRING, description: "Jeden odstavec shrnutí" },
    strengths: { type: Type.ARRAY, description: "2–4 silné stránky", items: { type: Type.STRING } },
    weaknesses: { type: Type.ARRAY, description: "1–4 slabiny nebo rizika", items: { type: Type.STRING } },
    recommendations: {
      type: Type.ARRAY,
      description: "2–5 konkrétních doporučených kroků s prioritou",
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          detail: { type: Type.STRING },
          priority: { type: Type.STRING, description: "Priorita: high, medium nebo low" },
        },
        required: ["title", "detail", "priority"],
        propertyOrdering: ["title", "detail", "priority"],
      },
    },
  },
  required: ["verdict", "score", "summary", "strengths", "weaknesses", "recommendations"],
  propertyOrdering: ["verdict", "score", "summary", "strengths", "weaknesses", "recommendations"],
};

function normalizePriority(v: unknown): EvalPriority {
  const s = txt(v).toLowerCase();
  return s === "high" || s === "low" ? s : "medium";
}

function normalizeReport(parsed: unknown): CampaignReportResult {
  const o = parsed as Record<string, unknown>;
  const recommendations: EvalRecommendation[] = Array.isArray(o.recommendations)
    ? o.recommendations
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({ title: txt(x.title), detail: txt(x.detail), priority: normalizePriority(x.priority) }))
        .filter((x) => x.title)
        .slice(0, 6)
    : [];
  const raw = typeof o.score === "number" ? o.score : Number(o.score);
  const score = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : 0;
  return {
    verdict: txt(o.verdict),
    score,
    summary: txt(o.summary),
    strengths: cleanList(o.strengths, 6),
    weaknesses: cleanList(o.weaknesses, 6),
    recommendations,
  };
}

/** Map ROAS to a 0–100 health score relative to the target — shared by the demo
 *  fallbacks so a keyless run still produces a believable, data-driven number. */
function healthScore(roas: number): number {
  if (roas <= 0) return 5;
  return Math.max(5, Math.min(99, Math.round(40 + (roas / TARGET_ROAS - 1) * 40)));
}

function demoCampaignReport(target: Campaign, all: Campaign[]): CampaignReportResult {
  const t = withMetrics(target);
  const portfolio = aggregate(all);
  const beatsTarget = t.pno > 0 && t.pno <= TARGET_PNO;
  const costShare = portfolio.cost > 0 ? target.cost / portfolio.cost : 0;

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  if (t.roas > 0) {
    (beatsTarget ? strengths : weaknesses).push(
      `ROAS ${fmtMultiple(t.roas)} ${beatsTarget ? "překonává" : "nedosahuje"} cílovou hodnotu ${fmtMultiple(TARGET_ROAS)}.`
    );
  }
  if (t.ctr >= 0.05) strengths.push(`Vysoká míra prokliku (CTR ${fmtPct(t.ctr, 2)}).`);
  if (t.conversions > 0)
    strengths.push(`Přináší ${fmtInt(t.conversions)} konverzí při CPA ${fmtCZK(t.cpa)}.`);
  if (!beatsTarget && t.pno > 0)
    weaknesses.push(`PNO ${fmtPct(t.pno)} je nad cílem ${fmtPct(TARGET_PNO, 0)} — táhne efektivitu dolů.`);
  if (target.status === "paused") weaknesses.push("Kampaň je aktuálně pozastavená.");

  const recommendations: EvalRecommendation[] = [
    beatsTarget
      ? {
          title: "Navýšit rozpočet",
          detail: `Při ROAS ${fmtMultiple(t.roas)} pod cílovým PNO má kampaň prostor pro škálování.`,
          priority: "high",
        }
      : {
          title: "Srovnat efektivitu k cíli",
          detail: `Zkontrolovat nabídky, vyloučení a cílení a snížit PNO ${fmtPct(t.pno)} k cíli ${fmtPct(TARGET_PNO, 0)}.`,
          priority: "high",
        },
    {
      title: "Zlepšit kreativu a relevanci",
      detail: `CTR ${fmtPct(t.ctr, 2)} a konverzní poměr ${fmtPct(t.convRate, 2)} ukazují prostor v inzerátech a vstupních stránkách.`,
      priority: "medium",
    },
  ];

  return {
    verdict: `${beatsTarget ? "Efektivní kampaň nad cílem" : "Kampaň pod cílovou efektivitou"} (ROAS ${fmtMultiple(t.roas)}).`,
    score: healthScore(t.roas),
    summary: `Kampaň „${target.name}“ (${CAMPAIGN_TYPE_LABELS[target.type]}) utratila ${fmtCZK(t.cost)} a přinesla ${fmtCZK(t.conversionValue)} při ROAS ${fmtMultiple(t.roas)} a PNO ${fmtPct(t.pno)}. Tvoří ${fmtPct(costShare)} nákladů portfolia. Ukázkový výstup — připojte LLM (Claude Code v devu, Gemini v produkci) pro vyhodnocení modelem.`,
    strengths,
    weaknesses,
    recommendations,
  };
}

function demoOverallReport(all: Campaign[]): CampaignReportResult {
  const portfolio = aggregate(all);
  const rows = all.map(withMetrics);
  const types = groupByType(all);
  const best = [...rows].sort((a, b) => b.roas - a.roas)[0];
  const worst = [...rows].filter((c) => c.cost > 0).sort((a, b) => a.roas - b.roas)[0] ?? best;
  const bestType = [...types].sort((a, b) => b.total.roas - a.total.roas)[0];
  const underTarget = portfolio.pno > 0 && portfolio.pno <= TARGET_PNO;

  const strengths: string[] = [
    `Nejvýkonnější kampaň „${best.name}“ s ROAS ${fmtMultiple(best.roas)}.`,
    `Nejefektivnější typ ${CAMPAIGN_TYPE_LABELS[bestType.type]} (ROAS ${fmtMultiple(bestType.total.roas)}).`,
  ];
  const weaknesses: string[] = [
    `Nejslabší kampaň „${worst.name}“ s ROAS ${fmtMultiple(worst.roas)} a PNO ${fmtPct(worst.pno)}.`,
  ];
  if (!underTarget)
    weaknesses.push(`Celkové PNO ${fmtPct(portfolio.pno)} je nad cílem ${fmtPct(TARGET_PNO, 0)}.`);

  const recommendations: EvalRecommendation[] = [
    {
      title: `Přesunout rozpočet do „${best.name}“`,
      detail: `Kampaň s nejlepším ROAS (${fmtMultiple(best.roas)}) unese vyšší objem při zachování efektivity.`,
      priority: "high",
    },
    {
      title: `Optimalizovat nebo utlumit „${worst.name}“`,
      detail: `Při ROAS ${fmtMultiple(worst.roas)} a nákladech ${fmtCZK(worst.cost)} přealokovat rozpočet k efektivnějším kampaním.`,
      priority: "high",
    },
    {
      title: underTarget ? "Škálovat při zachování PNO" : "Srovnat PNO k cíli",
      detail: underTarget
        ? `Portfolio s PNO ${fmtPct(portfolio.pno)} má prostor zvýšit objem, dokud zůstane pod cílem ${fmtPct(TARGET_PNO, 0)}.`
        : `Přealokovat od nákladných typů k těm s nejlepší návratností, aby PNO kleslo k ${fmtPct(TARGET_PNO, 0)}.`,
      priority: "medium",
    },
  ];

  return {
    verdict: `Portfolio ${underTarget ? "je v cíli" : "překračuje cílové PNO"} (ROAS ${fmtMultiple(portfolio.roas)}, PNO ${fmtPct(portfolio.pno)}).`,
    score: healthScore(portfolio.roas),
    summary: `${portfolio.count} kampaní utratilo ${fmtCZK(portfolio.cost)} a přineslo ${fmtCZK(portfolio.conversionValue)} při ROAS ${fmtMultiple(portfolio.roas)} a PNO ${fmtPct(portfolio.pno)} (cíl ${fmtPct(TARGET_PNO, 0)}). Výkon táhnou ${CAMPAIGN_TYPE_LABELS[bestType.type]} a brandové vyhledávání. Ukázkový výstup — připojte LLM (Claude Code v devu, Gemini v produkci) pro vyhodnocení modelem.`,
    strengths,
    weaknesses,
    recommendations,
  };
}

export function generateCampaignEvaluation(args: {
  scope: EvalScope;
  target: Campaign | null;
  campaigns: Campaign[];
  period: CampaignPeriod;
}): Promise<AiResponse<CampaignReportResult>> {
  const single = args.scope === "campaign" && args.target;
  return generateStructured({
    // llm-tool: campaign-eval
    prompt: single
      ? buildCampaignPrompt(args.target!, args.campaigns, args.period)
      : buildOverallPrompt(args.campaigns, args.period),
    system: EVAL_SYSTEM,
    schema: EVAL_SCHEMA,
    temperature: 0.6,
    normalize: normalizeReport,
    demo: () =>
      single ? demoCampaignReport(args.target!, args.campaigns) : demoOverallReport(args.campaigns),
  });
}
