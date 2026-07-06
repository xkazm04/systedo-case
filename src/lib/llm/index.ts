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
import type { SupportedLocale } from "../format";
import { claudeAvailable, runClaude } from "./claude";
import { geminiAvailable, runGemini } from "./gemini";
import { estimateCostUsd, type TokenUsage } from "./cost";
import { byomModel, claudeModelTag, geminiModelTag, type ModelTier } from "./models";
import { promptFingerprint, recordLlmCall } from "./telemetry";
import { runByom } from "./byom/adapters";
import { getByomContext } from "./byom-context";
import { ByomUserError } from "./errors";
import type { ResolvedByomKey } from "./keys/types";

export {
  APP_MODEL,
  CLAUDE_MODEL,
  CLAUDE_MODEL_FAST,
  GEMINI_MODEL,
  GEMINI_MODEL_FAST,
  type ModelTier,
} from "./models";

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
  /** Output language for the generated content. Defaults to Czech (cs). For other
   *  locales a language-override line is appended to the *prompt* (not the system
   *  prompt) so the model writes in that language — the fingerprint (system +
   *  schema) is unchanged, so the LLM golden/coverage gate is unaffected. */
  locale?: SupportedLocale;
  /** Model tier for this call. Defaults to "quality" (full-strength model);
   *  light tools opt into "fast" (haiku-class CLI alias in dev, flash-lite-class
   *  Gemini in prod) for lower latency and token rates. The stamped `meta.model`
   *  always reports the tier-resolved model that actually served the call. */
  tier?: ModelTier;
  /** Client abort propagation. When the caller's request is aborted (client
   *  timeout, re-run, closed tab), the in-flight provider work stops — the
   *  Claude CLI child is killed and the Gemini SDK request is cancelled —
   *  instead of holding one of the few process-wide concurrency slots for
   *  output nobody will read. An abort is non-retryable, never falls over to
   *  another provider, and never degrades to the demo. */
  signal?: AbortSignal;
}

/** Append an authoritative language directive for non-default locales so the AI
 *  output follows the user's chosen locale, overriding the Czech system prompt.
 *  For `cs` (the default) the prompt is returned unchanged. */
function withLanguage(prompt: string, locale?: SupportedLocale): string {
  if (!locale || locale === "cs") return prompt;
  const lang = locale === "en" ? "English" : locale;
  return (
    `${prompt}\n\n--- LANGUAGE OVERRIDE ---\n` +
    `Write the ENTIRE response — every field and every string value — in ${lang}. ` +
    `This instruction overrides any earlier instruction to write in Czech.`
  );
}

interface ProviderCall {
  system: string;
  prompt: string;
  schema: object;
  temperature?: number;
  tier?: ModelTier;
  signal?: AbortSignal;
}

/** One LLM provider behind a uniform run() returning parsed JSON + optional
 *  usage. `modelFor` resolves the tier-appropriate model tag, so the envelope
 *  telemetry always names the model that actually served the call. */
interface Provider {
  modelFor: (tier?: ModelTier) => string;
  available: () => boolean;
  run: (call: ProviderCall) => Promise<{ parsed: unknown; usage?: TokenUsage }>;
}

const claudeProvider: Provider = {
  modelFor: claudeModelTag,
  available: claudeAvailable,
  // Claude runs on the dev subscription — no metered token usage to report.
  run: async (c) => ({
    parsed: await runClaude({ system: c.system, prompt: c.prompt, schema: c.schema, tier: c.tier, signal: c.signal }),
    usage: undefined,
  }),
};

const geminiProvider: Provider = {
  modelFor: geminiModelTag,
  available: geminiAvailable,
  run: (c) => runGemini(c),
};

/** A Provider backed by the caller's OWN API key (BYOM). Always "available" — it
 *  is only built when a key has been resolved — and `modelFor` reports the user's
 *  chosen (or the vendor-default) model so the envelope + telemetry name what
 *  actually served the call. */
function byomProvider(byom: ResolvedByomKey): Provider {
  return {
    modelFor: (tier) => byomModel(byom.vendor, tier, byom.model, byom.fastModel),
    available: () => true,
    run: (c) =>
      runByom(byom, {
        system: c.system,
        prompt: c.prompt,
        schema: c.schema,
        temperature: c.temperature,
        tier: c.tier,
        signal: c.signal,
        reasoning: byom.reasoning,
      }),
  };
}

/** The ordered provider list for a request. When a BYOM key is set it goes FIRST;
 *  the app's own env providers follow as the recoverable-fallback tail — reached
 *  only when a BYOM call fails through OUR fault (a user fault throws a
 *  ByomUserError and never reaches them). Without BYOM this is exactly the
 *  environment-preferred order the app has always used. */
export function resolveProviders(dev: boolean, byom: ResolvedByomKey | undefined): Provider[] {
  const env = (dev ? [claudeProvider, geminiProvider] : [geminiProvider, claudeProvider]).filter((p) =>
    p.available()
  );
  return byom ? [byomProvider(byom), ...env] : env;
}

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
      // A client abort is a deliberate stop — retrying would keep burning the
      // provider for a caller that is already gone.
      if (i < attempts && isRetryable(err) && !call.signal?.aborted) {
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

  // BYOM (when the request carries a resolved key) goes first, with the app's env
  // providers as the recoverable-fallback tail; absent BYOM this is today's order.
  const byom = getByomContext();
  const providers = resolveProviders(dev, byom);

  // The locale override goes on the PROMPT, never the system prompt, so the
  // fingerprint (system + schema) — and the golden/coverage gate — is unchanged.
  const effectivePrompt = withLanguage(args.prompt, args.locale);
  const baseCall: ProviderCall = {
    system: args.system,
    prompt: effectivePrompt,
    schema: args.schema,
    temperature: args.temperature,
    tier: args.tier,
    signal: args.signal,
  };

  for (let idx = 0; idx < providers.length; idx++) {
    const provider = providers[idx];
    const model = provider.modelFor(args.tier);
    try {
      // 3 bounded attempts on recoverable errors: the dev CLI intermittently
      // emits unparseable JSON (observed ~1-in-7 calls under model variance),
      // and two attempts made a 14-tool proving run a coin flip. Non-retryable
      // failures still throw on the first attempt.
      const first = await runWithRetry(provider, baseCall, 3);
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
            { ...baseCall, prompt: effectivePrompt + buildRepairNote(violations) },
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
        model,
        demo: false,
        prompt: effectivePrompt,
        tookMs: Date.now() - start,
        provider: model,
        attempts: totalAttempts,
        fellBack: idx > 0,
      };
      if (violations.length > 0) meta.violations = violations;
      if (repaired) meta.repaired = true;
      if (usage) {
        meta.usage = usage;
        meta.estCostUsd = estimateCostUsd(model, usage);
      } else if (provider === claudeProvider) {
        meta.estCostUsd = 0; // dev subscription — no metered cost
      }

      // Persist eval telemetry (cost/latency/usage) that we'd otherwise discard.
      await recordLlmCall({
        toolId,
        promptHash,
        provider: model,
        model,
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
      // A client abort is a deliberate stop: no cross-provider fallback, no
      // demo degradation — surface it so the route ends quietly (client gone).
      if (args.signal?.aborted) throw err;
      // A BYOM user fault (bad/expired key, their account out of credit, a model
      // they picked that isn't available) is theirs to fix — surface it instead of
      // silently falling back to the app's own paid provider or the demo.
      if (err instanceof ByomUserError) throw err;
      console.error(`[llm] provider ${model} failed:`, err);
      // Fall through to the next configured provider; if this was the last one,
      // the loop ends and we degrade to the demo below.
    }
  }

  // No provider available, or all failed — deterministic demo so the app stays usable.
  const demoMeta: AiMeta = {
    model: (dev ? claudeProvider : geminiProvider).modelFor(args.tier),
    demo: true,
    prompt: effectivePrompt,
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
