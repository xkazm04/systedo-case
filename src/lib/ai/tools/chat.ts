/** AI tool — report chat. A follow-up conversation grounded in the SAME
 *  performance snapshot as the analysis (../snapshot), so the model answers
 *  free-text questions strictly from the client's real numbers. Runs through the
 *  provider-switching LLM wrapper (../../llm) like every other tool. Server-only. */
import { Type } from "@google/genai";
import { type AiResponse, type ChatRequest, type ChatResult, type ChatTurn } from "../../ai-types";
import { buildSnapshot, snapshotToPromptText, type Snapshot } from "../../snapshot";
import type { PerformanceData } from "../../types";
import { fmtCZK, fmtPct, type SupportedLocale } from "../../format";
import { generateStructured } from "../../llm";
import { ANALYSIS_SYSTEM } from "./analysis";

/** The analyst persona, plus the rules a chat turn needs on top of the one-shot
 *  analysis (conversational, plain text, admit when the data can't answer). */
const CHAT_SYSTEM = `${ANALYSIS_SYSTEM}

Teď vedeš navazující konverzaci nad tímto reportem. Navíc platí:
- Odpovídej konverzačně a stručně (2–5 vět), jako v chatu — žádné markdown nadpisy ani odrážkové seznamy, pokud o ně klient výslovně nepožádá.
- Vycházej VÝHRADNĚ z předaných čísel. Pokud odpověď z dat nevyplývá, řekni to na rovinu a navrhni, co by bylo potřeba změřit.
- Drž se poslední otázky klienta; neopakuj celý report.`;

const CHAT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    reply: { type: Type.STRING, description: "Odpověď na poslední dotaz klienta" },
  },
  required: ["reply"],
  propertyOrdering: ["reply"],
} as const;

function transcript(messages: ChatTurn[]): string {
  return messages
    .map((m) => `${m.role === "user" ? "Klient" : "Asistent"}: ${m.content}`)
    .join("\n");
}

function buildChatPrompt(snapshotText: string, messages: ChatTurn[]): string {
  return [
    "Níže jsou reálná výkonnostní data klienta z marketingových kampaní.",
    "",
    "DATA:",
    snapshotText,
    "",
    "KONVERZACE (nejstarší nahoře, poslední řádek je aktuální dotaz klienta):",
    transcript(messages),
    "",
    "Odpověz na POSLEDNÍ dotaz klienta. Vycházej pouze z uvedených dat.",
  ].join("\n");
}

/** Deterministic fallback — a data-grounded holding answer when no provider is
 *  configured, so the chat still works straight from the repo. */
function demoChat(s: Snapshot): ChatResult {
  const c = s.current;
  const paid = s.channels.filter((ch) => ch.cost > 0);
  const worst = [...paid].sort((a, b) => b.pno - a.pno)[0];
  const best = [...paid].sort((a, b) => b.roas - a.roas)[0];
  const parts = [
    `Ukázková odpověď bez připojeného modelu — vychází z reálných čísel za ${s.periodLabel}.`,
    `Obrat ${fmtCZK(c.revenue)} při nákladech ${fmtCZK(c.cost)}, PNO ${fmtPct(c.pno)} (cíl ${fmtPct(s.goalPno, 0)}).`,
  ];
  if (worst) parts.push(`Nejslabší kanál je ${worst.channel} s PNO ${fmtPct(worst.pno)}.`);
  if (best) parts.push(`Nejlepší návratnost má ${best.channel}.`);
  parts.push("Připojte LLM (Claude Code v devu, Gemini v produkci) pro konkrétní odpověď na váš dotaz.");
  return { reply: parts.join(" ") };
}

export function generateChat(
  req: ChatRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal,
  // Phase-D: the project's dataset, resolved + tenancy-checked by the route.
  // Undefined → base case-study grounding.
  data?: PerformanceData
): Promise<AiResponse<ChatResult>> {
  const snapshot = buildSnapshot(req.period, "previous", data);
  return generateStructured({
    // llm-tool: chat
    id: "chat",
    prompt: buildChatPrompt(snapshotToPromptText(snapshot), req.messages),
    system: CHAT_SYSTEM,
    schema: CHAT_SCHEMA,
    // Conversational but still numeric — a touch more freedom than the one-shot
    // analysis (0.4) so answers read naturally, low enough to stay faithful.
    temperature: 0.5,
    normalize: (parsed) => {
      const reply = typeof (parsed as ChatResult)?.reply === "string" ? (parsed as ChatResult).reply.trim() : "";
      return { reply };
    },
    // Return domain violations ([] = valid); an empty reply is the only failure.
    validate: (r) =>
      typeof (r as ChatResult)?.reply === "string" && (r as ChatResult).reply.trim().length > 0
        ? []
        : ["Prázdná odpověď."],
    demo: () => demoChat(snapshot),
    locale,
    signal,
  });
}
