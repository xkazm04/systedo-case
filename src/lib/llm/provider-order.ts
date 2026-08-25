/** The one place the environment-preferred provider order lives. dev → the
 *  keyless CLI ladder (Claude first, Codex second — both bill the operator's
 *  flat-rate seat, so local iteration costs nothing), prod → Gemini first.
 *  Codex is deliberately dev-only: it shells out to the operator's ChatGPT
 *  login on this machine, which does not exist on the serverless deploy.
 *  Pure and SDK-free — no imports at all — so the client-imported preflight
 *  (`src/lib/ai/status-core.ts`, pulled in by the `"use client"` AiPreflight)
 *  and the server-only wrapper (`src/lib/llm/index.ts`) can share the single
 *  ordering rule without either one dragging a server-only or provider-SDK
 *  dependency into the other's bundle. */
export type ProviderName = "claude" | "codex" | "gemini";

/** The app's own env providers in the order a generation should try them for the
 *  given environment. Prod is exactly the order the LLM wrapper has always used
 *  (no Codex — see above); BYOM precedence (a resolved user key going first) is
 *  layered on by the caller, not encoded here. The demo fallback stays the
 *  floor beneath whatever this returns. */
export function providerOrder(dev: boolean): ProviderName[] {
  return dev ? ["claude", "codex", "gemini"] : ["gemini", "claude"];
}
