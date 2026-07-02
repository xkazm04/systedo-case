/** AI tool — speed-to-lead reply. Turns an inbound lead message into a concise,
 *  on-brand Czech reply (greeting + acknowledgement + 2–3 qualification questions
 *  + sign-off) through the provider-switching LLM wrapper (../../llm). The existing
 *  deterministic draft (lib/speed-lead/draft) is the demo/initial fallback, so the
 *  Rychlá reakce inbox works keyless straight from the repo. Server-only. */
import { Type } from "@google/genai";
import type { AiResponse, LeadReplyRequest, LeadReplyResult } from "../../ai-types";
import { CHANNEL_LABELS } from "../../speed-lead/sample";
import { draftReply } from "../../speed-lead/draft";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { cleanList, txt } from "./_shared";
import { refineLines } from "./refine";

const LEAD_REPLY_SYSTEM = `Jsi zkušený český obchodník a specialista na rychlou reakci na poptávky (speed-to-lead). Píšeš první odpověď na příchozí poptávku tak, aby působila lidsky, profesionálně a posunula obchod dál.

Pravidla:
- Piš výhradně česky, s diakritikou a gramaticky správně.
- Drž se struktury: oslovení a pozdrav, krátké poděkování a potvrzení poptávky, příslib rychlé reakce, a zdvořilý podpis.
- Buď stručný a konkrétní — žádné prázdné korporátní fráze, žádné emoji, žádné přehnané vykřičníky.
- Přizpůsob tón kanálu, kterým poptávka přišla (telefonát = nabídni zpětné zavolání; e-mail/formulář/chat = napiš písemnou odpověď).
- Neslibuj konkrétní ceny, termíny ani slevy, které nebyly zadané.
- Polož 2–3 kvalifikační otázky, které pomohou připravit přesnou nabídku (rozsah, termín, rozpočet apod.) — vrať je v poli „questions" zvlášť, neopakuj je celé v textu odpovědi.
- Pokud už máš část kvalifikace (BANT) k dispozici, neptej se na ni znovu — doptej se jen na chybějící údaje a tón odpovědi přizpůsob (horký lead = pružně a konkrétně, studený = informativně, bez tlaku).
- Vrať pouze validní JSON dle schématu.`;

function buildLeadReplyPrompt(req: LeadReplyRequest): string {
  const name = txt(req.name);
  const channelLabel = CHANNEL_LABELS[req.channel] ?? req.channel;
  const qualification = txt(req.qualification);
  const brand = txt(req.brand);
  return [
    "Napiš první on-brand odpověď na tuto příchozí poptávku.",
    "",
    brand ? `Naše firma / značka: ${brand} (mluv jejím jménem a takto se i podepiš)` : "",
    name ? `Jméno leadu: ${name}` : "Jméno leadu: neznámé (oslov obecně, zdvořile)",
    `Kanál poptávky: ${channelLabel}`,
    `Typ zakázky / služby: ${req.projectType}`,
    qualification ? `Už víme o leadovi (kvalifikace): ${qualification}` : "",
    "",
    "Zpráva od leadu:",
    req.message,
    "",
    qualification
      ? 'Vrať objekt s polem „reply" (celá odpověď připravená k odeslání) a polem „questions" — doptej se POUZE na to, co ještě nevíme (na známá pole se neptej znovu) a tón přizpůsob známé kvalifikaci.'
      : 'Vrať objekt s polem „reply" (celá odpověď připravená k odeslání) a polem „questions" (2–3 kvalifikační otázky).',
    ...refineLines(req.refine),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const LEAD_REPLY_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: {
      type: Type.STRING,
      description: "Celá odpověď na poptávku: oslovení, poděkování, příslib reakce, podpis.",
    },
    questions: {
      type: Type.ARRAY,
      description: "2–3 kvalifikační otázky pro přípravu přesné nabídky",
      items: { type: Type.STRING },
    },
  },
  required: ["reply", "questions"],
  propertyOrdering: ["reply", "questions"],
};

export function generateLeadReply(
  req: LeadReplyRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<LeadReplyResult>> {
  // The deterministic draft is reused both as the keyless demo and as the floor
  // for any field the model leaves empty.
  const fallback = (): LeadReplyResult => {
    const d = draftReply({
      id: "ai",
      name: txt(req.name) || "zákazník",
      channel: req.channel,
      message: req.message,
      minutesAgo: 0,
    });
    return { reply: d.reply, questions: d.questions };
  };

  const normalize = (parsed: unknown): LeadReplyResult => {
    const o = parsed as Record<string, unknown> | null;
    const reply = txt(o?.reply);
    const questions = cleanList(o?.questions, 4);
    const demo = fallback();
    return {
      reply: reply || demo.reply,
      questions: questions.length > 0 ? questions : demo.questions,
    };
  };

  // Without this, an empty/garbage model reply was silently swapped for the canned
  // draft with no signal — a hollow output read as success. Flag it so the wrapper
  // self-repairs once before normalize's deterministic floor.
  const validate = (parsed: unknown): string[] => {
    const o = parsed as Record<string, unknown> | null;
    const v: string[] = [];
    if (!txt(o?.reply)) v.push("Pole „reply“ je prázdné — vrať celou odpověď připravenou k odeslání.");
    if (cleanList(o?.questions, 4).length < 2) {
      v.push("Vrať alespoň 2 kvalifikační otázky v poli „questions“.");
    }
    return v;
  };

  return generateStructured({
    // llm-tool: lead-reply
    id: "lead-reply",
    // Light tool -> fast tier: haiku-class CLI in dev, flash-lite-class in prod.
    tier: "fast",
    prompt: buildLeadReplyPrompt(req),
    system: LEAD_REPLY_SYSTEM,
    schema: LEAD_REPLY_SCHEMA,
    temperature: 0.7,
    normalize,
    validate,
    demo: fallback,
    locale,
    signal,
  });
}
