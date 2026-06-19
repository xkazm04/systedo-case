/** Model tags + tuning for the LLM wrapper. Single source of truth so the app,
 *  the UI badges and the tests all agree on which model is in play.
 *
 *  The app runs the same structured-generation pipeline on two providers and
 *  switches by environment (see ./index.ts):
 *    - development      → Claude Code CLI (Sonnet) — uses the monthly subscription,
 *                         far better token economics for local work.
 *    - production       → Google Gemini API.
 */

/** User-facing tag for the Claude path. `sonnet` resolves to the latest Sonnet
 *  via the Claude CLI's `--model` alias. */
export const CLAUDE_MODEL = "claude-sonnet";

/** Gemini model used in production. */
export const GEMINI_MODEL = "gemini-3-flash-preview";

/** The app's default/primary model tag (development default). */
export const APP_MODEL = CLAUDE_MODEL;

/** CLI alias passed to `claude --model` (latest Sonnet). */
export const CLAUDE_CLI_MODEL = "sonnet";

/** "Medium" thinking budget for in-app procedures, fed to the Claude CLI via the
 *  MAX_THINKING_TOKENS env var. 4000 ≈ Claude Code's "think" (medium) tier —
 *  enough to reason over the structured task without blowing the request latency. */
export const CLAUDE_THINKING_TOKENS = 4000;

/** Hard ceiling for a single Claude CLI generation. Sized for the heaviest tool
 *  (the brief→article-draft, which emits a full structured article body and can
 *  run ~2 min on a cold CLI spawn); lighter tools return well inside this. The
 *  dev client ceiling in useAiTool tracks this value, so the two stay aligned. */
export const CLAUDE_TIMEOUT_MS = 150_000;

