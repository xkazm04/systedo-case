/** AI tool — social-post drafting. Generates a platform-tailored caption per
 *  requested network through the provider-switching LLM wrapper, with the existing
 *  deterministic templates as the demo/fallback (so it works keyless and fills any
 *  platform the model skips). Server-only. */
import { Type } from "@google/genai";
import type { AiResponse } from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import {
  PLATFORM_LIMITS,
  SOCIAL_PLATFORM_LABELS,
  TONE_LABELS,
  type SocialDraftResult,
  type SocialPlatform,
  type Tone,
} from "../../social/types";
import { draftPosts } from "../../social/draft";
import { generateStructured } from "../../llm";
import { clamp, txt } from "./_shared";

function socialSystem(brand?: string): string {
  const who = brand ? `pro značku: ${brand}` : "pro značku, jejíž téma a tón dostaneš v zadání";
  return `Jsi český social media manažer a copywriter ${who}. Píšeš poutavé, autentické příspěvky na sociální sítě.

Pravidla:
- Piš výhradně česky, gramaticky správně, bez prázdných korporátních frází.
- Přizpůsob styl platformě: LinkedIn = profesionálně a věcně, bez přehnaných emoji; Instagram = vizuálně, s emoji a 3–6 relevantními hashtagy na konci; Facebook = přátelsky a konverzačně, s lehkými emoji; TikTok = krátce a hravě, silný háček hned v první větě, 3–5 trendy hashtagů.
- Drž zadaný tón i téma. Každý příspěvek ať má háček, konkrétní hodnotu a jasnou výzvu k akci.
- Je-li uveden hlas značky, drž se jejích produktů, tónu a slovníku — nevymýšlej jiný sortiment.
- Je-li uveden blok „CO TEĎ FUNGUJE", opři obsah o uvedené kanály, témata a reálná čísla — nevymýšlej generické nápady.
- Nepřekračuj limit znaků dané platformy (raději mírně pod ním).
- Vrať pouze validní JSON dle schématu — právě jeden příspěvek na každou požadovanou platformu.`;
}

const PLATFORM_GUIDE: Record<SocialPlatform, string> = {
  facebook: "přátelský, konverzační, lehké emoji",
  instagram: "vizuální, emoji + 3–6 hashtagů na konci",
  linkedin: "profesionální a věcný, minimum emoji",
  tiktok: "krátce a hravě, háček v první větě, 3–5 trendy hashtagů",
};

function buildSocialPrompt(
  topic: string,
  tone: Tone,
  platforms: SocialPlatform[],
  grounding?: string
): string {
  return [
    "Napiš příspěvky na sociální sítě pro tyto platformy.",
    "",
    `Téma: ${topic}`,
    `Tón: ${TONE_LABELS[tone]}`,
    ...(grounding ? ["", "CO TEĎ FUNGUJE (opři se o to, ne o generické nápady):", grounding] : []),
    "",
    "Platformy (styl | limit znaků):",
    ...platforms.map(
      (p) => `- ${SOCIAL_PLATFORM_LABELS[p]} (${p}): ${PLATFORM_GUIDE[p]} | max ${PLATFORM_LIMITS[p]} znaků`
    ),
    "",
    `Vrať pole „posts", jeden objekt { platform, content } pro každou platformu. platform musí být jedna z: ${platforms.join(", ")}.`,
  ].join("\n");
}

const SOCIAL_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    posts: {
      type: Type.ARRAY,
      description: "Jeden příspěvek na každou požadovanou platformu",
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING, description: "facebook | instagram | linkedin | tiktok" },
          content: { type: Type.STRING, description: "Text příspěvku v limitu platformy" },
        },
        required: ["platform", "content"],
        propertyOrdering: ["platform", "content"],
      },
    },
  },
  required: ["posts"],
  propertyOrdering: ["posts"],
};

export function generateSocialPosts(req: {
  topic: string;
  tone: Tone;
  platforms: SocialPlatform[];
  /** Optional "what's actually working" performance grounding, so posts lean into
   *  the brand's proven channels/themes instead of generic ideas. */
  grounding?: string;
  /** Optional brand voice (what they sell + how they talk) so the copy fits the
   *  project's brand instead of a hardcoded one. */
  brand?: string;
  /** output language (defaults to Czech) */
  locale?: SupportedLocale;
}): Promise<AiResponse<SocialDraftResult>> {
  const requested = req.platforms;
  const fallback = () =>
    draftPosts(req.topic, req.tone, requested) as { platform: SocialPlatform; content: string }[];

  const normalize = (parsed: unknown): SocialDraftResult => {
    const o = parsed as Record<string, unknown>;
    const raw = Array.isArray(o?.posts) ? o.posts : [];
    const byPlatform = new Map<SocialPlatform, string>();
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const x = item as Record<string, unknown>;
      const platform = txt(x.platform).toLowerCase() as SocialPlatform;
      if (!requested.includes(platform)) continue;
      const content = txt(x.content);
      if (content && !byPlatform.has(platform)) {
        byPlatform.set(platform, clamp(content, PLATFORM_LIMITS[platform]));
      }
    }
    // Fill any platform the model skipped with the deterministic draft.
    const templates = new Map(fallback().map((p) => [p.platform, p.content]));
    const posts = requested.map((p) => ({
      platform: p,
      content: byPlatform.get(p) ?? clamp(templates.get(p) ?? "", PLATFORM_LIMITS[p]),
    }));
    return { posts };
  };

  const validate = (parsed: unknown): string[] => {
    const o = parsed as Record<string, unknown> | null;
    if (!o || !Array.isArray(o.posts)) return [];
    const v: string[] = [];
    for (const item of o.posts) {
      if (!item || typeof item !== "object") continue;
      const x = item as Record<string, unknown>;
      const platform = txt(x.platform).toLowerCase() as SocialPlatform;
      const limit = PLATFORM_LIMITS[platform];
      const content = txt(x.content);
      if (limit && content.length > limit) {
        v.push(`Příspěvek pro ${platform} má ${content.length} znaků (limit ${limit}).`);
      }
    }
    return v;
  };

  return generateStructured({
    // llm-tool: social
    id: "social",
    prompt: buildSocialPrompt(req.topic, req.tone, requested, req.grounding),
    system: socialSystem(req.brand),
    schema: SOCIAL_SCHEMA,
    temperature: 0.9,
    normalize,
    validate,
    locale: req.locale,
    demo: () => ({ posts: fallback() }),
  });
}
