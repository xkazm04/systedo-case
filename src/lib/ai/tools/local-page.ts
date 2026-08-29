/** AI tool — the service×area LOCAL LANDING PAGE draft (W2-C, card #15).
 *
 *  The Lokální module knows exactly which service×area combinations have no page
 *  (the coverage gaps). This turns one of those gaps into a publishable draft: a
 *  headline, an intro, 2–4 body sections, 2–4 FAQ pairs and a CTA, written in Czech
 *  for ONE service in ONE locality — the text that then ships as a `local-landing`
 *  microsite at /m/{slug} and flips the coverage cell to "má stránku".
 *
 *  Anti-fabrication, and it is structural rather than merely instructed:
 *   - The prompt carries only PRE-COMPUTED grounding — the catalog's own service
 *     name, price and price model, the derived business type, the brand fact block,
 *     and at most two REAL reviews from that area quoted verbatim.
 *   - The result type has nowhere to put an invented testimonial or an invented
 *     price: {@link LocalPageResult} is prose only. The published page renders the
 *     price from the stored PAYLOAD (the catalog number), never from model text, and
 *     renders no review block at all. A model that invents a number in prose is
 *     still bounded by the "use only the figures given" rule below, but it can never
 *     put one into a structured field the page treats as fact.
 *   - No street address, phone or opening hours anywhere: this repo has no NAP data
 *     model, so the page (and its LocalBusiness JSON-LD) emits only what is true.
 *
 *  Runs through the provider-switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  LocalPageFaq,
  LocalPageRequest,
  LocalPageResult,
  LocalPageSection,
} from "../../ai-types";
import { fmtCZK, fmtInt, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { clamp, txt } from "./_shared";
import { antiFabrication, demoTail } from "./_fragments";
import { missingStrFields, withObjectGuard } from "./_validate";
import { refineLines } from "./refine";

const LOCAL_PAGE_SYSTEM = `Jsi český copywriter na lokální SEO. Píšeš text JEDNÉ přistávací stránky pro jednu službu v jedné konkrétní lokalitě (např. „Montáž klimatizací — Brno").

Pravidla:
- ${antiFabrication("předaných údajů")}
- NIKDY neuváděj adresu, telefon, e-mail, otevírací dobu ani jméno konkrétního pracovníka — tyto údaje nemáš a vymyslet je nesmíš.
- Ceny piš pouze těmi čísly, která jsou v podkladech. Nejsou-li tam, o ceně nepiš vůbec.
- Recenze cituj jen ty, které jsou v podkladech, doslova a jako citaci. Žádnou jinou referenci si nevymýšlej.
- Neslibuj termíny, záruky, certifikace ani počty realizací, které v podkladech nejsou.
- Lokalitu zmiň přirozeně (nadpis, úvod, alespoň jedna sekce) — stránka má být o té oblasti, ne obecná.
- Struktura: „headline" (nadpis stránky, max 120 znaků), „intro" (1 odstavec), „sections" (2–4 sekce, každá „heading" + „body" o 2–4 větách), „faq" (2–4 dvojice „q"/„a" — otázky, které si člověk v této lokalitě reálně klade), „cta" (jedna krátká výzva k akci, max 120 znaků).
- Piš česky, věcně, konkrétně k té službě. Bez marketingové vaty, bez superlativů („nejlepší", „špička na trhu"), bez emoji.
- Drž se zadaného JSON schématu.`;

const PRICE_MODEL_LINE: Record<NonNullable<LocalPageRequest["priceModel"]>, string> = {
  from: "cena od",
  fixed: "pevná cena",
  quote: "cena na vyžádání (individuální kalkulace)",
};

/** Money in the catalog's own currency. CZK keeps the shared Czech formatter; any
 *  other captured currency is stated as a plain amount + its code rather than being
 *  relabelled as korunas. */
function money(n: number, currency: string): string {
  return currency === "CZK" || currency === "Kč" ? fmtCZK(n) : `${fmtInt(Math.round(n))} ${currency}`;
}

/** The price sentence for the prompt — "" when the catalog has no usable price, so
 *  the model is never handed a zero to write around. */
export function localPagePriceLine(req: LocalPageRequest): string {
  const model = req.priceModel ? PRICE_MODEL_LINE[req.priceModel] : "";
  if (req.price == null || !(req.price > 0)) {
    return req.priceModel === "quote" ? `- Cena: ${PRICE_MODEL_LINE.quote}` : "";
  }
  const amount = money(req.price, req.currency || "Kč");
  return `- Cena z ceníku: ${amount}${model ? ` (${model})` : ""}`;
}

export function buildLocalPagePrompt(req: LocalPageRequest): string {
  const lines = [
    `Napiš text lokální přistávací stránky pro službu „${req.service}" v oblasti „${req.area}".`,
    "",
    "PODKLADY (jiné údaje nemáš a nesmíš je doplnit):",
    `- Firma: ${req.brand}`,
    ...(req.businessType ? [`- Obor: ${req.businessType}`] : []),
    `- Služba: ${req.service}`,
    `- Oblast: ${req.area}`,
  ];
  const price = localPagePriceLine(req);
  if (price) lines.push(price);
  if (req.brandContext) {
    lines.push("", "KONTEXT ZNAČKY (drž se tohoto sortimentu a slovníku):", req.brandContext);
  }
  if (req.reviews && req.reviews.length > 0) {
    lines.push("", `REÁLNÉ RECENZE Z OBLASTI ${req.area} (smíš je citovat DOSLOVA a označit jako citaci; jiné reference si nevymýšlej):`);
    for (const r of req.reviews) {
      lines.push(`- ${r.author} (${r.rating}/5): „${r.text}"`);
    }
  }
  if (req.sample) {
    lines.push(
      "",
      "POZNÁMKA: podklady jsou ilustrativní ukázková data, ne ověřená čísla klienta — piš proto obecněji a nestav text na konkrétních výsledcích."
    );
  }
  lines.push(
    "",
    'Vrať: „headline" (max 120 znaků), „intro" (jeden odstavec), „sections" (2–4 sekce s „heading" a „body"), „faq" (2–4 dvojice „q"/„a") a „cta" (max 120 znaků). Žádnou adresu, telefon ani otevírací dobu neuváděj.'
  );
  lines.push(...refineLines(req.refine));
  return lines.join("\n");
}

const LOCAL_PAGE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: "Nadpis stránky (služba × oblast), max 120 znaků" },
    intro: { type: Type.STRING, description: "Úvodní odstavec stránky" },
    sections: {
      type: Type.ARRAY,
      description: "2–4 obsahové sekce stránky",
      items: {
        type: Type.OBJECT,
        properties: {
          heading: { type: Type.STRING, description: "Nadpis sekce" },
          body: { type: Type.STRING, description: "Text sekce, 2–4 věty" },
        },
        required: ["heading", "body"],
        propertyOrdering: ["heading", "body"],
      },
    },
    faq: {
      type: Type.ARRAY,
      description: "2–4 často kladené otázky k této službě v této oblasti",
      items: {
        type: Type.OBJECT,
        properties: {
          q: { type: Type.STRING, description: "Otázka" },
          a: { type: Type.STRING, description: "Odpověď" },
        },
        required: ["q", "a"],
        propertyOrdering: ["q", "a"],
      },
    },
    cta: { type: Type.STRING, description: "Krátká výzva k akci, max 120 znaků" },
  },
  required: ["headline", "intro", "sections", "cta"],
  propertyOrdering: ["headline", "intro", "sections", "faq", "cta"],
};

// Field caps — the page is public and indexable, so an unbounded model field must
// never reach it. Mirrored by the renderer's own layout expectations.
export const LOCAL_PAGE_LIMITS = {
  headline: 120,
  intro: 800,
  heading: 120,
  body: 1200,
  question: 200,
  answer: 800,
  cta: 120,
  sections: 4,
  faq: 4,
} as const;

function cleanSections(v: unknown): LocalPageSection[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({
          heading: clamp(txt(x.heading), LOCAL_PAGE_LIMITS.heading),
          body: clamp(txt(x.body), LOCAL_PAGE_LIMITS.body),
        }))
        .filter((s) => s.heading && s.body)
        .slice(0, LOCAL_PAGE_LIMITS.sections)
    : [];
}

function cleanFaq(v: unknown): LocalPageFaq[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
        .map((x) => ({
          q: clamp(txt(x.q), LOCAL_PAGE_LIMITS.question),
          a: clamp(txt(x.a), LOCAL_PAGE_LIMITS.answer),
        }))
        .filter((f) => f.q && f.a)
        .slice(0, LOCAL_PAGE_LIMITS.faq)
    : [];
}

/** Shape the model's output into the page contract. Unknown keys are dropped by
 *  construction (the result is BUILT, never spread from the parse), which is what
 *  keeps a model-emitted `price` or `reviews` field out of the published payload —
 *  the page reads those from the server-side grounding alone. */
export function normalizeLocalPage(parsed: unknown, req: LocalPageRequest): LocalPageResult {
  const o = parsed as Record<string, unknown> | null;
  const fallback = baseLocalPage(req);
  const sections = cleanSections(o?.sections);
  const faq = cleanFaq(o?.faq);
  return {
    headline: clamp(txt(o?.headline), LOCAL_PAGE_LIMITS.headline) || fallback.headline,
    intro: clamp(txt(o?.intro), LOCAL_PAGE_LIMITS.intro) || fallback.intro,
    sections: sections.length > 0 ? sections : fallback.sections,
    faq: faq.length > 0 ? faq : fallback.faq,
    cta: clamp(txt(o?.cta), LOCAL_PAGE_LIMITS.cta) || fallback.cta,
  };
}

/** Flag a hollow page so the wrapper re-prompts once instead of publishing a stub
 *  at a real public URL. */
export function validateLocalPage(parsed: unknown): string[] {
  return withObjectGuard((o) => {
    const missing = missingStrFields(o, [
      ["headline", "Chybí nadpis stránky (headline)."],
      ["intro", "Chybí úvodní odstavec (intro)."],
      ["cta", "Chybí výzva k akci (cta)."],
    ]);
    if (cleanSections(o.sections).length < 2) {
      missing.push('Chybí obsahové sekce (sections) — vrať 2 až 4 sekce s „heading" a „body".');
    }
    return missing;
  })(parsed);
}

/** The keyless demo: the deterministic base plus the honest "ukázkový výstup —
 *  připojte LLM" disclaimer on the intro. Reached ONLY through the wrapper's demo()
 *  path; live per-field backfill uses baseLocalPage, so the disclaimer never leaks
 *  into a real, metered draft. */
export function demoLocalPage(req: LocalPageRequest): LocalPageResult {
  const base = baseLocalPage(req);
  return { ...base, intro: base.intro + demoTail("text stránky od modelu") };
}

/** Deterministic, grounding-only page text — TAIL-FREE, so it is safe both as the
 *  floor for empty model fields and as the base the demo wraps. Uses NOTHING the
 *  request did not carry. */
export function baseLocalPage(req: LocalPageRequest): LocalPageResult {
  const priced = req.price != null && req.price > 0;
  const amount = priced ? money(req.price!, req.currency || "Kč") : "";
  const priceSentence = priced
    ? req.priceModel === "fixed"
      ? ` Cena podle ceníku: ${amount}.`
      : ` Cena od ${amount} podle rozsahu.`
    : req.priceModel === "quote"
      ? " Cenu připravíme jako individuální kalkulaci."
      : "";
  const field = req.businessType ? ` (${req.businessType})` : "";

  const sections: LocalPageSection[] = [
    {
      heading: `${req.service} v oblasti ${req.area}`,
      body: `${req.brand}${field} poskytuje službu ${req.service.toLowerCase()} v oblasti ${req.area}.${priceSentence}`,
    },
    {
      heading: "Jak to probíhá",
      body: `Ozvete se s poptávkou, domluvíme si termín a rozsah, a službu ${req.service.toLowerCase()} realizujeme přímo u vás v oblasti ${req.area}.`,
    },
  ];
  if (req.reviews && req.reviews.length > 0) {
    const r = req.reviews[0]!;
    sections.push({
      heading: "Co říkají zákazníci",
      body: `Citace z recenze (${r.author}, ${r.rating}/5): „${r.text}"`,
    });
  }

  const faq: LocalPageFaq[] = [
    {
      q: `Poskytujete ${req.service.toLowerCase()} i v oblasti ${req.area}?`,
      a: `Ano, ${req.service.toLowerCase()} v oblasti ${req.area} je součástí naší nabídky.`,
    },
    {
      q: "Kolik to stojí?",
      a: priced
        ? `Vycházíme z ceníku: ${amount}${req.priceModel === "from" ? " a výše podle rozsahu" : ""}.`
        : "Cenu stanovíme podle rozsahu — pošlete poptávku a připravíme kalkulaci.",
    },
  ];

  return {
    headline: clamp(`${req.service} ${req.area}`, LOCAL_PAGE_LIMITS.headline),
    intro: `${req.brand} nabízí ${req.service.toLowerCase()} v oblasti ${req.area}.${priceSentence}`,
    sections,
    faq,
    cta: "Napište nám poptávku a ozveme se s termínem.",
    // Honest marker: this text was assembled from the grounding, not written by a
    // model. It rides into the stored microsite payload.
    source: "fallback",
  };
}

export function generateLocalPage(
  req: LocalPageRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<LocalPageResult>> {
  return generateStructured({
    // llm-tool: local-page
    id: "local-page",
    prompt: buildLocalPagePrompt(req),
    system: LOCAL_PAGE_SYSTEM,
    schema: LOCAL_PAGE_SCHEMA,
    temperature: 0.6,
    normalize: (parsed) => normalizeLocalPage(parsed, req),
    validate: (parsed) => validateLocalPage(parsed),
    demo: () => demoLocalPage(req),
    locale,
    signal,
  });
}
