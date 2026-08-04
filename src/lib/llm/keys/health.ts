/** Key health learned from REAL use — "the app tells you when your key stopped
 *  working", without ever asking the provider an extra question. Server-only.
 *
 *  A BYOM key was previously only ever re-checked when the user happened to press
 *  "test". Between an upstream revocation and that manual probe, every generation
 *  quietly fell back to the app's own provider (or hard-failed) while the settings
 *  UI still showed the key as fine. Every signal needed already existed and was
 *  simply thrown away: the BYOM dispatch throws a `ByomUserError` for a definitive
 *  user fault and an `LlmCallError` (or a plain Error) for an inconclusive one. This
 *  module is the ~zero-cost observer that turns those throws into stored key health.
 *
 *  NO EXTRA PROVIDER CALL is made anywhere in here: it only reads an error object
 *  that a call which ALREADY failed produced.
 *
 *  ── Why this can never fail or slow a generation ──
 *  `reportByomCallFailure` is synchronous and returns immediately: it classifies in
 *  memory, then fires the store write WITHOUT awaiting it (`void … .catch()`), so
 *  the caller's `throw` continues on the same tick. Its whole body is wrapped in
 *  try/catch and the detached promise has its own `.catch`, so neither a store
 *  outage nor a bug in here can turn into an unhandled rejection or a thrown error
 *  on the generation path. It is also only ever reached in a catch block — the
 *  happy path never touches it. */
import "server-only";
import { ByomUserError, LlmCallError } from "../errors";
import { recordByomKeyFailure } from "./store";
import type { ByomKeyIncident, ResolvedByomKey } from "./types";

/** Turn a failed BYOM call into an incident. Pure, so the definitive/transient
 *  split is unit-testable without a store. Mirrors `classifyProbeError`'s rule
 *  exactly: ONLY a ByomUserError is definitive; a typed transient failure keeps its
 *  code, and anything unclassified is conservatively transient ("unknown"). */
export function byomIncidentFor(toolId: string, err: unknown, at = new Date()): ByomKeyIncident {
  const stamp = at.toISOString();
  if (err instanceof ByomUserError) {
    return { at: stamp, toolId, code: err.code, message: err.message, definitive: true };
  }
  if (err instanceof LlmCallError) {
    return { at: stamp, toolId, code: err.code, message: err.message, definitive: false };
  }
  return {
    at: stamp,
    toolId,
    code: "unknown",
    message: err instanceof Error ? err.message : "Volání poskytovatele selhalo.",
    definitive: false,
  };
}

/** Best-effort, fire-and-forget write-back of one failed BYOM call.
 *
 *  A no-op unless the key carries an `owner` — i.e. it was resolved for a real
 *  generation by `enterByomForOperation`. The "test connection" probe resolves a
 *  bare key with no owner, so this never double-writes over `markByomValidation`'s
 *  own verdict.
 *
 *  Never awaited, never throws. See the module docblock. */
export function reportByomCallFailure(byom: ResolvedByomKey, err: unknown): void {
  try {
    const owner = byom.owner;
    if (!owner) return;
    const incident = byomIncidentFor(owner.toolId, err);
    void recordByomKeyFailure(owner.userId, byom.vendor, incident).catch((e) => {
      // A health note failing must never surface anywhere near the user's request.
      console.error(`[byom] recording ${byom.vendor} key health failed:`, e);
    });
  } catch (e) {
    console.error("[byom] key-health write-back threw (ignored):", e);
  }
}
