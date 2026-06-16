/** LLM wrapper — one structured-generation entry point, two providers, switched
 *  by environment:
 *
 *    development  → Claude Code CLI (Sonnet via the monthly subscription).
 *    production   → Google Gemini API.
 *
 *  Every AI feature in the app calls `generateStructured` (see src/lib/gemini.ts,
 *  the tools layer). Providers live in ./claude and ./gemini; this module only
 *  decides which one to use, stamps the result envelope, and falls back to a
 *  deterministic demo when no provider is available so the app still works from a
 *  clean checkout. Server-only.
 */
import type { AiMeta, AiResponse } from "../ai-types";
import { claudeAvailable, runClaude } from "./claude";
import { geminiAvailable, runGemini } from "./gemini";
import { estimateCostUsd, type TokenUsage } from "./cost";
import { CLAUDE_MODEL, GEMINI_MODEL } from "./models";
import { promptFingerprint, recordLlmCall } from "./telemetry";

export { APP_MODEL, CLAUDE_MODEL, GEMINI_MODEL } from "./models";

/** Development uses Claude; anything else (production) uses Gemini. */
export function isDevEnvironment(): boolean {
  return process.env.NODE_ENV !== "production";
}

export interface GenerateArgs<T> {
  /** the llm-tool id (matches the `// llm-tool: <id>` tag), used to attribute
   *  eval telemetry per tool. Optional so existing call sites stay valid. */
  id?: string;
  prompt: string;
  system: string;
  /** JSON schema in @google/genai `Type` form (used natively by Gemini, embedded
   *  into the prompt for Claude). */
  schema: object;
  temperature?: number;
  /** Map the raw parsed JSON into the validated, typed result. */
  normalize: (parsed: unknown) => T;
  /** Deterministic fallback when no provider is available. */
  demo: () => T;
  /** Optional server-side check of the *raw* model output against domain limits
   *  (e.g. ad character limits). Returns human-readable violation messages; an
   *  empty array means valid. When non-empty on a real (non-demo) call, the
   *  wrapper re-prompts the model once to self-correct before `normalize()`'s
   *  clamping guarantees a valid final result. */
  validate?: (parsed: unknown) => string[];
}

interface ProviderCall {
  system: string;
  prompt: string;
  schema: object;
  temperature?: number;
}

/** One LLM provider behind a uniform run() returning parsed JSON + optional usage. */
interface Provider {
  model: string;
  available: () => boolean;
  run: (call: ProviderCall) => Promise<{ parsed: unknown; usage?: TokenUsage }>;
}

const claudeProvider: Provider = {
  model: CLAUDE_MODEL,
  available: claudeAvailable,
  // Claude runs on the dev subscription — no metered token usage to report.
  run: async (c) => ({ parsed: await runClaude({ system: c.system, prompt: c.prompt, schema: c.schema }), usage: undefined }),
};

const geminiProvider: Provider = {
  model: GEMINI_MODEL,
  available: geminiAvailable,
  run: (c) => runGemini(c),
};

/** Recoverable failure modes thrown by the provider adapters — worth one retry. */
const RETRYABLE = ["nevrátil platný JSON", "prázdnou odpověď", "vypršel", "selhal"];

function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RETRYABLE.some((m) => msg.includes(m));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Run one provider with a bounded retry on recoverable errors. Returns the
 *  parsed output, any usage, and how many attempts it took. Throws if every
 *  attempt fails. */
async function runWithRetry(
  provider: Provider,
  call: ProviderCall,
  attempts: number
): Promise<{ parsed: unknown; usage?: TokenUsage; attempts: number }> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const out = await provider.run(call);
      return { ...out, attempts: i };
    } catch (err) {
      lastErr = err;
      if (i < attempts && isRetryable(err)) {
        await sleep(250 * i);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/** Re-prompt note appended when the first output violates domain limits. */
function buildRepairNote(violations: string[]): string {
  return [
    "",
    "POZOR: předchozí pokus porušil tyto limity:",
    ...violations.map((v) => `- ${v}`),
    "Vrať prosím CELÝ JSON znovu přesně podle schématu a striktně dodrž uvedené limity (raději mírně pod limitem).",
  ].join("\n");
}

/**
 * The single chokepoint for every LLM call in the app. Tries providers in
 * environment-preferred order (Claude→Gemini in dev, Gemini→Claude in prod),
 * filtered to what's configured, with bounded retries and cross-provider
 * fallback; optionally self-repairs limit violations with one re-prompt; and
 * degrades to the deterministic demo only when every provider is exhausted.
 * Returns `{ result, meta }` with provider/attempt/cost telemetry.
 */
export async function generateStructured<T>(args: GenerateArgs<T>): Promise<AiResponse<T>> {
  const start = Date.now();
  const dev = isDevEnvironment();
  const promptHash = promptFingerprint(args.system, args.schema);
  const toolId = args.id ?? "unknown";

  const ordered = dev ? [claudeProvider, geminiProvider] : [geminiProvider, claudeProvider];
  const providers = ordered.filter((p) => p.available());

  const baseCall: ProviderCall = {
    system: args.system,
    prompt: args.prompt,
    schema: args.schema,
    temperature: args.temperature,
  };

  for (let idx = 0; idx < providers.length; idx++) {
    const provider = providers[idx];
    try {
      const first = await runWithRetry(provider, baseCall, 2);
      let parsed = first.parsed;
      let usage = first.usage;
      let totalAttempts = first.attempts;

      // Server-side output validation + one self-repair re-prompt.
      const violations = args.validate ? args.validate(parsed) : [];
      let repaired = false;
      if (violations.length > 0) {
        try {
          const second = await runWithRetry(
            provider,
            { ...baseCall, prompt: args.prompt + buildRepairNote(violations) },
            1
          );
          parsed = second.parsed;
          usage = second.usage ?? usage;
          totalAttempts += second.attempts;
          repaired = true;
        } catch {
          // keep the first result — normalize() clamps over-limit fields anyway.
        }
      }

      const meta: AiMeta = {
        model: provider.model,
        demo: false,
        prompt: args.prompt,
        tookMs: Date.now() - start,
        provider: provider.model,
        attempts: totalAttempts,
        fellBack: idx > 0,
      };
      if (violations.length > 0) meta.violations = violations;
      if (repaired) meta.repaired = true;
      if (usage) {
        meta.usage = usage;
        meta.estCostUsd = estimateCostUsd(provider.model, usage);
      } else if (provider === claudeProvider) {
        meta.estCostUsd = 0; // dev subscription — no metered cost
      }

      // Persist eval telemetry (cost/latency/usage) that we'd otherwise discard.
      await recordLlmCall({
        toolId,
        promptHash,
        provider: provider.model,
        model: provider.model,
        demo: false,
        tookMs: meta.tookMs,
        attempts: totalAttempts,
        repaired,
        estCostUsd: meta.estCostUsd ?? 0,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        at: new Date().toISOString(),
      });

      return { result: args.normalize(parsed), meta };
    } catch (err) {
      console.error(`[llm] provider ${provider.model} failed:`, err);
      // Fall through to the next configured provider; if this was the last one,
      // the loop ends and we degrade to the demo below.
    }
  }

  // No provider available, or all failed — deterministic demo so the app stays usable.
  const demoMeta: AiMeta = {
    model: dev ? CLAUDE_MODEL : GEMINI_MODEL,
    demo: true,
    prompt: args.prompt,
    tookMs: Date.now() - start,
    fellBack: providers.length > 0,
  };
  await recordLlmCall({
    toolId,
    promptHash,
    provider: demoMeta.model,
    model: demoMeta.model,
    demo: true,
    tookMs: demoMeta.tookMs,
    attempts: 0,
    repaired: false,
    estCostUsd: 0,
    inputTokens: 0,
    outputTokens: 0,
    at: new Date().toISOString(),
  });
  return { result: args.demo(), meta: demoMeta };
}
