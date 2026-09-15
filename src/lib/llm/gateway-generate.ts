/** The gateway-served branch of `generateStructured` (server-only). Same contract as the in-app
 *  ladder — schema pruning, the tool's `validate` + ONE self-repair re-prompt, the honest
 *  corrupt/repaired status, the durable Firestore telemetry entry, `normalize` outside the try —
 *  minus the three things the gateway now owns: per-provider retry, cross-provider fallback and
 *  the LightTrack event (lt-gateway records every attempt itself; a mirror from here would be a
 *  second row per call). When the gateway cannot answer at all (every seat on hold, or it is
 *  down) the call degrades straight to the tool's deterministic demo — the app's floor, not
 *  another provider attempt — so a usage limit never turns into a second spend on the same seat. */
import type { AiMeta, AiResponse } from "../ai-types";
import { partitionViolations } from "../ai/tools/_shared";
import { callStatus, looksCorrupt } from "./output-health";
import { languageViolations } from "./language-check";
import { runWithDeadline } from "./deadline";
import { runGateway } from "./gateway";
import type { GenerateArgs } from "./index";
import { addUsage, type TokenUsage } from "./cost";
import { CLAUDE_TIMEOUT_MS, LLM_DEADLINE_MS } from "./models";
import { pruneToSchema } from "./schema-prune";
import { buildRepairNote } from "./repair-note";
import { recordLlmCall, recordLlmErrorEntry } from "./telemetry";

/** Provider tag stamped on gateway-served telemetry. The model field carries the seat target
 *  that actually answered (`anthropic/sonnet@low`, …), read from the gateway's own headers. */
export const GATEWAY_PROVIDER_TAG = "lt-gateway";

export interface GatewayGenerateContext {
  route: string;
  toolId: string;
  promptHash: string;
  attribution: { userId?: string; projectId?: string };
  /** the user prompt with the locale override already applied */
  effectivePrompt: string;
  /** wrapper start time (ms) so `tookMs` spans the whole call, not just the transport */
  start: number;
}

/** The gateway floors its own per-seat timeouts at the CLIs' ceilings; the wrapper deadline here is
 *  the same backstop the CLI providers get, so a route that ends on `claude -p` is never cut short. */
function deadlineMs(tier: GenerateArgs<unknown>["tier"]): number {
  return Math.max(LLM_DEADLINE_MS[tier ?? "quality"], CLAUDE_TIMEOUT_MS);
}

export async function generateViaGateway<T>(
  args: GenerateArgs<T>,
  ctx: GatewayGenerateContext
): Promise<AiResponse<T>> {
  const { route, toolId, promptHash, attribution, effectivePrompt, start } = ctx;
  const call = (prompt: string) =>
    runWithDeadline(
      (signal) => runGateway({ route, system: args.system, prompt, schema: args.schema, signal }),
      deadlineMs(args.tier),
      args.signal
    );

  let success: { parsed: unknown; meta: AiMeta } | null = null;
  try {
    const first = await call(effectivePrompt);
    let parsed = pruneToSchema(first.value, args.schema);
    let usage: TokenUsage | undefined = first.usage;
    let extraction = first.rung;
    let attempts = 1;
    let fellBack = first.fellBack;
    let model = first.servedBy;
    let costUsd = first.costUsd;

    // The tool's own output validation + one repair re-prompt, exactly as the in-app ladder does
    // it: only when a violation genuinely needs the model (a char-limit overrun is clamped for free
    // by normalize()); the note carries the full list either way.
    const toolViolations = args.validate ? args.validate(parsed) : [];
    const violations = [...toolViolations, ...languageViolations(parsed, args.locale)];
    const { clampable, needsModel } = partitionViolations(violations);
    let repaired = false;
    let languageMismatch = violations.length > toolViolations.length;
    if (needsModel.length > 0) {
      try {
        const second = await call(effectivePrompt + buildRepairNote(violations));
        parsed = pruneToSchema(second.value, args.schema);
        usage = addUsage(usage, second.usage);
        extraction = second.rung;
        attempts += 1;
        repaired = true;
        fellBack = fellBack || second.fellBack;
        model = second.servedBy;
        costUsd = costUsd === null && second.costUsd === null ? null : (costUsd ?? 0) + (second.costUsd ?? 0);
        languageMismatch = languageViolations(parsed, args.locale).length > 0;
      } catch {
        // keep the first result — normalize() clamps over-limit fields anyway.
      }
    }

    const status = callStatus(looksCorrupt(parsed, args.schema), repaired);
    const meta: AiMeta = {
      model,
      demo: false,
      prompt: effectivePrompt,
      tookMs: Date.now() - start,
      provider: GATEWAY_PROVIDER_TAG,
      attempts,
      fellBack,
    };
    if (violations.length > 0) meta.violations = violations;
    if (repaired) meta.repaired = true;
    if (!repaired && clampable.length > 0) meta.clamped = clampable;
    if (status !== "success") meta.status = status;
    if (languageMismatch) meta.languageMismatch = true;
    if (extraction) meta.extraction = extraction;
    if (usage) meta.usage = usage;
    // A seat reports no $ (costUsd null) → unpriced, never 0 (`nullable-cost-never-zero`).
    if (costUsd !== null) meta.estCostUsd = costUsd;

    await recordLlmCall(
      {
        toolId,
        promptHash,
        provider: GATEWAY_PROVIDER_TAG,
        model,
        demo: false,
        tookMs: meta.tookMs,
        attempts,
        repaired,
        fellBack,
        status,
        ...(costUsd !== null ? { estCostUsd: costUsd } : { unpriced: true }),
        ...(extraction ? { extraction } : {}),
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        at: new Date().toISOString(),
        ...attribution,
      },
      { mirror: false }
    );
    success = { parsed, meta };
  } catch (err) {
    if (args.signal?.aborted) throw err;
    // Durable record only: the gateway already filed the per-attempt error events in LightTrack.
    const message = err instanceof Error ? err.message : String(err);
    void recordLlmErrorEntry({
      toolId,
      promptHash,
      provider: GATEWAY_PROVIDER_TAG,
      model: route,
      demo: false,
      tookMs: Date.now() - start,
      attempts: 0,
      repaired: false,
      fellBack: false,
      status: "error",
      estCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      at: new Date().toISOString(),
      ...attribution,
    });
    console.error(`[llm] gateway route ${route} failed:`, message);
  }

  if (success) {
    return { result: args.normalize(success.parsed), meta: success.meta };
  }

  const demoMeta: AiMeta = {
    model: route,
    demo: true,
    prompt: effectivePrompt,
    tookMs: Date.now() - start,
    fellBack: true,
  };
  await recordLlmCall(
    {
      toolId,
      promptHash,
      provider: GATEWAY_PROVIDER_TAG,
      model: route,
      demo: true,
      tookMs: demoMeta.tookMs,
      attempts: 0,
      repaired: false,
      status: "demo",
      estCostUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      at: new Date().toISOString(),
      ...attribution,
    },
    { mirror: false }
  );
  return { result: args.demo(), meta: demoMeta };
}
