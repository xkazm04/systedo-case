/** Per-request identity context (who/what a call is for), carried via
 *  AsyncLocalStorage so the chokepoint can attribute telemetry to a user/project
 *  without threading arguments through all 15 tool signatures — the exact pattern
 *  byom-context uses for the provider key. The AI route sets it once per request;
 *  `generateStructured` reads it back when it records an LlmTelemetryEntry. Absent
 *  context (every non-route caller — the LLM gate's real tests, crons) means the
 *  entry simply has no user/project attribution. Server-only. */
import { AsyncLocalStorage } from "node:async_hooks";

export interface LlmRequestContext {
  userId?: string;
  projectId?: string;
}

const store = new AsyncLocalStorage<LlmRequestContext | undefined>();

/** The identity context for the current request, or undefined when none is set. */
export function getLlmRequestContext(): LlmRequestContext | undefined {
  return store.getStore();
}

/** Set the context for the remainder of the current request's async execution —
 *  the callback-free form for a route handler. Each request runs in its own async
 *  context, so this never bleeds into a concurrent request. */
export function enterLlmRequestContext(ctx: LlmRequestContext | undefined): void {
  store.enterWith(ctx);
}
