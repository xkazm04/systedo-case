/** Model tags + tuning for the LLM wrapper. Single source of truth so the app,
 *  the UI badges and the tests all agree on which model is in play.
 *
 *  The app runs the same structured-generation pipeline on two providers and
 *  switches by environment (see ./index.ts):
 *    - development      → Claude Code CLI (Sonnet) — uses the monthly subscription,
 *                         far better token economics for local work.
 *    - production       → Google Gemini API.
 */

/** Per-call model tier. Every tool defaults to "quality" (the full-strength
 *  model); short, low-stakes tools (lead replies, review replies, repurposing,
 *  keyword clustering) opt into "fast" at their call site for a haiku-class CLI
 *  run in dev and flash-lite-class token rates in prod. The stamped `meta.model`
 *  always reflects the tier-resolved model that actually served the call. */
export type ModelTier = "fast" | "quality";

/** User-facing tag for the Claude path. `sonnet` resolves to the latest Sonnet
 *  via the Claude CLI's `--model` alias. */
export const CLAUDE_MODEL = "claude-sonnet";

/** User-facing tag for the fast Claude tier (latest Haiku via the CLI alias). */
export const CLAUDE_MODEL_FAST = "claude-haiku";

/** Gemini model used in production. A `-preview` tag chosen for flash-tier
 *  price/latency. NOTE: src/lib/llm/cost.ts `RATES` is keyed by this exact string,
 *  so renaming it (or its GA) needs a matching RATES entry or cost reports as $0. */
export const GEMINI_MODEL = "gemini-3-flash-preview";

/** Gemini model for the fast tier (flash-lite-class price/latency). Keyed into
 *  src/lib/llm/cost.ts `RATES` like GEMINI_MODEL — keep the two in sync. */
export const GEMINI_MODEL_FAST = "gemini-3-flash-lite-preview";

/** The app's default/primary model tag (development default). */
export const APP_MODEL = CLAUDE_MODEL;

/** CLI alias passed to `claude --model` (latest Sonnet). */
export const CLAUDE_CLI_MODEL = "sonnet";

/** CLI alias for the fast tier (latest Haiku). */
export const CLAUDE_CLI_MODEL_FAST = "haiku";

/** Tier → user-facing Claude model tag (what `meta.model` reports). */
export function claudeModelTag(tier: ModelTier = "quality"): string {
  return tier === "fast" ? CLAUDE_MODEL_FAST : CLAUDE_MODEL;
}

/** Tier → `claude --model` alias for the CLI spawn. */
export function claudeCliAlias(tier: ModelTier = "quality"): string {
  return tier === "fast" ? CLAUDE_CLI_MODEL_FAST : CLAUDE_CLI_MODEL;
}

/** Tier → Gemini model tag (also the RATES key for cost estimates). */
export function geminiModelTag(tier: ModelTier = "quality"): string {
  return tier === "fast" ? GEMINI_MODEL_FAST : GEMINI_MODEL;
}

/** "Medium" thinking budget for in-app procedures, fed to the Claude CLI via the
 *  MAX_THINKING_TOKENS env var. 4000 ≈ Claude Code's "think" (medium) tier —
 *  enough to reason over the structured task without blowing the request latency. */
export const CLAUDE_THINKING_TOKENS = 4000;

/** Hard ceiling for a single Claude CLI generation. Sized for the heaviest tool
 *  (the brief→article-draft, which emits a full structured article body and can
 *  run ~2 min on a cold CLI spawn); lighter tools return well inside this. The
 *  dev client ceiling in useAiTool tracks this value, so the two stay aligned. */
export const CLAUDE_TIMEOUT_MS = 150_000;

