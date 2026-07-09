/** Server-only AI tools layer. Defines the app's structured-generation tools
 *  (PPC ads, SEO brief, performance analysis, campaign/portfolio evaluation) and
 *  runs them all through the provider-switching LLM wrapper (../../llm):
 *  Claude Code CLI in development, Gemini in production.
 *
 *  Each tool:
 *   - Structured output: passes a JSON schema so the model returns validated,
 *     typed data — never free text we parse heuristically.
 *   - Graceful fallback: a deterministic demo when no provider is available,
 *     clearly flagged, so the whole app works straight from the repo.
 *
 *  Every model call goes through `generateStructured` — the single chokepoint.
 *  Import only from server code (the route handlers).
 */
export { generateAds } from "./ads";
export { generateBrief } from "./brief";
export { generateAnalysis } from "./analysis";
export { generateMonthlyRecap } from "./monthly-recap";
export { generateChat } from "./chat";
export { generateCampaignEvaluation } from "./campaign-eval";
export { generateSocialPosts } from "./social";
export { generateTwinReply } from "./twin-reply";
export { generateTwinStyle } from "./twin-style";
export { generateRepurpose } from "./repurpose";
export { generateLocalReviewReply } from "./local-review-reply";
export { generateArticleDraft } from "./article-draft";
export { generateCohortDiagnosis } from "./cohort-diagnosis";
export { generateKeywordClusters } from "./keyword-clusters";
export { generateComparisonOutline } from "./comparison-outline";
export { generateLpVariantIdeas } from "./lp-variant-ideas";
export { generateLeadSourceDiagnosis } from "./lead-source-diagnosis";
export { generateChannelResearch } from "./channel-research";
export { generateOnboardingScan } from "./onboarding-scan";
