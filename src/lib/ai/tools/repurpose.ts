/** AI tool — content repurposing. Turns a source article into one channel-native
 *  variant per requested channel through the provider-switching LLM wrapper
 *  (../../llm). Each variant respects the channel's soft character budget (shared
 *  with the deterministic repurpose() in lib/distribution/generate). That same
 *  deterministic output is the demo/fallback, so the Distribuce module renders
 *  channel variants keyless straight from the repo and fills any channel the model
 *  skips. Server-only. */
import { Type } from "@google/genai";
import type { AiResponse, RepurposeRequest, RepurposeResult } from "../../ai-types";
import { TONE_LABELS } from "../../ai-types";
import { CHANNEL_LIMITS, REPURPOSE_CHANNELS, repurpose } from "../../distribution/generate";
import type { SupportedLocale } from "@/lib/format";
import { generateStructured } from "../../llm";
import { clamp, digest, txt } from "./_shared";
import { refineLines } from "./refine";

const REPURPOSE_SYSTEM = `Jsi český obsahový stratég a copywriter. Z jednoho zdrojového článku připravuješ varianty „na míru" pro jednotlivé distribuční kanály.

Pravidla:
- Piš výhradně česky, gramaticky správně, s diakritikou a bez prázdných korporátních frází.
- Pro KAŽDÝ požadovaný kanál napiš právě jednu variantu v jeho přirozeném stylu:
  - Newsletter = řádek „Předmět:" + krátký uvozující odstavec + výzva k přečtení článku;
  - LinkedIn = profesionálně a věcně, klidně s odrážkami, minimum emoji;
  - Instagram = vizuálně, s emoji a 3–6 relevantními hashtagy na konci;
  - X / Twitter = velmi stručně a údernĕ;
  - Facebook = přátelsky a konverzačně, s lehkými emoji.
- Vycházej z předaného názvu a textu článku — neopisuj je doslova, převyprávěj to nejdůležitější.
- Nepřekračuj limit znaků daného kanálu (raději mírně pod ním). Do textu nevkládej odkaz s UTM — ten doplní aplikace.
- Vrať pouze validní JSON dle schématu — právě jednu variantu na každý požadovaný kanál.`;

function buildRepurposePrompt(req: RepurposeRequest, channels: string[]): string {
  // Digest the source so a long article can't blow up the prompt (the validator
  // already bounds the /api/ai path; this also protects any direct caller).
  const body = digest(txt(req.body));
  return [
    "Přepracuj tento zdrojový článek do variant pro uvedené kanály.",
    "",
    `Název článku: ${req.title}`,
    `Tón: ${TONE_LABELS[req.tone]}`,
    "",
    body ? "Text / výňatek článku:" : "Text článku není k dispozici — vyjdi z názvu.",
    ...(body ? [body] : []),
    "",
    "Kanály (limit znaků):",
    ...channels.map((c) => `- ${c} | max ${CHANNEL_LIMITS[c as keyof typeof CHANNEL_LIMITS] ?? 1000} znaků`),
    "",
    `Vrať pole „variants", jeden objekt { channel, text } pro každý kanál. channel musí být přesně jeden z: ${channels.join(", ")}.`,
    ...refineLines(req.refine),
  ].join("\n");
}

const REPURPOSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    variants: {
      type: Type.ARRAY,
      description: "Jedna varianta na každý požadovaný kanál",
      items: {
        type: Type.OBJECT,
        properties: {
          channel: { type: Type.STRING, description: "Přesný název kanálu (např. LinkedIn)" },
          text: { type: Type.STRING, description: "Text varianty v limitu kanálu" },
        },
        required: ["channel", "text"],
        propertyOrdering: ["channel", "text"],
      },
    },
  },
  required: ["variants"],
  propertyOrdering: ["variants"],
};

const channelLimit = (channel: string): number =>
  CHANNEL_LIMITS[channel as keyof typeof CHANNEL_LIMITS] ?? 1000;

export function generateRepurpose(
  req: RepurposeRequest,
  locale?: SupportedLocale,
  signal?: AbortSignal
): Promise<AiResponse<RepurposeResult>> {
  // Requested channels, restricted to the known set (order preserved); default
  // to all channels if none survive the filter.
  const known = new Set<string>(REPURPOSE_CHANNELS);
  const requested = req.channels.filter((c) => known.has(c));
  const channels = requested.length > 0 ? requested : [...REPURPOSE_CHANNELS];

  // The deterministic repurpose() is both the keyless demo and the floor for any
  // channel the model skips.
  const templates = (): Map<string, string> =>
    new Map(repurpose({ title: req.title, url: req.url }).map((r) => [r.channel, r.text]));

  const fallback = (): RepurposeResult => {
    const t = templates();
    return {
      variants: channels.map((channel) => ({
        channel,
        text: clamp(t.get(channel) ?? "", channelLimit(channel)),
      })),
    };
  };

  const normalize = (parsed: unknown): RepurposeResult => {
    const o = parsed as Record<string, unknown> | null;
    const raw = Array.isArray(o?.variants) ? o.variants : [];
    const byChannel = new Map<string, string>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const x = item as Record<string, unknown>;
      const channel = txt(x.channel);
      if (!channels.includes(channel)) continue;
      const text = txt(x.text);
      if (text && !byChannel.has(channel)) {
        byChannel.set(channel, clamp(text, channelLimit(channel)));
      }
    }
    const t = templates();
    return {
      variants: channels.map((channel) => ({
        channel,
        text: byChannel.get(channel) ?? clamp(t.get(channel) ?? "", channelLimit(channel)),
      })),
    };
  };

  const validate = (parsed: unknown): string[] => {
    const o = parsed as Record<string, unknown> | null;
    if (!o || !Array.isArray(o.variants)) return [];
    const v: string[] = [];
    for (const item of o.variants) {
      if (!item || typeof item !== "object") continue;
      const x = item as Record<string, unknown>;
      const channel = txt(x.channel);
      const limit = channelLimit(channel);
      const text = txt(x.text);
      if (channels.includes(channel) && text.length > limit) {
        v.push(`Varianta pro ${channel} má ${text.length} znaků (limit ${limit}).`);
      }
    }
    return v;
  };

  return generateStructured({
    // llm-tool: repurpose
    id: "repurpose",
    // Light tool -> fast tier: haiku-class CLI in dev, flash-lite-class in prod.
    tier: "fast",
    prompt: buildRepurposePrompt(req, channels),
    system: REPURPOSE_SYSTEM,
    schema: REPURPOSE_SCHEMA,
    temperature: 0.8,
    normalize,
    validate,
    demo: fallback,
    locale,
    signal,
  });
}
