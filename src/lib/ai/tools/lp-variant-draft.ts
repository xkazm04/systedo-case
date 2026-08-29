/** AI tool — the HOSTED LP EXPERIMENT's arm copy (W3-B, card #12).
 *
 *  `lp-variant-ideas` proposes CONCEPTS: two or three challenger angles worth testing.
 *  This tool is the next step and a different job — it writes the actual PAGE for every
 *  arm of one experiment, in ONE call, so the arms can be published and served. The
 *  ideas tool is untouched; this is a new tool, not a rewrite.
 *
 *  WHY ALL ARMS IN ONE CALL. An A/B test is only a test if its arms genuinely differ.
 *  A model drafting one arm at a time cannot know what the other arms already say, and
 *  reliably produces three pages that are the same page with different adjectives —
 *  a test that costs six weeks of traffic to conclude nothing. Drafting the set
 *  together lets the prompt demand (and the validator check) that the arms are
 *  distinct and that each one follows ITS OWN seeded hypothesis.
 *
 *  Anti-fabrication, structurally and not merely instructed:
 *   - the prompt carries only PRE-COMPUTED grounding (the cluster, the brand name, the
 *     shared brand fact block, and each arm's own operator-recorded seed);
 *   - {@link LpVariantDraftResult} is prose only — there is nowhere to put an invented
 *     statistic, and the published page renders no numbers at all (an experiment page
 *     that printed its own score would stop producing independent trials);
 *   - `armId`s are COERCED to the requested set, so a model that invents an arm or
 *     drops one cannot publish a page whose arms are not the ones being measured.
 *
 *  Runs through the provider-switching LLM wrapper (../../llm). Server-only. */
import { Type } from "@google/genai";
import type {
  AiResponse,
  LpArmCopy,
  LpVariantDraftRequest,
  LpVariantDraftResult,
  LpVariantDraftSeed,
} from "../../ai-types";
import type { SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { clamp, txt } from "./_shared";
import { antiFabrication, demoTail } from "./_fragments";
import { withObjectGuard } from "./_validate";
import { refineLines } from "./refine";

const LP_VARIANT_DRAFT_SYSTEM = `Jsi český CRO specialista (optimalizace konverzního poměru) a copywriter pro landing pages. Píšeš text VŠECH variant jednoho A/B testu najednou — každá varianta je samostatná přistávací stránka, které se zobrazí náhodně vybrané části návštěvníků.

Pravidla:
- ${antiFabrication("předaných podkladů")}
- NEVYMÝŠLEJ si žádná čísla — žádné konverzní poměry, počty zákazníků, úspory v procentech, hodnocení ani statistiky. Ta čísla teprve vzejdou z testu, ne od tebe.
- Neslibuj záruky, certifikace, termíny ani ceny, které v podkladech nejsou. Neuváděj adresu, telefon ani e-mail — ty nemáš.
- KAŽDÁ varianta musí držet SVOU zadanou hypotézu a svůj úhel. Nepřenášej hlavní argument jedné varianty do druhé.
- Varianty se musí od sebe LIŠIT podstatou, ne jen formulací: jiný hlavní benefit, jiná struktura nabídky, jiný důvod uvěřit. Dva různě napsané odstavce o tomtéž nejsou A/B test.
- Je-li u varianty předaný nadpis, vyjdi z něj a neměň jeho význam.
- Pro každou variantu vrať: „armId" (PŘESNĚ ten z podkladů, nezaměňuj je), „headline" (hlavní nadpis, max 120 znaků), „intro" (jeden odstavec, 2–4 věty), „bullets" (3–5 krátkých bodů, každý max 160 znaků) a „cta" (text tlačítka, krátký a akční, max 60 znaků).
- Piš výhradně česky, gramaticky správně, s diakritikou. Bez marketingové vaty, bez superlativů („nejlepší", „špička na trhu"), bez emoji.
- Vrať POUZE jeden validní JSON objekt dle schématu — žádný text okolo, žádné markdown bloky, žádné komentáře.`;

/** One arm's block in the prompt. The `armId` is repeated verbatim because it is what
 *  the model must echo back — the normalizer coerces anyway, but a model that gets it
 *  right needs no coercion and its output reads correctly in the inspector. */
function seedLines(seed: LpVariantDraftSeed, index: number): string[] {
  const lines = [`${index + 1}. armId: ${seed.armId} — varianta „${seed.label}"`];
  if (seed.hypothesis) lines.push(`   Hypotéza (drž se jí): ${seed.hypothesis}`);
  if (seed.headline) lines.push(`   Zadaný nadpis (vyjdi z něj): ${seed.headline}`);
  return lines;
}

export function buildLpVariantDraftPrompt(req: LpVariantDraftRequest): string {
  const lines = [
    `Napiš text všech ${req.arms.length} variant landing page pro A/B test na klastr „${req.cluster}".`,
    "",
    "PODKLADY (jiné údaje nemáš a nesmíš je doplnit):",
    `- Firma: ${req.brand}`,
    `- Klastr / téma stránky: ${req.cluster}`,
  ];
  if (req.brandContext) {
    lines.push("", "KONTEXT ZNAČKY (drž se tohoto sortimentu a slovníku):", req.brandContext);
  }
  lines.push("", "VARIANTY K NAPSÁNÍ (každá má svůj armId a svůj úhel):");
  req.arms.forEach((seed, i) => lines.push(...seedLines(seed, i)));
  if (req.sample) {
    lines.push(
      "",
      "POZNÁMKA: podklady jsou ilustrativní ukázková data, ne ověřená čísla klienta — piš proto obecněji a nestav text na konkrétních výsledcích."
    );
  }
  lines.push(
    "",
    `Vrať pole „arms" s právě ${req.arms.length} položkami — po jedné pro každý armId výše, ve stejném pořadí. Každá položka je objekt { armId, headline, intro, bullets, cta }. Varianty ať se od sebe liší podstatou a každá drží svou hypotézu. Nevymýšlej žádná čísla.`
  );
  lines.push(...refineLines(req.refine));
  return lines.join("\n");
}

const LP_VARIANT_DRAFT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    arms: {
      type: Type.ARRAY,
      description: "Text jedné landing page pro každou zadanou variantu (armId)",
      items: {
        type: Type.OBJECT,
        properties: {
          armId: { type: Type.STRING, description: "Identifikátor varianty přesně dle podkladů" },
          headline: { type: Type.STRING, description: "Hlavní nadpis stránky, max 120 znaků" },
          intro: { type: Type.STRING, description: "Úvodní odstavec, 2–4 věty" },
          bullets: {
            type: Type.ARRAY,
            description: "3–5 krátkých bodů, každý max 160 znaků",
            items: { type: Type.STRING },
          },
          cta: { type: Type.STRING, description: "Text hlavního tlačítka, max 60 znaků" },
        },
        required: ["armId", "headline", "intro", "bullets", "cta"],
        propertyOrdering: ["armId", "headline", "intro", "bullets", "cta"],
      },
    },
  },
  required: ["arms"],
  propertyOrdering: ["arms"],
};

/** Field caps — the arms are published to a PUBLIC URL, so an unbounded model field
 *  must never reach it. Mirrors `LP_ARM_LIMITS` in the microsite wire door, which
 *  clamps the same fields again on the way into the payload. */
export const LP_DRAFT_LIMITS = {
  headline: 120,
  intro: 600,
  bullet: 160,
  bullets: 5,
  minBullets: 3,
  cta: 60,
} as const;

function cleanBullets(v: unknown): string[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((s) => clamp(s.trim(), LP_DRAFT_LIMITS.bullet))
        .filter(Boolean)
        .slice(0, LP_DRAFT_LIMITS.bullets)
    : [];
}

/** Index the model's arms by the armId they claim. A duplicate claim keeps the FIRST:
 *  two arms answering to one id is a model error, and silently letting the later one
 *  win would hand the second arm's copy to the first arm's traffic. */
function byArmId(raw: unknown): Map<string, Record<string, unknown>> {
  const out = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = txt(o.armId);
    if (id && !out.has(id)) out.set(id, o);
  }
  return out;
}

/** Shape the model's output into the arm-set contract.
 *
 *  The result is BUILT from the REQUEST's arm list, never spread from the parse: the
 *  output therefore has exactly the requested arms, in the requested order, under the
 *  requested identities — an arm the model invented is dropped and an arm it forgot
 *  falls back to the deterministic floor for that seed. That is what makes it
 *  impossible to publish a page whose arms are not the arms being measured.
 *
 *  A model arm is matched by its claimed `armId` first and by POSITION second, because
 *  a model that writes good copy but paraphrases an opaque id is a formatting miss,
 *  not a reason to throw away the whole draft.
 *
 *  The positional fallback is deliberately ALL-OR-NOTHING: it applies only when NOT
 *  ONE requested id was matched, i.e. the model ignored the ids wholesale. Mixing the
 *  two would be worse than either — if the model labels arm B correctly and simply
 *  omits arm A, position would hand arm B's copy to arm A as well, and the experiment
 *  would spend its entire sample size proving that a page converts like itself. When
 *  any id matched, an unclaimed seed falls to its own deterministic floor instead. */
export function normalizeLpVariantDraft(
  parsed: unknown,
  req: LpVariantDraftRequest
): LpVariantDraftResult {
  const o = parsed as Record<string, unknown> | null;
  const raw = Array.isArray(o?.arms) ? o.arms : [];
  const claimed = byArmId(raw);
  const byPosition = !req.arms.some((seed) => claimed.has(seed.armId));
  const arms = req.arms.map((seed, i) => {
    const match =
      claimed.get(seed.armId) ??
      (byPosition ? (raw[i] as Record<string, unknown> | undefined) : undefined);
    const floor = baseLpArm(seed, req);
    const bullets = cleanBullets(match?.bullets);
    return {
      armId: seed.armId,
      label: seed.label,
      headline: clamp(txt(match?.headline), LP_DRAFT_LIMITS.headline) || floor.headline,
      intro: clamp(txt(match?.intro), LP_DRAFT_LIMITS.intro) || floor.intro,
      bullets: bullets.length > 0 ? bullets : floor.bullets,
      cta: clamp(txt(match?.cta), LP_DRAFT_LIMITS.cta) || floor.cta,
    };
  });
  return { arms };
}

/** Case/whitespace-insensitive headline key — so „Ušetřete čas " and „ušetřete  čas"
 *  count as the same headline when the distinctness check runs. */
function headlineKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Flag an unusable draft so the wrapper re-prompts once.
 *
 *  Two bars, and the second is the one that matters. Shape: every requested arm must
 *  come back with a headline and an intro. SUBSTANCE: the headlines must be DISTINCT —
 *  arms that open with the same sentence are not two pages, they are one page served
 *  twice, and the experiment would spend its whole sample size proving that a page
 *  converts like itself. */
export function validateLpVariantDraft(parsed: unknown, req: LpVariantDraftRequest): string[] {
  return withObjectGuard((o) => {
    const claimed = byArmId(o.arms);
    const raw = Array.isArray(o.arms) ? o.arms : [];
    const violations: string[] = [];

    // The same all-or-nothing positional rule the normalizer uses, so the validator
    // never passes a draft the normalizer would have to floor.
    const byPosition = !req.arms.some((seed) => claimed.has(seed.armId));
    const missing = req.arms.filter((seed, i) => {
      const m =
        claimed.get(seed.armId) ??
        (byPosition ? (raw[i] as Record<string, unknown> | undefined) : undefined);
      return !m || !txt(m.headline) || !txt(m.intro);
    });
    if (missing.length > 0) {
      violations.push(
        `Vrať text pro KAŽDOU zadanou variantu (chybí nebo je prázdná: ${missing
          .map((s) => s.armId)
          .join(", ")}) — každá potřebuje „headline" i „intro".`
      );
    }

    const headlines = raw
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => headlineKey(txt(x.headline)))
      .filter(Boolean);
    if (headlines.length > 1 && new Set(headlines).size < headlines.length) {
      violations.push(
        "Varianty mají shodný nadpis — každá varianta musí mít vlastní nadpis a vlastní úhel, jinak není co testovat."
      );
    }
    return violations;
  })(parsed);
}

/** Deterministic, grounding-only copy for ONE arm — TAIL-FREE, so it is safe both as
 *  the floor for an empty model field and as the base the demo wraps. Uses NOTHING the
 *  request did not carry: the arm's own label and hypothesis, the cluster and the
 *  brand. It invents no number, which is the same bar the model is held to. */
export function baseLpArm(seed: LpVariantDraftSeed, req: LpVariantDraftRequest): LpArmCopy {
  const angle = seed.hypothesis?.trim() || seed.label;
  return {
    armId: seed.armId,
    label: seed.label,
    headline: clamp(seed.headline?.trim() || `${req.cluster} — ${seed.label}`, LP_DRAFT_LIMITS.headline),
    intro: clamp(
      `${req.brand} pro téma „${req.cluster}". Tato varianta stránky staví na úhlu: ${angle}.`,
      LP_DRAFT_LIMITS.intro
    ),
    bullets: [
      clamp(`Zaměřeno na: ${angle}`, LP_DRAFT_LIMITS.bullet),
      clamp(`Řešení od ${req.brand}`, LP_DRAFT_LIMITS.bullet),
      clamp(`Téma: ${req.cluster}`, LP_DRAFT_LIMITS.bullet),
    ],
    cta: "Mám zájem",
  };
}

/** The keyless demo: the deterministic base per arm plus the honest „ukázkový výstup —
 *  připojte LLM" disclaimer on the first arm's intro. Reached ONLY through the
 *  wrapper's demo() path; live per-field backfill uses baseLpArm, so the disclaimer
 *  never leaks into a real, metered draft — or onto a published public page. */
export function demoLpVariantDraft(req: LpVariantDraftRequest): LpVariantDraftResult {
  return {
    arms: req.arms.map((seed, i) => {
      const base = baseLpArm(seed, req);
      return i === 0 ? { ...base, intro: base.intro + demoTail("text variant od modelu") } : base;
    }),
  };
}

export function generateLpVariantDraft(
  req: LpVariantDraftRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<LpVariantDraftResult>> {
  return generateStructured({
    // llm-tool: lp-variant-draft
    id: "lp-variant-draft",
    prompt: buildLpVariantDraftPrompt(req),
    system: LP_VARIANT_DRAFT_SYSTEM,
    schema: LP_VARIANT_DRAFT_SCHEMA,
    // Warmer than the local page (0.6) and cooler than the ideas tool (0.8): the arms
    // must be genuinely different from one another, but each one is bound to a
    // hypothesis it is not free to reinterpret.
    temperature: 0.7,
    normalize: (parsed) => normalizeLpVariantDraft(parsed, req),
    validate: (parsed) => validateLpVariantDraft(parsed, req),
    demo: () => demoLpVariantDraft(req),
    locale,
    signal,
  });
}
