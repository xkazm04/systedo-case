/** BYOM error classification. When a call is served by the user's own provider
 *  key, we must decide — from the provider's response — whether a failure is the
 *  USER's responsibility (bad/expired key, their account out of credit, an
 *  unavailable model they picked) or OURS (a request we malformed, a provider
 *  outage). User faults surface to the user so they can fix them; our faults fall
 *  through to the app's own provider (the recoverable path in generateStructured).
 *  Server-only concern, but framework-free so it can be unit-tested in isolation. */

export type ByomUserErrorCode = "auth" | "permission" | "quota" | "model" | "invalid";

/** Classification of a provider-call failure, decoupled from the (Czech, display)
 *  error message. The wrapper's retry/fallback decision reads the CODE, never the
 *  wording — so a reworded or English provider error is classified the same as the
 *  Czech one it replaces, and a genuinely-transient failure always retries.
 *
 *    timeout         a deadline (wrapper or provider) fired
 *    empty           the model returned no content
 *    malformed_json  content came back but did not parse as the expected JSON
 *    rate_limited    HTTP 429 / provider throttle (carries retryAfterMs when the
 *                    provider sent a Retry-After header)
 *    server          provider-side / transient failure (5xx, non-zero CLI exit)
 *    network         the transport itself failed (fetch reject, DNS, reset)
 *    safety_blocked  a content-safety refusal — re-prompting the same input won't
 *                    help, so it is NOT retried (but still falls to another provider)
 *    aborted         the caller aborted — a deliberate stop, never retried/fallen-back
 *    unknown         an unclassified failure — conservatively NOT retried */
export type LlmErrorCode =
  | "timeout"
  | "empty"
  | "malformed_json"
  | "rate_limited"
  | "server"
  | "network"
  | "safety_blocked"
  | "aborted"
  | "unknown";

/** Codes worth a bounded retry on the SAME provider. `safety_blocked`, `aborted`
 *  and `unknown` are deliberately absent: re-running them just burns the provider. */
const RETRYABLE_CODES: ReadonlySet<LlmErrorCode> = new Set<LlmErrorCode>([
  "timeout",
  "empty",
  "malformed_json",
  "rate_limited",
  "server",
  "network",
]);

export interface LlmCallErrorOptions {
  /** the provider/model tag that produced the failure (diagnostics) */
  provider?: string;
  /** the HTTP status, when the failure came from an HTTP provider */
  status?: number;
  /** honored backoff from a Retry-After header (ms), when the provider sent one */
  retryAfterMs?: number;
  cause?: unknown;
}

/** A typed provider-call failure. Every provider path (Claude CLI, Gemini SDK, the
 *  BYOM HTTP adapters) throws or wraps one of these, so the wrapper decides retry
 *  and cross-provider fallback from `code` alone. The `message` stays the existing
 *  human-readable (Czech) text — it is display/log copy, not a decision input. */
export class LlmCallError extends Error {
  readonly code: LlmErrorCode;
  readonly provider?: string;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(code: LlmErrorCode, message: string, opts: LlmCallErrorOptions = {}) {
    super(message);
    this.name = "LlmCallError";
    this.code = code;
    this.provider = opts.provider;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }

  /** Whether re-running the same call on the same provider is worthwhile. */
  get retryable(): boolean {
    return RETRYABLE_CODES.has(this.code);
  }
}

/** The wrapper's retry gate: only a typed, retryable-coded failure is retried.
 *  Anything else (a plain Error, an app/mapper bug, a user fault) is not — the old
 *  Czech-substring match is gone from the decision path. */
export function isRetryableLlmError(err: unknown): boolean {
  return err instanceof LlmCallError && err.retryable;
}

/** Name of an abort/DOMException reason, duck-typed (a DOMException is not an
 *  Error subclass in every runtime, but always carries a `.name`). */
function reasonName(reason: unknown): string | undefined {
  return reason && typeof reason === "object" && "name" in reason ? String((reason as { name: unknown }).name) : undefined;
}

/** True when an abort was caused by an `AbortSignal.timeout` deadline (its reason
 *  is a `TimeoutError`), as opposed to a caller-initiated `abort()`. Lets the
 *  wrapper tell a deadline fire (timeout → retryable) apart from a caller abort
 *  (aborted → non-retryable) even though both arrive through one composed signal. */
export function isTimeoutAbort(reason: unknown): boolean {
  return reasonName(reason) === "TimeoutError";
}

/** True for any abort-shaped error (a fetch/SDK rejection when its signal aborts). */
export function isAbortLikeError(err: unknown): boolean {
  const name = reasonName(err);
  return name === "AbortError" || name === "TimeoutError";
}

/** Parse a Retry-After header value (delta-seconds or an HTTP-date) to milliseconds;
 *  `undefined` when the header is absent or unparseable. Never negative. Accepts a
 *  Headers-like object (guards `.get` so a test/stub without headers is a no-op). */
export function parseRetryAfterMs(headers: { get?: (name: string) => string | null } | undefined): number | undefined {
  const raw = headers?.get?.("retry-after");
  if (!raw) return undefined;
  const secs = Number(raw);
  let ms: number;
  if (Number.isFinite(secs)) {
    ms = secs * 1000;
  } else {
    const when = Date.parse(raw);
    if (Number.isNaN(when)) return undefined;
    ms = when - Date.now();
  }
  return ms > 0 ? ms : 0;
}

/** Thrown by a BYOM adapter when the failure is the user's to fix. The wrapper
 *  re-throws it instead of falling back, and the route maps `code` to an AiError
 *  so the client can render an actionable message (fix key / top up / pick a
 *  different model) rather than silently degrading. */
export class ByomUserError extends Error {
  readonly code: ByomUserErrorCode;
  readonly vendor: string;
  readonly status?: number;

  constructor(code: ByomUserErrorCode, vendor: string, message: string, status?: number) {
    super(message);
    this.name = "ByomUserError";
    this.code = code;
    this.vendor = vendor;
    this.status = status;
  }
}

/** Map a BYOM provider's HTTP status (+ optional body text) to a user-fault
 *  error, or `null` when the failure is recoverable and generation should fall
 *  through to the app's own provider. Kept deliberately conservative: only the
 *  statuses that clearly indicate the user's key/account/model choice are user
 *  faults; a bare 400 is treated as our malformed request unless the body names
 *  the model (some vendors reject an unavailable model with 400, not 404). */
/** A 429 body that names exhausted quota/credit/billing is a real user fault (top
 *  up); a bare 429 (or one that just says "rate limited"/"too many requests") is a
 *  transient throttle we should retry, not a hard error. */
const BYOM_QUOTA_EXHAUSTED = /quota|credit|billing|insufficient|exceeded|balance|out of/i;

export function classifyByomHttp(
  vendor: string,
  status: number,
  bodyText = ""
): ByomUserError | null {
  switch (status) {
    case 401:
      return new ByomUserError("auth", vendor, `Neplatný nebo chybějící API klíč (${vendor}).`, status);
    case 403:
      return new ByomUserError("permission", vendor, `Klíč (${vendor}) nemá oprávnění k tomuto modelu.`, status);
    case 402:
      return new ByomUserError("quota", vendor, `Účet u ${vendor} nemá dostatečný kredit.`, status);
    case 429:
      // A 429 conflates two very different conditions: "slow down for a second"
      // (transient throttle — retryable, often with Retry-After) and "you are out of
      // credit" (a real user fault). Only treat it as a user quota fault when the body
      // names exhausted quota/credit/billing; otherwise return null so the recoverable
      // path applies (the adapter honors any Retry-After with bounded backoff, else a
      // retryable server error), instead of a hard "top up your account" dead end. See
      // the deliberate 402 case above for the unambiguous exhausted-credit signal.
      if (BYOM_QUOTA_EXHAUSTED.test(bodyText)) {
        return new ByomUserError("quota", vendor, `Vyčerpán limit nebo kredit vašeho účtu u ${vendor}.`, status);
      }
      return null; // transient throttle — recoverable (retry/backoff/fallback)
    case 404:
      return new ByomUserError("model", vendor, `Zvolený model není u ${vendor} dostupný.`, status);
    case 400:
      if (/\bmodel\b/i.test(bodyText)) {
        return new ByomUserError("model", vendor, `Zvolený model není u ${vendor} dostupný.`, status);
      }
      return null; // otherwise our request/schema — recoverable
    default:
      return null; // 5xx and everything else — recoverable (provider-side / transient)
  }
}
