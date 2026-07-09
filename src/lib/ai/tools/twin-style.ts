/** AI tool — the twin's style training. Reads REAL messages the brand has already
 *  sent (plus its answers to the twin's earlier questions) and distils a reusable
 *  per-channel voice: directives, traits, a length hint, always/never guardrails
 *  and exemplar lines.
 *
 *  The interesting half is `gapQuestions`: the model must also say what the samples
 *  do NOT reveal about the voice. The user answers those, the answers come back as
 *  `answers` on the next call, and the voice sharpens. That loop replaces the
 *  personas plugin's separate "generate interview questions" + "simulate answer"
 *  commands — one operation, because with a JSON schema a single call can return
 *  both the distillation and the next round's questions.
 *
 *  Grounded strictly in what it's given: with no samples and no answers it must say
 *  so in `summary` and lean on gapQuestions rather than inventing a personality.
 *  Server-only. */
import { Type } from "@google/genai";
import type { AiResponse, TwinStyleConstraint, TwinStyleRequest, TwinStyleResult } from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { cleanList, digest, txt } from "./_shared";
import { refineLines } from "./refine";

const SCOPE_LABELS: Record<string, string> = {
  generic: "obecný registr (výchozí hlas pro všechny kanály)",
  leads: "poptávky",
  email: "e-mail",
  chat: "chat na webu",
  social: "sociální sítě",
  reviews: "veřejné recenze",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const TWIN_STYLE_SYSTEM = `Jsi lingvista a stratég značky. Z reálných zpráv, které firma poslala, vytáhneš její komunikační styl a zapíšeš ho jako návod, podle kterého bude psát jazykový model.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Popisuj JEN to, co je opravdu vidět v ukázkách a odpovědích. Styl si nevymýšlej. Když je podkladů málo, přiznej to v poli „summary" a zbytek si vyžádej v poli „gapQuestions".
- Pole „directives" piš ve druhé osobě jako přímý pokyn pisateli („Oslovuj křestním jménem…", „Nezačínej omluvou…"). Je to text, který se doslova vloží do promptu — musí být konkrétní, ne obecné rady o dobrém psaní. 3–6 vět.
- Pole „traits" jsou krátká přídavná jména (např. „věcný", „vřelý", „úsečný").
- Pole „lengthHint" je stručný údaj o obvyklé délce, např. „2–4 věty" nebo „jeden odstavec".
- Pole „constraints" jsou tvrdá pravidla odvozená z ukázek: „do" = co pisatel dělá vždy, „dont" = čeho se nikdy nedopouští. Pole „kind" smí být pouze „do" nebo „dont".
- Pole „examples" jsou 2–4 krátké vzorové věty NAPSANÉ v tomto hlase, které může model napodobit. Neopisuj ukázky doslova — napiš nové věty ve stejném stylu.
- Pole „gapQuestions" jsou 2–4 konkrétní otázky na majitele hlasu, na které z podkladů neznáš odpověď a které by styl nejvíc zpřesnily (např. „Tykáte, nebo vykáte stálým zákazníkům?"). Neptej se na nic, co už z ukázek plyne.
- Vrať pouze validní JSON dle schématu.`;

function buildTwinStylePrompt(req: TwinStyleRequest): string {
  const scopeLabel = SCOPE_LABELS[req.scope] ?? req.scope;
  const brand = txt(req.brand);
  const current = txt(req.current);
  const samples = cleanList(req.samples, 10).map((s) => digest(s, 1200));
  const answers = (req.answers ?? [])
    .map((a) => ({ q: txt(a.question), a: txt(a.answer) }))
    .filter((a) => a.q && a.a)
    .slice(0, 10);

  return [
    `Vytáhni komunikační styl značky pro kanál: ${scopeLabel}.`,
    "",
    brand ? `Naše firma / značka: ${brand}` : "",
    `Typ podnikání: ${req.projectType}`,
    current ? ["", "Dosavadní pokyny ke stylu (zpřesni je, nezahazuj, co platí):", current].join("\n") : "",
    ...(samples.length > 0
      ? ["", `Reálné zprávy, které firma poslala (${samples.length}):`, ...samples.map((s, i) => `--- Ukázka ${i + 1} ---\n${s}`)]
      : ["", "Reálné ukázky zpráv: žádné nebyly dodány."]),
    ...(answers.length > 0
      ? ["", "Odpovědi majitele hlasu na dřívější otázky:", ...answers.map((a) => `Otázka: ${a.q}\nOdpověď: ${a.a}`)]
      : []),
    "",
    samples.length === 0 && answers.length === 0
      ? 'Podkladů je málo. V „summary" to napiš na rovinu, „directives" odvoď opatrně z typu podnikání a soustřeď se hlavně na „gapQuestions".'
      : 'Vrať „summary", „directives", „traits", „lengthHint", „constraints", „examples" a „gapQuestions".',
    ...refineLines(req.refine),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const TWIN_STYLE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "Jedna věta o tom, čím je tento hlas charakteristický (a jak jistý si jím na daných podkladech jsi).",
    },
    directives: {
      type: Type.STRING,
      description: "Pokyny ke stylu ve druhé osobě, 3–6 vět. Vkládají se doslova do promptu.",
    },
    traits: {
      type: Type.ARRAY,
      description: "Krátká přídavná jména popisující registr",
      items: { type: Type.STRING },
    },
    lengthHint: { type: Type.STRING, description: 'Obvyklá délka zprávy, např. „2–4 věty"' },
    constraints: {
      type: Type.ARRAY,
      description: "Tvrdá pravidla odvozená z ukázek",
      items: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, description: 'Přesně „do" (vždy) nebo „dont" (nikdy)' },
          rule: { type: Type.STRING, description: "Pravidlo jednou větou" },
        },
        required: ["kind", "rule"],
        propertyOrdering: ["kind", "rule"],
      },
    },
    examples: {
      type: Type.ARRAY,
      description: "2–4 nové vzorové věty napsané v tomto hlase",
      items: { type: Type.STRING },
    },
    gapQuestions: {
      type: Type.ARRAY,
      description: "2–4 otázky, na které z podkladů neznáš odpověď a které by styl zpřesnily",
      items: { type: Type.STRING },
    },
  },
  required: ["summary", "directives", "traits", "lengthHint", "constraints", "examples", "gapQuestions"],
  propertyOrdering: ["summary", "directives", "traits", "lengthHint", "constraints", "examples", "gapQuestions"],
};

function normalizeConstraints(v: unknown): TwinStyleConstraint[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((raw) => {
      const o = raw as Record<string, unknown> | null;
      const rule = txt(o?.rule);
      if (!rule) return null;
      // Anything that isn't an explicit "dont" is a "do" — a model that returns
      // "always"/"never" or omits the field must not silently invert a hard rule.
      const kind: TwinStyleConstraint["kind"] = txt(o?.kind).toLowerCase().startsWith("don") ? "dont" : "do";
      return { kind, rule };
    })
    .filter((c): c is TwinStyleConstraint => c !== null)
    .slice(0, 10);
}

export function generateTwinStyle(
  req: TwinStyleRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<TwinStyleResult>> {
  // Keyless fallback: an honest "nothing was distilled" rather than a fabricated
  // voice. The gapQuestions still give the user somewhere to go.
  const fallback = (): TwinStyleResult => ({
    summary: "Hlas se zatím nepodařilo vytáhnout — chybí model i podklady.",
    directives: txt(req.current),
    traits: [],
    lengthHint: "2–4 věty",
    constraints: [],
    examples: [],
    gapQuestions: [
      "Tykáte, nebo vykáte svým zákazníkům?",
      "Jak začínáte zprávu, když se zákazník ozve poprvé?",
      "Co byste nikdy nenapsali, i kdyby to znělo dobře?",
    ],
  });

  const normalize = (parsed: unknown): TwinStyleResult => {
    const o = parsed as Record<string, unknown> | null;
    const demo = fallback();
    const directives = txt(o?.directives);
    return {
      summary: txt(o?.summary) || demo.summary,
      directives: directives || demo.directives,
      traits: cleanList(o?.traits, 8),
      lengthHint: txt(o?.lengthHint) || demo.lengthHint,
      constraints: normalizeConstraints(o?.constraints),
      examples: cleanList(o?.examples, 6),
      gapQuestions: cleanList(o?.gapQuestions, 4).length > 0 ? cleanList(o?.gapQuestions, 4) : demo.gapQuestions,
    };
  };

  // Directives are the entire product of this tool — an empty string means the
  // voice never got trained, which the UI would happily save over a good one.
  const validate = (parsed: unknown): string[] => {
    const o = parsed as Record<string, unknown> | null;
    const v: string[] = [];
    if (txt(o?.directives).length < 40) {
      v.push("Pole „directives“ je prázdné nebo příliš krátké — vrať 3–6 konkrétních vět ve druhé osobě.");
    }
    if (cleanList(o?.gapQuestions, 4).length < 1) {
      v.push("Vrať alespoň jednu otázku v poli „gapQuestions“ — co o hlasu ještě nevíš.");
    }
    return v;
  };

  return generateStructured({
    // llm-tool: twin-style
    id: "twin-style",
    prompt: buildTwinStylePrompt(req),
    system: TWIN_STYLE_SYSTEM,
    schema: TWIN_STYLE_SCHEMA,
    temperature: 0.4,
    normalize,
    validate,
    demo: fallback,
    locale,
    signal,
  });
}
