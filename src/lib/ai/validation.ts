/** Runtime request validators for the AI route handlers. Kept out of the shared
 *  client+server contract (../ai-types) so the client never pulls in server-only
 *  validation logic — the route handlers import these, the UI imports the types. */

import {
  ANALYSIS_PERIODS,
  CONTENT_TYPES,
  EVAL_SCOPES,
  LEAD_CHANNELS,
  PLATFORMS,
  TONES,
  type AdRequest,
  type AnalysisPeriod,
  type AnalysisRequest,
  type BriefKeyword,
  type BriefRequest,
  type ContentType,
  type EvalScope,
  type EvaluationRequest,
  type LeadReplyChannel,
  type LeadReplyRequest,
  type Platform,
  type Tone,
} from "../ai-types";
import { isCampaignPeriod } from "../campaigns/types";

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

type Valid<T> = { valid: true; value: T } | { valid: false; error: string };

export function validateAdRequest(input: unknown): Valid<AdRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const product = str(o.product);
  const benefits = str(o.benefits);
  const audience = str(o.audience);
  const platform = o.platform as Platform;
  const tone = o.tone as Tone;

  if (product.length < 2 || product.length > 200) {
    return { valid: false, error: "Vyplňte název produktu nebo služby (2–200 znaků)." };
  }
  if (benefits.length < 2 || benefits.length > 600) {
    return { valid: false, error: "Vyplňte hlavní výhody (2–600 znaků)." };
  }
  if (audience.length < 2 || audience.length > 300) {
    return { valid: false, error: "Vyplňte cílovou skupinu (2–300 znaků)." };
  }
  if (!PLATFORMS.includes(platform)) {
    return { valid: false, error: "Neplatná platforma." };
  }
  if (!TONES.includes(tone)) {
    return { valid: false, error: "Neplatný tón komunikace." };
  }
  return { valid: true, value: { product, benefits, audience, platform, tone } };
}

export function validateBriefRequest(input: unknown): Valid<BriefRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const topic = str(o.topic);
  const primaryKeyword = str(o.primaryKeyword);
  const audience = str(o.audience);
  const contentType = o.contentType as ContentType;

  if (topic.length < 2 || topic.length > 200) {
    return { valid: false, error: "Vyplňte téma obsahu (2–200 znaků)." };
  }
  if (primaryKeyword.length < 2 || primaryKeyword.length > 120) {
    return { valid: false, error: "Vyplňte hlavní klíčové slovo (2–120 znaků)." };
  }
  if (audience.length < 2 || audience.length > 300) {
    return { valid: false, error: "Vyplňte cílovou skupinu (2–300 znaků)." };
  }
  if (!CONTENT_TYPES.includes(contentType)) {
    return { valid: false, error: "Neplatný typ obsahu." };
  }
  return { valid: true, value: { topic, primaryKeyword, audience, contentType, keywords: parseKeywords(o.keywords) } };
}

/** Sanitize optional grounding keywords carried over from the keyword tool —
 *  cap the count and coerce each field, dropping anything malformed. */
function parseKeywords(v: unknown): BriefKeyword[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: BriefKeyword[] = [];
  for (const item of v.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const keyword = str(o.keyword);
    if (!keyword) continue;
    const volume = Number(o.volume);
    out.push({
      keyword: keyword.slice(0, 120),
      volume: Number.isFinite(volume) ? volume : 0,
      competition: str(o.competition).slice(0, 20),
    });
  }
  return out.length ? out : undefined;
}

export function validateAnalysisRequest(input: unknown): Valid<AnalysisRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const period = (input as Record<string, unknown>).period as AnalysisPeriod;
  if (!ANALYSIS_PERIODS.includes(period)) {
    return { valid: false, error: "Neplatné období analýzy." };
  }
  return { valid: true, value: { period } };
}

export function validateLeadReplyRequest(input: unknown): Valid<LeadReplyRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const message = str(o.message);
  const projectType = str(o.projectType);
  const channel = o.channel as LeadReplyChannel;
  const name = str(o.name);

  if (message.length < 2 || message.length > 1200) {
    return { valid: false, error: "Zadejte zprávu od leadu (2–1200 znaků)." };
  }
  if (!LEAD_CHANNELS.includes(channel)) {
    return { valid: false, error: "Neplatný kanál poptávky." };
  }
  if (projectType.length < 2 || projectType.length > 200) {
    return { valid: false, error: "Vyplňte typ zakázky (2–200 znaků)." };
  }
  return {
    valid: true,
    value: name ? { message, channel, projectType, name: name.slice(0, 120) } : { message, channel, projectType },
  };
}

export function validateEvaluationRequest(input: unknown): Valid<EvaluationRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const scope = o.scope as EvalScope;
  if (!EVAL_SCOPES.includes(scope)) {
    return { valid: false, error: "Neplatný rozsah vyhodnocení." };
  }
  if (!isCampaignPeriod(o.period)) {
    return { valid: false, error: "Neplatné období." };
  }
  if (scope === "campaign") {
    const campaignId = str(o.campaignId);
    if (!campaignId) {
      return { valid: false, error: "Chybí ID kampaně." };
    }
    return { valid: true, value: { scope, campaignId, period: o.period } };
  }
  return { valid: true, value: { scope, period: o.period } };
}
