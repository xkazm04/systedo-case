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
  type ArticleDraftRequest,
  type BriefKeyword,
  type BriefRequest,
  type CohortDiagnosisCohort,
  type CohortDiagnosisRequest,
  type ContentType,
  type EvalScope,
  type EvaluationRequest,
  type LeadReplyChannel,
  type LeadReplyRequest,
  type LocalReviewReplyRequest,
  type Platform,
  type RepurposeRequest,
  type Tone,
} from "../ai-types";
import { REPURPOSE_CHANNELS } from "../distribution/generate";
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

export function validateRepurposeRequest(input: unknown): Valid<RepurposeRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const title = str(o.title);
  const url = str(o.url);
  const body = str(o.body);
  const tone = o.tone as Tone;

  if (title.length < 2 || title.length > 300) {
    return { valid: false, error: "Vyplňte název článku (2–300 znaků)." };
  }
  try {
    // Validate the URL is parseable; void marks the result intentionally unused.
    void new URL(url);
  } catch {
    return { valid: false, error: "Neplatná adresa zdrojového článku." };
  }
  if (!TONES.includes(tone)) {
    return { valid: false, error: "Neplatný tón komunikace." };
  }
  // Filter the requested channels to the known set; require at least one.
  const known = new Set<string>(REPURPOSE_CHANNELS);
  const channels = Array.isArray(o.channels)
    ? o.channels.filter((c): c is string => typeof c === "string" && known.has(c))
    : [];
  if (channels.length === 0) {
    return { valid: false, error: "Zadejte alespoň jeden platný kanál." };
  }
  if (body.length > 6000) {
    return { valid: false, error: "Text článku je příliš dlouhý (max 6000 znaků)." };
  }
  return {
    valid: true,
    value: body
      ? { title, url, tone, channels, body: body.slice(0, 6000) }
      : { title, url, tone, channels },
  };
}

export function validateLocalReviewReplyRequest(input: unknown): Valid<LocalReviewReplyRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const reviewText = str(o.reviewText);
  const area = str(o.area);
  const businessType = str(o.businessType);
  const rating = Math.round(Number(o.rating));

  if (reviewText.length < 2 || reviewText.length > 1500) {
    return { valid: false, error: "Zadejte text recenze (2–1500 znaků)." };
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { valid: false, error: "Hodnocení musí být v rozsahu 1–5 hvězd." };
  }
  if (area.length < 1 || area.length > 120) {
    return { valid: false, error: "Vyplňte lokalitu (1–120 znaků)." };
  }
  return {
    valid: true,
    value: businessType
      ? { reviewText, rating, area, businessType: businessType.slice(0, 120) }
      : { reviewText, rating, area },
  };
}

/** Sanitize the approved outline carried into the draft step — cap section and
 *  point counts, coerce each field, drop anything malformed. */
function parseOutline(v: unknown): { heading: string; points: string[] }[] {
  if (!Array.isArray(v)) return [];
  const out: { heading: string; points: string[] }[] = [];
  for (const item of v.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const heading = str(o.heading);
    if (!heading) continue;
    const points = Array.isArray(o.points)
      ? o.points.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean).slice(0, 12)
      : [];
    out.push({ heading: heading.slice(0, 200), points });
  }
  return out;
}

/** Sanitize the approved FAQ carried into the draft step. */
function parseFaq(v: unknown): { question: string; answer: string }[] {
  if (!Array.isArray(v)) return [];
  const out: { question: string; answer: string }[] = [];
  for (const item of v.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const question = str(o.question);
    if (!question) continue;
    out.push({ question: question.slice(0, 300), answer: str(o.answer).slice(0, 1200) });
  }
  return out;
}

export function validateArticleDraftRequest(input: unknown): Valid<ArticleDraftRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const titleTag = str(o.titleTag);
  const metaDescription = str(o.metaDescription);
  const h1 = str(o.h1);
  const slug = str(o.slug);
  const outline = parseOutline(o.outline);
  const faq = parseFaq(o.faq);
  const keywords = Array.isArray(o.keywords)
    ? o.keywords.filter((k): k is string => typeof k === "string").map((k) => k.trim()).filter(Boolean).slice(0, 16)
    : [];
  const audience = str(o.audience);
  const contentType = o.contentType as ContentType;

  // A draft needs a working title and at least some structure to expand.
  if (!titleTag && !h1) {
    return { valid: false, error: "Chybí titulek nebo title tag briefu." };
  }
  if (outline.length === 0) {
    return { valid: false, error: "Brief nemá žádnou osnovu k rozepsání." };
  }
  const value: ArticleDraftRequest = {
    titleTag: titleTag.slice(0, 200),
    metaDescription: metaDescription.slice(0, 400),
    h1: h1.slice(0, 200),
    slug: slug.slice(0, 200),
    outline,
    faq,
    keywords,
  };
  if (audience) value.audience = audience.slice(0, 300);
  if (CONTENT_TYPES.includes(contentType)) value.contentType = contentType;
  return { valid: true, value };
}

/** Finite-number coercion: any non-finite value (NaN / Infinity / non-number)
 *  collapses to 0 so the model only ever sees clean figures. */
const fin = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const TREND_DIRECTIONS = new Set(["improving", "worsening", "flat"]);

/** Sanitize one supplied cohort row into the diagnosis projection, or null to
 *  drop it. A row needs a non-empty month label to be addressable as worstCohort. */
function parseDiagnosisCohort(v: unknown): CohortDiagnosisCohort | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const month = str(o.month).slice(0, 60);
  if (!month) return null;
  const paybackMonth = o.paybackMonth == null ? null : fin(o.paybackMonth);
  return {
    month,
    cac: fin(o.cac),
    ltv: fin(o.ltv),
    ltvCac: fin(o.ltvCac),
    paybackMonth: paybackMonth != null && paybackMonth > 0 ? paybackMonth : null,
    m3: fin(o.m3),
    signups: fin(o.signups),
  };
}

export function validateCohortDiagnosisRequest(input: unknown): Valid<CohortDiagnosisRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: "Chybí data požadavku." };
  }
  const o = input as Record<string, unknown>;
  const cohorts = Array.isArray(o.cohorts)
    ? o.cohorts
        .slice(0, 60)
        .map(parseDiagnosisCohort)
        .filter((c): c is CohortDiagnosisCohort => c !== null)
    : [];
  if (cohorts.length === 0) {
    return { valid: false, error: "Chybí data kohort k diagnostice." };
  }
  const value: CohortDiagnosisRequest = {
    cohorts,
    blendedCac: fin(o.blendedCac),
    avgLtvCac: fin(o.avgLtvCac),
    avgPayback: o.avgPayback == null ? null : fin(o.avgPayback),
  };
  const trend = str(o.trend);
  if (TREND_DIRECTIONS.has(trend)) value.trend = trend as CohortDiagnosisRequest["trend"];
  return { valid: true, value };
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
