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
 *  ── What may be persisted ──
 *  An incident's `message` is ALWAYS app-authored copy (see `byomIncidentFor`). The
 *  transient adapters build their `LlmCallError` messages by splicing up to 200
 *  characters of the provider's RAW response body in, so that text is never stored
 *  as the message and never crosses the wire: the only field derived from it is the
 *  operator-only `detail`, which is whitespace-collapsed, stripped of key-shaped
 *  runs and hard-capped here, then dropped entirely by `publicByomConfig`.
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
import {
  BYOM_INCIDENT_DETAIL_CHARS,
  BYOM_INCIDENT_REASONS,
  type ByomKeyIncident,
  type ResolvedByomKey,
} from "./types";

/** Patterns for anything key-shaped, applied before a crumb of an error message is
 *  persisted. Two families:
 *   - known provider key prefixes (`sk-…`, `AIza…`, `ghp_…`), which are short
 *     enough to slip under a generic length rule;
 *   - any long opaque run of base64/hex/token characters, which is what an
 *     accidentally-echoed credential looks like when we don't know its shape.
 *  Czech/English prose and model ids never produce a 24-character unbroken run
 *  (spaces, `.` and `/` break them), so this is a no-op on our own copy. */
const KEY_SHAPED: RegExp[] = [
  /(?:sk|pk|rk|xai|gsk|ghp|hf)[-_][A-Za-z0-9_-]{4,}/gi,
  /AIza[A-Za-z0-9_-]{4,}/g,
  /[A-Za-z0-9_-]{24,}/g,
];

/** Redact key-shaped runs from arbitrary text. Pure/testable, and cheap enough to
 *  run defensively even on strings we believe are app-authored. */
export function redactKeyShaped(text: string): string {
  let out = text;
  for (const re of KEY_SHAPED) out = out.replace(re, "[redigováno]");
  return out;
}

/** The operator-only crumb kept from a failed call: whitespace-collapsed, redacted,
 *  and hard-capped. NEVER the raw message — the adapters splice up to 200 characters
 *  of the provider's response body into their transient messages
 *  (`adapters.ts` byomHttpError / classifyByomResponse), and that must not be
 *  persisted or shipped. Returns undefined when nothing useful survives. */
export function byomIncidentDetail(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const clean = redactKeyShaped(raw.replace(/\s+/g, " ").trim());
  if (!clean) return undefined;
  return clean.length > BYOM_INCIDENT_DETAIL_CHARS
    ? `${clean.slice(0, BYOM_INCIDENT_DETAIL_CHARS - 1)}…`
    : clean;
}

/** Turn a failed BYOM call into an incident. Pure, so the definitive/transient
 *  split is unit-testable without a store. Mirrors `classifyProbeError`'s rule
 *  exactly: ONLY a ByomUserError is definitive; a typed transient failure keeps its
 *  code, and anything unclassified is conservatively transient ("unknown").
 *
 *  `message` is ALWAYS app-authored, never the raw error text:
 *   - definitive → the `ByomUserError` message. Every one of these is built by
 *     `classifyByomHttp` from app constants (it regex-TESTS the response body but
 *     never embeds it), so it is safe actionable copy — and it is what gets stamped
 *     as `lastError`, so it is kept in full rather than capped.
 *   - transient → this app's own BYOM_INCIDENT_REASONS copy for the code. The
 *     underlying `LlmCallError.message` is exactly where the provider's raw body is
 *     spliced in, so it is deliberately NOT used here.
 *  Both are still passed through `redactKeyShaped` as defence in depth: a no-op on
 *  today's strings, but it means a future error path that starts echoing provider
 *  text cannot silently turn into a stored credential. */
export function byomIncidentFor(toolId: string, err: unknown, at = new Date()): ByomKeyIncident {
  const stamp = at.toISOString();

  if (err instanceof ByomUserError) {
    // No `detail`: the message IS the app-authored text, so a crumb of it would be
    // a truncated duplicate rather than extra operator signal.
    return { at: stamp, toolId, code: err.code, message: redactKeyShaped(err.message), definitive: true };
  }
  const code = err instanceof LlmCallError ? err.code : "unknown";
  const detail = byomIncidentDetail(err instanceof Error ? err.message : undefined);
  return {
    at: stamp,
    toolId,
    code,
    message: BYOM_INCIDENT_REASONS.cs[code] ?? BYOM_INCIDENT_REASONS.cs.unknown,
    definitive: false,
    ...(detail ? { detail } : {}),
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
