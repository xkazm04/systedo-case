/** The one place the environment-preferred provider order lives. dev → Claude
 *  first (fast local iteration on the CLI subscription), prod → Gemini first.
 *  Pure and SDK-free — no imports at all — so the client-imported preflight
 *  (`src/lib/ai/status-core.ts`, pulled in by the `"use client"` AiPreflight)
 *  and the server-only wrapper (`src/lib/llm/index.ts`) can share the single
 *  ordering rule without either one dragging a server-only or provider-SDK
 *  dependency into the other's bundle. */
export type ProviderName = "claude" | "gemini";

/** The app's own env providers in the order a generation should try them for the
 *  given environment. This is exactly the order the LLM wrapper has always used;
 *  BYOM precedence (a resolved user key going first) is layered on by the caller,
 *  not encoded here. */
export function providerOrder(dev: boolean): ProviderName[] {
  return dev ? ["claude", "gemini"] : ["gemini", "claude"];
}
