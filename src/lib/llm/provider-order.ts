/** The one place the environment-preferred provider order lives. dev → the
 *  keyless CLI ladder (Claude first, Codex second — both bill the operator's
 *  flat-rate seat, so local iteration costs nothing), cloud prod → Gemini first.
 *  Self-hosted prod (docs/open-source/self-hosting.md §4) gets the SAME keyless
 *  ladder as dev: the app runs on the operator's own box, where a Claude/Codex
 *  CLI on a subscription may well exist while a Gemini key may not — demoting
 *  the CLIs behind Gemini there was the documented defect of keying this off
 *  NODE_ENV alone. The order is only a PREFERENCE: the caller filters it by each
 *  provider's availability probe, so what actually serves is always keyed off
 *  the providers that are configured, and the demo fallback stays the floor.
 *  Pure and SDK-free — no imports at all — so the client-imported preflight
 *  (`src/lib/ai/status-core.ts`, pulled in by the `"use client"` AiPreflight)
 *  and the server-only wrapper (`src/lib/llm/index.ts`) can share the single
 *  ordering rule without either one dragging a server-only or provider-SDK
 *  dependency into the other's bundle (which is also why this takes booleans
 *  instead of reading env). */
export type ProviderName = "claude" | "codex" | "gemini";

/** The app's own env providers in the order a generation should try them for the
 *  given mode. Cloud prod is exactly the order the LLM wrapper has always used
 *  (no Codex — it shells out to a local ChatGPT login that does not exist on the
 *  serverless deploy); BYOM precedence (a resolved user key going first) is
 *  layered on by the caller, not encoded here. */
export function providerOrder(dev: boolean, selfHosted = false): ProviderName[] {
  return dev || selfHosted ? ["claude", "codex", "gemini"] : ["gemini", "claude"];
}
