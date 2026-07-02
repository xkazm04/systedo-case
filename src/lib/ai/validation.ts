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
  type CompareOutlineIntent,
  type ComparisonOutlineRequest,
  type ContentType,
  type EvalScope,
  type EvaluationRequest,
  type KeywordClusterInput,
  type KeywordClustersRequest,
  type LeadReplyChannel,
  type LeadReplyRequest,
  type LeadSourceDiagnosisRequest,
  type LeadSourcePeer,
  type LocalReviewReplyRequest,
  type LpVariantIdeasRequest,
  type Platform,
  type RepurposeRequest,
  type Tone,
} from "../ai-types";
import { REPURPOSE_CHANNELS } from "../distribution/generate";
import { isCampaignPeriod } from "../campaigns/types";
import { digest } from "./tools/_shared";
import { REFINE_MAX } from "./tools/refine";
import type { SupportedLocale } from "../format";

/** Pick the right locale variant. Falls back to Czech for any unlisted locale. */
function t(locale: SupportedLocale, cs: string, en: string): string {
  return locale === "en" ? en : cs;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Optional free-text refine note carried by a re-run ("kratší", "vynech ceny").
 *  Length-capped here so the prompt stays bounded; the prompt builders append it
 *  to the user prompt only (never system/schema — the gate contract is untouched). */
function parseRefineNote(o: Record<string, unknown>): string | undefined {
  const refine = str(o.refine);
  return refine ? refine.slice(0, REFINE_MAX) : undefined;
}

type Valid<T> = { valid: true; value: T } | { valid: false; error: string };

export function validateAdRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<AdRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const product = str(o.product);
  const benefits = str(o.benefits);
  const audience = str(o.audience);
  const platform = o.platform as Platform;
  const tone = o.tone as Tone;

  if (product.length < 2 || product.length > 200) {
    return { valid: false, error: t(locale, "Vyplňte název produktu nebo služby (2–200 znaků).", "Please fill in the product or service name (2–200 characters).") };
  }
  if (benefits.length < 2 || benefits.length > 600) {
    return { valid: false, error: t(locale, "Vyplňte hlavní výhody (2–600 znaků).", "Please fill in the main benefits (2–600 characters).") };
  }
  if (audience.length < 2 || audience.length > 300) {
    return { valid: false, error: t(locale, "Vyplňte cílovou skupinu (2–300 znaků).", "Please fill in the target audience (2–300 characters).") };
  }
  if (!PLATFORMS.includes(platform)) {
    return { valid: false, error: t(locale, "Neplatná platforma.", "Invalid platform.") };
  }
  if (!TONES.includes(tone)) {
    return { valid: false, error: t(locale, "Neplatný tón komunikace.", "Invalid communication tone.") };
  }
  return { valid: true, value: { product, benefits, audience, platform, tone } };
}

export function validateBriefRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<BriefRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const topic = str(o.topic);
  const primaryKeyword = str(o.primaryKeyword);
  const audience = str(o.audience);
  const contentType = o.contentType as ContentType;

  if (topic.length < 2 || topic.length > 200) {
    return { valid: false, error: t(locale, "Vyplňte téma obsahu (2–200 znaků).", "Please fill in the content topic (2–200 characters).") };
  }
  if (primaryKeyword.length < 2 || primaryKeyword.length > 120) {
    return { valid: false, error: t(locale, "Vyplňte hlavní klíčové slovo (2–120 znaků).", "Please fill in the primary keyword (2–120 characters).") };
  }
  if (audience.length < 2 || audience.length > 300) {
    return { valid: false, error: t(locale, "Vyplňte cílovou skupinu (2–300 znaků).", "Please fill in the target audience (2–300 characters).") };
  }
  if (!CONTENT_TYPES.includes(contentType)) {
    return { valid: false, error: t(locale, "Neplatný typ obsahu.", "Invalid content type.") };
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

export function validateAnalysisRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<AnalysisRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const period = (input as Record<string, unknown>).period as AnalysisPeriod;
  if (!ANALYSIS_PERIODS.includes(period)) {
    return { valid: false, error: t(locale, "Neplatné období analýzy.", "Invalid analysis period.") };
  }
  return { valid: true, value: { period } };
}

export function validateLeadReplyRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<LeadReplyRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const message = str(o.message);
  const projectType = str(o.projectType);
  const channel = o.channel as LeadReplyChannel;
  const name = str(o.name);

  if (message.length < 2 || message.length > 1200) {
    return { valid: false, error: t(locale, "Zadejte zprávu od leadu (2–1200 znaků).", "Please enter the lead’s message (2–1200 characters).") };
  }
  if (!LEAD_CHANNELS.includes(channel)) {
    return { valid: false, error: t(locale, "Neplatný kanál poptávky.", "Invalid enquiry channel.") };
  }
  if (projectType.length < 2 || projectType.length > 200) {
    return { valid: false, error: t(locale, "Vyplňte typ zakázky (2–200 znaků).", "Please fill in the project type (2–200 characters).") };
  }
  const value: LeadReplyRequest = { message: message.slice(0, 1200), channel, projectType: projectType.slice(0, 200) };
  if (name) value.name = name.slice(0, 120);
  // qualification (BANT) + brand were both read by the prompt but never copied
  // here, so the reply was neither BANT-aware nor on-brand. Thread them through.
  const qualification = str(o.qualification);
  if (qualification) value.qualification = qualification.slice(0, 600);
  const brand = str(o.brand);
  if (brand) value.brand = brand.slice(0, 120);
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
}

export function validateRepurposeRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<RepurposeRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const title = str(o.title);
  const url = str(o.url);
  const body = str(o.body);
  const tone = o.tone as Tone;

  if (title.length < 2 || title.length > 300) {
    return { valid: false, error: t(locale, "Vyplňte název článku (2–300 znaků).", "Please fill in the article title (2–300 characters).") };
  }
  try {
    // Validate the URL is parseable; void marks the result intentionally unused.
    void new URL(url);
  } catch {
    return { valid: false, error: t(locale, "Neplatná adresa zdrojového článku.", "Invalid source article URL.") };
  }
  if (!TONES.includes(tone)) {
    return { valid: false, error: t(locale, "Neplatný tón komunikace.", "Invalid communication tone.") };
  }
  // Filter the requested channels to the known set; require at least one.
  const known = new Set<string>(REPURPOSE_CHANNELS);
  const channels = Array.isArray(o.channels)
    ? o.channels.filter((c): c is string => typeof c === "string" && known.has(c))
    : [];
  if (channels.length === 0) {
    return { valid: false, error: t(locale, "Zadejte alespoň jeden platný kanál.", "Please specify at least one valid channel.") };
  }
  // Accept long source articles — digest (lead + closing, middle elided) rather
  // than reject, since repurposing a real article is the whole point. A generous
  // ceiling still guards against pathological payloads.
  if (body.length > 100_000) {
    return { valid: false, error: t(locale, "Text článku je příliš dlouhý.", "Article body is too long.") };
  }
  const digestedBody = digest(body);
  const value: RepurposeRequest = digestedBody
    ? { title, url, tone, channels, body: digestedBody }
    : { title, url, tone, channels };
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
}

export function validateLocalReviewReplyRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<LocalReviewReplyRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const reviewText = str(o.reviewText);
  const area = str(o.area);
  const businessType = str(o.businessType);
  const rating = Math.round(Number(o.rating));

  if (reviewText.length < 2 || reviewText.length > 1500) {
    return { valid: false, error: t(locale, "Zadejte text recenze (2–1500 znaků).", "Please enter the review text (2–1500 characters).") };
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return { valid: false, error: t(locale, "Hodnocení musí být v rozsahu 1–5 hvězd.", "Rating must be between 1 and 5 stars.") };
  }
  if (area.length < 1 || area.length > 120) {
    return { valid: false, error: t(locale, "Vyplňte lokalitu (1–120 znaků).", "Please fill in the location (1–120 characters).") };
  }
  const value: LocalReviewReplyRequest = { reviewText: reviewText.slice(0, 1500), rating, area: area.slice(0, 120) };
  if (businessType) value.businessType = businessType.slice(0, 120);
  const businessName = str(o.businessName);
  if (businessName) value.businessName = businessName.slice(0, 120);
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
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

export function validateArticleDraftRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<ArticleDraftRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
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
    return { valid: false, error: t(locale, "Chybí titulek nebo title tag briefu.", "The brief is missing a heading or title tag.") };
  }
  if (outline.length === 0) {
    return { valid: false, error: t(locale, "Brief nemá žádnou osnovu k rozepsání.", "The brief has no outline to expand.") };
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
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
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

export function validateCohortDiagnosisRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<CohortDiagnosisRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const cohorts = Array.isArray(o.cohorts)
    ? o.cohorts
        .slice(0, 60)
        .map(parseDiagnosisCohort)
        .filter((c): c is CohortDiagnosisCohort => c !== null)
    : [];
  if (cohorts.length === 0) {
    return { valid: false, error: t(locale, "Chybí data kohort k diagnostice.", "Missing cohort data for diagnosis.") };
  }
  const value: CohortDiagnosisRequest = {
    cohorts,
    blendedCac: fin(o.blendedCac),
    avgLtvCac: fin(o.avgLtvCac),
    avgPayback: o.avgPayback == null ? null : fin(o.avgPayback),
  };
  const trend = str(o.trend);
  if (TREND_DIRECTIONS.has(trend)) value.trend = trend as CohortDiagnosisRequest["trend"];
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
}

export function validateLeadSourceDiagnosisRequest(
  input: unknown,
  locale: SupportedLocale = "cs"
): Valid<LeadSourceDiagnosisRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const source = str(o.source).slice(0, 120);
  if (!source) {
    return { valid: false, error: t(locale, "Chybí název zdroje k diagnostice.", "Missing source name for diagnosis.") };
  }
  const leads = Math.max(0, Math.round(fin(o.leads)));
  if (leads <= 0) {
    return { valid: false, error: t(locale, "Zdroj nemá žádné leady k diagnostice.", "The source has no leads to diagnose.") };
  }
  const qualified = Math.max(0, Math.round(fin(o.qualified)));
  const won = Math.max(0, Math.round(fin(o.won)));
  // Recompute the rates from the supplied counts so the model can't be fed a
  // qualRate / winRate that contradicts the leads / qualified / won it also sees.
  const qualRate = leads > 0 ? qualified / leads : 0;
  const winRate = qualified > 0 ? won / qualified : 0;

  const value: LeadSourceDiagnosisRequest = {
    source,
    leads,
    qualified,
    won,
    qualRate,
    winRate,
  };
  const spend = fin(o.spend);
  if (spend > 0) {
    value.spend = spend;
    // CPL / CPQL are only meaningful with spend; derive from counts when omitted.
    const cpql = o.cpql == null ? (leads > 0 ? spend / leads : 0) : fin(o.cpql);
    if (cpql > 0) value.cpql = cpql;
    const costPerQualified =
      o.costPerQualified == null ? (qualified > 0 ? spend / qualified : 0) : fin(o.costPerQualified);
    if (costPerQualified > 0) value.costPerQualified = costPerQualified;
  }
  // Peer sources for the budget-shift comparison were previously dropped here, so
  // the prompt's "name a concrete better peer" instruction ran with no peer data
  // (grounding 4/5 → 5/5 once threaded). Bounded + rate-clamped.
  if (Array.isArray(o.peers)) {
    const peers: LeadSourcePeer[] = [];
    for (const item of o.peers.slice(0, 5)) {
      if (typeof item !== "object" || item === null) continue;
      const p = item as Record<string, unknown>;
      const pSource = str(p.source).slice(0, 120);
      if (!pSource) continue;
      const peer: LeadSourcePeer = {
        source: pSource,
        qualRate: Math.max(0, Math.min(1, fin(p.qualRate))),
        winRate: Math.max(0, Math.min(1, fin(p.winRate))),
      };
      const cpq = fin(p.costPerQualified);
      if (cpq > 0) peer.costPerQualified = cpq;
      peers.push(peer);
    }
    if (peers.length > 0) value.peers = peers;
  }
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
}

const COMPARE_OUTLINE_INTENTS = new Set<CompareOutlineIntent>([
  "alternative",
  "vs",
  "pricing",
  "review",
]);

export function validateComparisonOutlineRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<ComparisonOutlineRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const query = str(o.query);
  const intent = str(o.intent) as CompareOutlineIntent;

  if (query.length < 2 || query.length > 200) {
    return { valid: false, error: t(locale, "Vyplňte cílový dotaz (2–200 znaků).", "Please fill in the target query (2–200 characters).") };
  }
  if (!COMPARE_OUTLINE_INTENTS.has(intent)) {
    return { valid: false, error: t(locale, "Neplatný záměr dotazu.", "Invalid query intent.") };
  }
  const value: ComparisonOutlineRequest = { query: query.slice(0, 200), intent };
  const volume = Number(o.volume);
  if (Number.isFinite(volume) && volume > 0) value.volume = volume;
  const competitor = str(o.competitor);
  if (competitor) value.competitor = competitor.slice(0, 120);
  const positioning = str(o.positioning);
  if (positioning) value.positioning = positioning.slice(0, 600);
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
}

export function validateLpVariantIdeasRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<LpVariantIdeasRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const topic = str(o.topic);
  if (topic.length < 2 || topic.length > 200) {
    return { valid: false, error: t(locale, "Vyplňte téma / klastr landing page (2–200 znaků).", "Please fill in the landing page topic / cluster (2–200 characters).") };
  }
  // De-dupe + cap the optional grounding keywords so the prompt stays bounded.
  const seen = new Set<string>();
  const keywords: string[] = [];
  const rawKw = Array.isArray(o.keywords) ? o.keywords.slice(0, 20) : [];
  for (const item of rawKw) {
    const kw = str(item).slice(0, 120);
    if (!kw) continue;
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(kw);
  }
  const value: LpVariantIdeasRequest = { topic: topic.slice(0, 200) };
  if (keywords.length > 0) value.keywords = keywords;
  const controlLabel = str(o.controlLabel);
  if (controlLabel) value.controlLabel = controlLabel.slice(0, 120);
  const controlDescription = str(o.controlDescription);
  if (controlDescription) value.controlDescription = controlDescription.slice(0, 400);
  // The two strongest grounding signals the prompt builder reads — the disproven
  // losing arms and the control CVR to beat — were previously dropped here, so the
  // model never saw them (grounding 2/5). Thread them through (deduped/bounded).
  const losers: string[] = [];
  const rawLosers = Array.isArray(o.losers) ? o.losers.slice(0, 10) : [];
  for (const item of rawLosers) {
    const l = str(item).slice(0, 200);
    if (l) losers.push(l);
  }
  if (losers.length > 0) value.losers = losers;
  if (typeof o.controlCvr === "number" && Number.isFinite(o.controlCvr) && o.controlCvr > 0 && o.controlCvr <= 1) {
    value.controlCvr = o.controlCvr;
  }
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
}

export function validateEvaluationRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<EvaluationRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  const scope = o.scope as EvalScope;
  if (!EVAL_SCOPES.includes(scope)) {
    return { valid: false, error: t(locale, "Neplatný rozsah vyhodnocení.", "Invalid evaluation scope.") };
  }
  if (!isCampaignPeriod(o.period)) {
    return { valid: false, error: t(locale, "Neplatné období.", "Invalid period.") };
  }
  if (scope === "campaign") {
    const campaignId = str(o.campaignId);
    if (!campaignId) {
      return { valid: false, error: t(locale, "Chybí ID kampaně.", "Missing campaign ID.") };
    }
    return { valid: true, value: { scope, campaignId, period: o.period } };
  }
  return { valid: true, value: { scope, period: o.period } };
}

const CLUSTER_INTENTS = new Set(["informational", "transactional", "brand"]);

/** Sanitize one supplied keyword into the clustering input, or null to drop it.
 *  A row needs a non-empty keyword; volume/intent are optional and coerced. */
function parseClusterKeyword(v: unknown): KeywordClusterInput | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const keyword = str(o.keyword).slice(0, 120);
  if (!keyword) return null;
  const out: KeywordClusterInput = { keyword };
  const volume = Number(o.volume);
  if (Number.isFinite(volume) && volume > 0) out.volume = volume;
  const intent = str(o.intent).toLowerCase();
  if (CLUSTER_INTENTS.has(intent)) out.intent = intent;
  return out;
}

export function validateKeywordClustersRequest(input: unknown, locale: SupportedLocale = "cs"): Valid<KeywordClustersRequest> {
  if (typeof input !== "object" || input === null) {
    return { valid: false, error: t(locale, "Chybí data požadavku.", "Missing request data.") };
  }
  const o = input as Record<string, unknown>;
  // De-dupe by canonical keyword and cap the count so the prompt stays bounded.
  const seen = new Set<string>();
  const keywords: KeywordClusterInput[] = [];
  const rawList = Array.isArray(o.keywords) ? o.keywords.slice(0, 60) : [];
  for (const item of rawList) {
    const parsed = parseClusterKeyword(item);
    if (!parsed) continue;
    const key = parsed.keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(parsed);
  }
  if (keywords.length < 2) {
    return { valid: false, error: t(locale, "Zadejte alespoň 2 klíčová slova k seskupení.", "Please provide at least 2 keywords to cluster.") };
  }
  const value: KeywordClustersRequest = { keywords };
  const topic = str(o.topic);
  if (topic) value.topic = topic.slice(0, 200);
  const refine = parseRefineNote(o);
  if (refine) value.refine = refine;
  return { valid: true, value };
}
