/** Per-request BYOM context, carried via AsyncLocalStorage so the wrapper can pick
 *  the user's provider without threading a config argument through all 15 tool
 *  signatures. The AI route resolves the caller's active BYOM key once and runs the
 *  tool call inside `runWithByomContext`; `generateStructured` reads it back with
 *  `getByomContext`. Absent context (the default, and every non-route caller like
 *  the LLM gate's real tests) means "no BYOM" → the app's own env providers.
 *  Server-only. */
import { AsyncLocalStorage } from "node:async_hooks";
import type { ResolvedByomKey } from "./keys/types";

const store = new AsyncLocalStorage<ResolvedByomKey | undefined>();

/** Run `fn` with the given BYOM key visible to any `generateStructured` call it
 *  makes. Pass `undefined` to explicitly run without BYOM. */
export function runWithByomContext<T>(byom: ResolvedByomKey | undefined, fn: () => T): T {
  return store.run(byom, fn);
}

/** The active BYOM key for the current request, or undefined when none is set. */
export function getByomContext(): ResolvedByomKey | undefined {
  return store.getStore();
}

/** Set the BYOM context for the remainder of the current request's async
 *  execution — the callback-free form for a route handler that resolves the key
 *  and then dispatches, avoiding wrapping the whole handler body. Each request
 *  runs in its own async context, so this never bleeds into a concurrent request. */
export function enterByomContext(byom: ResolvedByomKey | undefined): void {
  store.enterWith(byom);
}
