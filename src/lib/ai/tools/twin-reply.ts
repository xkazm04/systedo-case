/** AI tool — the twin's reply draft. Writes the next outbound message on any
 *  channel in the brand's TRAINED voice, and reports how confident it is plus what
 *  a human should check before it goes out.
 *
 *  Supersedes the old `lead-reply` tool: it does everything that one did (BANT-aware
 *  first answer to an inbound enquiry, qualification questions) and adds the three
 *  things the Twin module needs — the per-channel voice, a `confidence` score and a
 *  `risks` list. Those last two are what make semi-automation safe: `decideDraft`
 *  (lib/twin/types) only lets a draft self-approve above the channel's threshold and
 *  with zero risks flagged.
 *
 *  The deterministic `speed-lead/draft` remains the keyless demo + the floor for any
 *  field the model leaves empty, so the outbox works straight from the repo.
 *  Server-only. */
import { Type } from "@google/genai";
import type { AiResponse, TwinReplyRequest, TwinReplyResult } from "../../ai-types";
import { CHANNEL_LABELS } from "../../speed-lead/sample";
import { draftReply } from "../../speed-lead/draft";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { cleanList, digest, txt } from "./_shared";
import { refineLines } from "./refine";
import { voiceLines } from "./voice";

/** Czech labels for the twin's channels — the model writes differently for a public
 *  review than for a private e-mail. */
const TWIN_CHANNEL_LABELS: Record<string, string> = {
  leads: "poptávka",
  email: "e-mail",
  chat: "chat na webu",
  social: "sociální síť (komentář / DM)",
  reviews: "veřejná recenze",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const TWIN_REPLY_SYSTEM = `Jsi komunikační dvojče firmy — píšeš odchozí zprávy jejím vlastním hlasem, ne obecným hlasem AI asistenta.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Napodob hlas značky: řiď se zadanými pokyny ke stylu, ukázkami a délkou. Pokud hlas zadán není, piš věcně, lidsky a bez korporátních frází.
- Bezvýhradně dodržuj pravidla „VŽDY" a „NIKDY". Pravidlo značky přebíjí tvůj vlastní úsudek o tom, co by znělo lépe.
- Neslibuj ceny, termíny, slevy ani výsledky, které nemáš v podkladech. Když něco nevíš, napiš, že to zjistíš.
- Navazuj na konverzaci — neopakuj, co už bylo řečeno. Nepiš předmět e-mailu, pokud nejde o kanál e-mail.
- Žádné emoji a žádné přehnané vykřičníky, pokud si je hlas značky výslovně nežádá.
- Pole „questions" jsou doplňující otázky, které posunou konverzaci dál — vrať je zvlášť, neopakuj je celé v textu odpovědi. Pokud už kvalifikaci znáš, neptej se na ni znovu.
- Pole „confidence" je tvůj střízlivý odhad 0–100, jak je zpráva připravená k odeslání bez zásahu člověka. Buď přísný: chybějící podklady, nejednoznačný dotaz nebo citlivé téma znamenají nízké číslo.
- Pole „risks" vypiš vždy, když v odpovědi něco slibuješ, uvádíš číslo, dotýkáš se stížnosti, zdraví, práva nebo peněz, nebo si nejsi jistý faktem. Prázdné pole znamená, že zprávu je bezpečné odeslat automaticky — nelži si do něj.
- Vrať pouze validní JSON dle schématu.`;

/** Past turns, oldest first — so the reply continues rather than restarts. */
function threadLines(req: TwinReplyRequest): string[] {
  const turns = (req.thread ?? []).slice(-8);
  if (turns.length === 0) return [];
  return [
    "",
    "Dosavadní konverzace (nejstarší nahoře):",
    ...turns.map((t) => `${t.direction === "in" ? "←" : "→"} ${digest(txt(t.content), 400)}`),
  ];
}

function buildTwinReplyPrompt(req: TwinReplyRequest): string {
  const channelLabel = TWIN_CHANNEL_LABELS[req.channel] ?? req.channel;
  const arrival = txt(req.arrival);
  const arrivalLabel = arrival ? (CHANNEL_LABELS[arrival as keyof typeof CHANNEL_LABELS] ?? arrival) : "";
  const contact = txt(req.contact);
  const brand = txt(req.brand);
  const qualification = txt(req.qualification);
  const examples = cleanList(req.examples, 4);
  const avoid = cleanList(req.avoid, 3);

  return [
    `Napiš další odchozí zprávu na kanálu: ${channelLabel}.`,
    "",
    brand ? `Naše firma / značka: ${brand} (mluv jejím jménem a takto se i podepiš)` : "",
    `Typ podnikání: ${req.projectType}`,
    contact ? `Komu píšeme: ${contact}` : "Komu píšeme: neznámé (oslov obecně, zdvořile)",
    arrivalLabel ? `Jak zpráva přišla: ${arrivalLabel}` : "",
    qualification ? `Co už o protistraně víme (kvalifikace): ${qualification}` : "",
    ...voiceLines(req.voice),
    ...(examples.length > 0
      ? ["", "Ukázky dřívějších zpráv v tomto hlasu (napodob styl, nekopíruj obsah):", ...examples.map((e) => `„${digest(e, 400)}"`)]
      : []),
    ...(avoid.length > 0
      ? ["", "Poučení z odpovědí, které člověk dříve zamítl — tyto chyby neopakuj:", ...avoid.map((a) => `- ${a}`)]
      : []),
    ...threadLines(req),
    "",
    "Zpráva, na kterou odpovídáš:",
    digest(txt(req.inbound), 3000),
    "",
    qualification
      ? 'Vrať „reply" (celá zpráva připravená k odeslání), „questions" (doptej se POUZE na to, co ještě nevíme), „confidence", „risks" a „toneNotes".'
      : 'Vrať „reply" (celá zpráva připravená k odeslání), „questions" (1–3 otázky, které posunou konverzaci dál), „confidence", „risks" a „toneNotes".',
    ...refineLines(req.refine),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const TWIN_REPLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: "Celá zpráva připravená k odeslání, v hlase značky.",
    },
    questions: {
      type: Type.ARRAY,
      description: "1–3 doplňující otázky, které posunou konverzaci dál",
      items: { type: Type.STRING },
    },
    confidence: {
      type: Type.NUMBER,
      description: "0–100: jak je zpráva připravená odejít bez zásahu člověka",
    },
    risks: {
      type: Type.ARRAY,
      description: "Co má člověk zkontrolovat před odesláním. Prázdné = bezpečné odeslat automaticky.",
      items: { type: Type.STRING },
    },
    toneNotes: {
      type: Type.STRING,
      description: "Jedna věta o tom, jak byl hlas značky uplatněn.",
    },
  },
  required: ["reply", "questions", "confidence", "risks", "toneNotes"],
  propertyOrdering: ["reply", "questions", "confidence", "risks", "toneNotes"],
};

const clampScore = (v: unknown): number => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

export function generateTwinReply(
  req: TwinReplyRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<TwinReplyResult>> {
  // The deterministic draft is reused both as the keyless demo and as the floor for
  // any field the model leaves empty. A canned draft is never send-ready on its own,
  // so it scores low and names itself as the risk — the autonomy gate must never
  // auto-approve a fallback.
  const fallback = (): TwinReplyResult => {
    const d = draftReply({
      id: "ai",
      name: txt(req.contact) || "zákazník",
      channel: (txt(req.arrival) || "form") as "form" | "call" | "email" | "chat",
      message: req.inbound,
      minutesAgo: 0,
    });
    return {
      reply: d.reply,
      questions: d.questions,
      confidence: 0,
      risks: ["Vygenerováno bez modelu (ukázkový koncept) — před odesláním přepište."],
      toneNotes: "Hlas značky nebyl uplatněn — jde o zástupný koncept.",
    };
  };

  const normalize = (parsed: unknown): TwinReplyResult => {
    const o = parsed as Record<string, unknown> | null;
    const reply = txt(o?.reply);
    const demo = fallback();
    if (!reply) return demo;
    const risks = cleanList(o?.risks, 5);
    return {
      reply,
      questions: cleanList(o?.questions, 5),
      confidence: clampScore(o?.confidence),
      risks,
      toneNotes: txt(o?.toneNotes),
    };
  };

  // An empty reply silently swapped for the canned draft reads as success. Flag it
  // so the wrapper self-repairs once before normalize's deterministic floor. The
  // confidence check catches a model that omits the field entirely (→ 0), which
  // would otherwise look like a deliberate "not send-ready" verdict.
  const validate = (parsed: unknown): string[] => {
    const o = parsed as Record<string, unknown> | null;
    const v: string[] = [];
    if (!txt(o?.reply)) v.push("Pole „reply“ je prázdné — vrať celou zprávu připravenou k odeslání.");
    if (typeof o?.confidence !== "number") {
      v.push("Pole „confidence“ musí být číslo 0–100 vyjadřující připravenost zprávy k odeslání.");
    }
    if (!Array.isArray(o?.risks)) v.push("Pole „risks“ musí být pole (i prázdné) — vypiš, co má člověk zkontrolovat.");
    return v;
  };

  return generateStructured({
    // llm-tool: twin-reply
    id: "twin-reply",
    // Light tool -> fast tier: haiku-class CLI in dev, flash-lite-class in prod.
    tier: "fast",
    prompt: buildTwinReplyPrompt(req),
    system: TWIN_REPLY_SYSTEM,
    schema: TWIN_REPLY_SCHEMA,
    temperature: 0.7,
    normalize,
    validate,
    demo: fallback,
    locale,
    signal,
  });
}
