/** AI tool — social-post drafting. Generates a platform-tailored caption per
 *  requested network through the provider-switching LLM wrapper, with the existing
 *  deterministic templates as the demo/fallback (so it works keyless and fills any
 *  platform the model skips). Server-only. */
import { Type } from "@google/genai";
import type { AiResponse } from "../../ai-types";
import type { SupportedLocale } from "@/lib/format";
import type { TwinReplyVoice } from "../../ai-types";
import { voiceLines } from "./voice";
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
import { skillToGenerateArgs, type Skill } from "@/lib/skills/types";
import { clamp, lenViolation, txt } from "./_shared";
import { asRecord, NOT_OBJECT_VIOLATION } from "./_validate";
import { refineLines } from "./refine";

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
  grounding?: string,
  voice?: TwinReplyVoice,
  refine?: string
): string {
  return [
    "Napiš příspěvky na sociální sítě pro tyto platformy.",
    "",
    `Téma: ${topic}`,
    `Tón: ${TONE_LABELS[tone]}`,
    ...(grounding ? ["", "CO TEĎ FUNGUJE (opři se o to, ne o generické nápady):", grounding] : []),
    // The trained twin voice, when the project has one. Beats the generic `tone`
    // label above: `tone` says "friendly", the voice says how THIS brand is friendly.
    ...voiceLines(voice, "Hlas značky — piš přesně takto (má přednost před obecným tónem výše):"),
    "",
    "Platformy (styl | limit znaků):",
    ...platforms.map(
      (p) => `- ${SOCIAL_PLATFORM_LABELS[p]} (${p}): ${PLATFORM_GUIDE[p]} | max ${PLATFORM_LIMITS[p]} znaků`
    ),
    "",
    `Vrať pole „posts", jeden objekt { platform, content } pro každou platformu. platform musí být jedna z: ${platforms.join(", ")}.`,
    // A re-run steer rides the USER prompt only (like every other refine-enabled tool),
    // so the SYSTEM persona + schema — the gate/golden fingerprint — stay byte-identical.
    ...refineLines(refine),
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

/** Flag output the wrapper should re-prompt once before the normalizer papers over it:
 *  a non-object / truncated parse, any post over its platform limit, and — when the
 *  requested platforms are supplied (Direction 2) — any REQUESTED platform missing a
 *  usable post. The old validator only checked the character limit, so an empty or
 *  partial response passed, skipped the one repair re-prompt, and normalizeSocial
 *  backfilled every gap from the canned templates while meta.demo stayed false — i.e.
 *  canned content billed as a real generation. Requiring a post per requested platform
 *  makes that empty/partial case fail → the repair fires; if it STILL comes back short,
 *  generateSocialPosts flags the canned result honestly (see there). */
export function validateSocial(parsed: unknown, requested?: readonly SocialPlatform[]): string[] {
  const o = asRecord(parsed);
  if (!o) return [NOT_OBJECT_VIOLATION];
  const posts = Array.isArray(o.posts) ? o.posts : [];
  const v: string[] = [];
  const withContent = new Set<SocialPlatform>();
  for (const item of posts) {
    if (!item || typeof item !== "object") continue;
    const x = item as Record<string, unknown>;
    const platform = txt(x.platform).toLowerCase() as SocialPlatform;
    const limit = PLATFORM_LIMITS[platform];
    const content = txt(x.content);
    if (limit && content.length > limit) {
      v.push(lenViolation(`Příspěvek pro ${platform}`, content.length, limit));
    }
    if (content) withContent.add(platform);
  }
  if (requested) {
    for (const p of requested) {
      if (!withContent.has(p)) {
        v.push(`Chybí příspěvek pro platformu ${p} — vrať právě jeden příspěvek pro každou požadovanou platformu.`);
      }
    }
  }
  return v;
}

/** Everything the social prompt + demo + normalizer are a pure function of. The
 *  brand grounds the SYSTEM persona (unlike most tools, whose grounding rides the
 *  user prompt), so it lives here and drives the skill's input-aware `system`. */
export interface SocialSkillInput {
  topic: string;
  tone: Tone;
  platforms: SocialPlatform[];
  /** Optional "what's actually working" performance grounding, so posts lean into
   *  the brand's proven channels/themes instead of generic ideas. */
  grounding?: string;
  /** Optional brand voice (what they sell + how they talk) so the copy fits the
   *  project's brand instead of a hardcoded one. */
  brand?: string;
  /** The twin's TRAINED voice for the `social` scope — how this brand actually
   *  writes. Resolved server-side from the project's twin (lib/twin/load) and
   *  injected into the USER prompt only, so the golden holds. */
  voice?: TwinReplyVoice;
  /** Optional free-text re-run steer, appended to the USER prompt only (Direction 3). */
  refine?: string;
}

/** The deterministic per-platform drafts — the demo fallback, and the fill for any
 *  platform the model skips. */
function socialFallback(i: SocialSkillInput): { platform: SocialPlatform; content: string }[] {
  return draftPosts(i.topic, i.tone, i.platforms) as { platform: SocialPlatform; content: string }[];
}

/** Reconcile the model's posts against the requested platforms: clamp each to its
 *  platform limit, keep the first per platform, and fill any skipped platform with
 *  the deterministic draft. Needs the request `input` (the requested platforms) —
 *  which is exactly why the Skill normalizer is input-aware. */
/** Reconcile the model's posts against the requested platforms AND report how many
 *  platforms the MODEL actually filled (vs. backfilled from templates), so the caller
 *  can flag a fully/partly canned answer honestly (Direction 2). `modelCount` is the
 *  number of requested platforms the model supplied real content for. */
export function normalizeSocialTracked(
  parsed: unknown,
  i: SocialSkillInput
): { result: SocialDraftResult; modelCount: number } {
  const requested = i.platforms;
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
  const templates = new Map(socialFallback(i).map((p) => [p.platform, p.content]));
  const posts = requested.map((p) => ({
    platform: p,
    content: byPlatform.get(p) ?? clamp(templates.get(p) ?? "", PLATFORM_LIMITS[p]),
  }));
  return { result: { posts }, modelCount: byPlatform.size };
}

function normalizeSocial(parsed: unknown, i: SocialSkillInput): SocialDraftResult {
  return normalizeSocialTracked(parsed, i).result;
}

/** The social-post-drafting tool as a Skill SDK plugin. Contract unchanged; the
 *  migration is a pure adapter. This is the reference for the SDK's input-aware
 *  fields: the SYSTEM persona is grounded in the brand, and the normalizer needs the
 *  requested platforms — both flow from the one input object. */
export const socialSkill: Skill<SocialSkillInput, SocialDraftResult> = {
  id: "social",
  label: "Příspěvky na sociální sítě",
  category: "social",
  system: (i) => socialSystem(i.brand),
  schema: SOCIAL_SCHEMA,
  temperature: 0.9,
  buildPrompt: (i) => buildSocialPrompt(i.topic, i.tone, i.platforms, i.grounding, i.voice, i.refine),
  normalize: normalizeSocial,
  // Input-aware (Direction 2): require a post per REQUESTED platform, so an empty/partial
  // answer fails → the wrapper's one repair re-prompt fires instead of the normalizer
  // silently backfilling the gap from the canned templates with meta.demo still false.
  validate: (parsed, i) => validateSocial(parsed, i.platforms),
  // Honesty signal carried ON THE CONTRACT: a fully-backfilled answer is a demo (refund
  // fires), a partly-backfilled one is partialDemo. runSkill translates this to meta —
  // so a registry-driven run of this skill preserves the same billing honesty as the
  // dedicated wrapper below, instead of regressing to canned-billed-as-real.
  backfill: (parsed, i) => {
    const { modelCount } = normalizeSocialTracked(parsed, i);
    return modelCount === 0 ? "full" : modelCount < i.platforms.length ? "partial" : "none";
  },
  demo: (i) => ({ posts: socialFallback(i) }),
};

export function generateSocialPosts(req: SocialSkillInput & {
  /** output language (defaults to Czech) */
  locale?: SupportedLocale;
  /** client abort propagation (stops the provider work when the caller is gone) */
  signal?: AbortSignal;
}): Promise<AiResponse<SocialDraftResult>> {
  const { locale, signal, ...input } = req;
  // The honesty is now expressed ON the skill contract: skillToGenerateArgs binds the
  // strict input-aware `validate` (empty/partial answer → the one repair re-prompt
  // fires, not a silent canned backfill), and we read `socialSkill.backfill` to set
  // meta.demo (full → refund) / partialDemo. Any future SDK-driven consumer reads the
  // SAME contract fields — the fix lives on the plugin, not this one wrapper. The
  // generateStructured call stays tagged here so the prove-once gate still covers it.
  let backfill: "none" | "partial" | "full" = "none";
  return generateStructured({
    // llm-tool: social
    ...skillToGenerateArgs(socialSkill, input),
    normalize: (parsed) => {
      backfill = socialSkill.backfill ? socialSkill.backfill(parsed, input) : "none";
      return socialSkill.normalize(parsed, input);
    },
    locale,
    signal,
  }).then((res) => {
    if (!res.meta.demo) {
      if (backfill === "full") res.meta.demo = true;
      else if (backfill === "partial") res.meta.partialDemo = true;
    }
    return res;
  });
}
