/** Wrapper-level deadlines. Only the Claude CLI ever had a timeout (its own 150s);
 *  the Gemini SDK and the BYOM HTTP fetches had none, so a hung provider could pin
 *  a process-wide concurrency slot indefinitely. This composes the caller's abort
 *  signal with a per-tier deadline (AbortSignal.timeout) into ONE signal every
 *  provider already threads into its transport, and translates the resulting abort
 *  into a typed LlmCallError: a deadline fire → `timeout` (retryable, normal
 *  fallback), a caller abort → `aborted` (non-retryable, no fallback, no demo).
 *
 *  Happy-path safety: the Claude provider's deadline floor is its own 150s timeout
 *  (see index.ts), so composing a deadline never SHORTENS the CLI path — the outer
 *  deadline only ever bounds a provider that otherwise had no timeout at all.
 *  Server-only, but framework-free so it is unit-testable in isolation. */
import { isAbortLikeError, isTimeoutAbort, LlmCallError } from "./errors";

/** Compose the caller's abort signal with a fresh per-call deadline. Returns the
 *  composed signal (handed to the provider) plus the deadline signal itself, so a
 *  deadline fire can be told apart from a caller abort when classifying. */
export function withDeadline(
  caller: AbortSignal | undefined,
  deadlineMs: number
): { signal: AbortSignal; deadline: AbortSignal } {
  const deadline = AbortSignal.timeout(deadlineMs);
  const signal = caller ? AbortSignal.any([caller, deadline]) : deadline;
  return { signal, deadline };
}

/** Map a provider-call rejection to a typed LlmCallError. Already-typed errors
 *  pass through unchanged (the Claude path classifies its own aborts). A raw abort
 *  rejection becomes `timeout` when the deadline fired, else `aborted`. A bare
 *  fetch transport failure (TypeError) becomes `network` (retryable). */
export function classifyProviderError(
  err: unknown,
  caller: AbortSignal | undefined,
  deadline: AbortSignal,
  deadlineMs: number
): unknown {
  if (err instanceof LlmCallError) return err;
  if (isAbortLikeError(err) || caller?.aborted || deadline.aborted) {
    // A caller abort wins the classification even if the deadline also elapsed —
    // the caller is gone, so it must stay non-retryable.
    if (caller?.aborted && !isTimeoutAbort((caller as AbortSignal).reason)) {
      return new LlmCallError("aborted", "Požadavek byl zrušen klientem.", {});
    }
    if (deadline.aborted || isTimeoutAbort(err)) {
      return new LlmCallError("timeout", `Poskytovatel překročil časový limit ${deadlineMs} ms.`, {});
    }
    return new LlmCallError("aborted", "Požadavek byl přerušen.", {});
  }
  // A raw fetch failure (DNS, connection reset) rejects with a TypeError — a
  // transport fault worth a bounded retry.
  if (err instanceof TypeError) {
    return new LlmCallError("network", `Chyba spojení s poskytovatelem: ${err.message}`, { cause: err });
  }
  return err;
}

/** Run one provider operation under a composed deadline, re-throwing a typed
 *  LlmCallError on abort/timeout/transport failure. */
export async function runWithDeadline<T>(
  op: (signal: AbortSignal) => Promise<T>,
  deadlineMs: number,
  caller?: AbortSignal
): Promise<T> {
  const { signal, deadline } = withDeadline(caller, deadlineMs);
  try {
    return await op(signal);
  } catch (err) {
    throw classifyProviderError(err, caller, deadline, deadlineMs);
  }
}
