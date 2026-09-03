/** Model tags + tuning for the LLM wrapper. Single source of truth so the app,
 *  the UI badges and the tests all agree on which model is in play.
 *
 *  The app runs the same structured-generation pipeline on two providers and
 *  switches by environment (see ./index.ts):
 *    - development      → Claude Code CLI (Sonnet) — uses the monthly subscription,
 *                         far better token economics for local work.
 *    - production       → Google Gemini API.
 */
import type { ByomVendor } from "./keys/types";

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

/** Gemini model used in production. GA since 2026-09-02 (was a `-preview` tag).
 *  NOTE: src/lib/llm/cost.ts `RATES` is keyed by this exact string, so renaming it
 *  needs a matching RATES entry or cost reports as $0 - and because that key is
 *  COMPUTED from this constant, the key follows a rename automatically while the RATE
 *  underneath it does not. Changing this line means checking the number there too. */
export const GEMINI_MODEL = "gemini-3.8-flash";

/** Gemini model for the fast tier (flash-lite-class price/latency). Keyed into
 *  src/lib/llm/cost.ts `RATES` like GEMINI_MODEL — keep the two in sync. */
export const GEMINI_MODEL_FAST = "gemini-3-flash-lite-preview";

/** The app's default/primary model tag (development default). */
export const APP_MODEL = CLAUDE_MODEL;

/** CLI alias passed to `claude --model` (latest Sonnet). */
export const CLAUDE_CLI_MODEL = "sonnet";

/** CLI alias for the fast tier (latest Haiku). */
export const CLAUDE_CLI_MODEL_FAST = "haiku";

/** Bench-only override: pin the Claude CLI to ONE alias for BOTH tiers (e.g.
 *  CLAUDE_CLI_PIN=opus while the quality matrix benchmarks an alternative CLI
 *  model). Read per call — the benchmark sets it for its generation phase only,
 *  so the judge phase still runs the normal Sonnet. Never set in production. */
function claudeCliPin(): string | undefined {
  return process.env.CLAUDE_CLI_PIN || undefined;
}

/** Tier → user-facing Claude model tag (what `meta.model` reports). */
export function claudeModelTag(tier: ModelTier = "quality"): string {
  const pin = claudeCliPin();
  if (pin) return `claude-${pin}`;
  return tier === "fast" ? CLAUDE_MODEL_FAST : CLAUDE_MODEL;
}

/** Tier → `claude --model` alias for the CLI spawn. */
export function claudeCliAlias(tier: ModelTier = "quality"): string {
  return claudeCliPin() ?? (tier === "fast" ? CLAUDE_CLI_MODEL_FAST : CLAUDE_CLI_MODEL);
}

/** Tier → Gemini model tag (also the RATES key for cost estimates). */
export function geminiModelTag(tier: ModelTier = "quality"): string {
  return tier === "fast" ? GEMINI_MODEL_FAST : GEMINI_MODEL;
}

/** User-facing tag for the Codex CLI path (dev, keyless — bills the ChatGPT
 *  plan). The CLI's default model serves BOTH tiers: Codex model ids drift
 *  weekly and pinning one here would silently go stale, so the tag names the
 *  transport rather than claiming a model name we didn't verify. */
export const CODEX_MODEL = "codex";

/** Tier → user-facing Codex model tag. Deliberately tier-blind (see
 *  CODEX_MODEL); the arity-0 form stays assignable to `modelFor`. */
export const codexModelTag = (): string => CODEX_MODEL;

/** Hard ceiling for a single Codex CLI generation (`codex exec` has no timeout
 *  flag — the app enforces the wall clock, same as CLAUDE_TIMEOUT_MS). Sized
 *  like the Claude ceiling; env-overridable for slower machines. A tiny value
 *  is treated as MISCONFIGURATION and floored — an instant kill on every call
 *  would silently route the whole dev ladder to the demo floor. */
const CODEX_TIMEOUT_FLOOR_MS = 30_000;
const codexTimeoutRaw = Number(process.env.CODEX_TIMEOUT_MS);
export const CODEX_TIMEOUT_MS =
  Number.isFinite(codexTimeoutRaw) && codexTimeoutRaw > 0
    ? Math.max(codexTimeoutRaw, CODEX_TIMEOUT_FLOOR_MS)
    : 150_000;

/** "Medium" thinking budget for in-app procedures, fed to the Claude CLI via the
 *  MAX_THINKING_TOKENS env var. 4000 ≈ Claude Code's "think" (medium) tier —
 *  enough to reason over the structured task without blowing the request latency. */
export const CLAUDE_THINKING_TOKENS = 4000;

/** Hard ceiling for a single Claude CLI generation. Sized for the heaviest tool
 *  (the brief→article-draft, which emits a full structured article body and can
 *  run ~2 min on a cold CLI spawn); lighter tools return well inside this. The
 *  dev client ceiling in useAiTool tracks this value, so the two stay aligned. */
export const CLAUDE_TIMEOUT_MS = 150_000;

/** Wrapper-level per-tier deadline for a single provider attempt (ms). A generous
 *  outer backstop — a healthy call finishes in seconds; this only fires on a hang.
 *  The Claude CLI path floors its deadline at CLAUDE_TIMEOUT_MS (see index.ts), so
 *  these never SHORTEN the CLI's own 150s ceiling — they exist to bound the Gemini
 *  SDK and the BYOM HTTP fetches, which previously had NO timeout at all. */
export const LLM_DEADLINE_MS: Record<ModelTier, number> = {
  quality: 120_000,
  fast: 60_000,
};

/** Grace period after SIGTERM before the Claude CLI child is force-killed
 *  (SIGKILL). A well-behaved child exits on SIGTERM well inside this; a wedged one
 *  is escalated so it can't keep holding a concurrency slot. */
export const CLAUDE_KILL_GRACE_MS = 2_000;

/** Upper bound on how long a Retry-After header may pause a retry. A provider can
 *  ask us to wait minutes on a 429; a user waiting on an AI generation cannot, so
 *  we honor Retry-After only up to this cap and otherwise use it as-is (bounded
 *  backoff). Keeps a throttled provider from stalling the whole request. */
export const LLM_RETRY_AFTER_CAP_MS = 20_000;

// ===========================================================================
// BYOM (bring-your-own-model): default model tags per vendor. Distinct from the
// app's own provider tags above — a BYOM Anthropic call hits the HTTP Messages
// API (real model ids like claude-sonnet-5), not the local Claude Code CLI.
// ===========================================================================

/** Default Anthropic HTTP-API model for a BYOM quality-tier call. The user picks
 *  the model in settings; this is the starting point (Sonnet: strong copy at a
 *  sensible token price for a bulk marketing workload the user pays for). */
export const CLAUDE_API_MODEL = "claude-sonnet-5";

/** Default Anthropic HTTP-API model for a BYOM fast-tier call. */
export const CLAUDE_API_MODEL_FAST = "claude-haiku-4-5";

/** Per-vendor default models (quality + fast). Overridable per key in settings.
 *  These double as the cost-table keys in ./cost.ts — a user-picked model with no
 *  rate simply reports est. $0 (BYOM pays the provider directly, so the on-screen
 *  cost is a best-effort hint, not billing). */
export const BYOM_DEFAULT_MODELS: Record<ByomVendor, { quality: string; fast: string }> = {
  openai: { quality: "gpt-5.4-mini", fast: "gpt-5.4-mini" },
  anthropic: { quality: CLAUDE_API_MODEL, fast: CLAUDE_API_MODEL_FAST },
  gemini: { quality: "gemini-3.5-flash", fast: "gemini-3.1-flash-lite" },
  openrouter: { quality: "z-ai/glm-5.2", fast: "deepseek/deepseek-v4-flash" },
  qwen: { quality: "qwen3.8-max", fast: "deepseek-v4-flash-0731" },
  ollama: { quality: "lfm2.5:8b", fast: "lfm2.5:8b" },
};

/** Resolve the model tag for a BYOM call: the user's per-tier override when set,
 *  else the vendor default. `meta.model` reports whatever this returns, so the
 *  telemetry and cost estimate always name the model that actually served. */
export function byomModel(
  vendor: ByomVendor,
  tier: ModelTier = "quality",
  modelOverride?: string,
  fastOverride?: string
): string {
  const d = BYOM_DEFAULT_MODELS[vendor];
  return tier === "fast" ? fastOverride || d.fast : modelOverride || d.quality;
}

