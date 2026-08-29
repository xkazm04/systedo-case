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
export { generateLocalDiagnosis } from "./local-diagnosis";
export { generateChannelResearch } from "./channel-research";
export { generateOnboardingScan } from "./onboarding-scan";
// W1-D carry-forward: the ads diagnosis was landed with a DIRECT module import in
// dispatch.ts because the barrel was outside that work package's write set. The
// export it was owed lands here; re-pointing dispatch.ts at it is the Director's
// one-line seam (dispatch.ts belongs to another WP this wave).
export { generateAdsDiagnosis } from "./ads-diagnosis";
// W2-C: the service×area local landing page draft.
export { generateLocalPage } from "./local-page";
