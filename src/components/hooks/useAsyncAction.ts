"use client";

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

/** Options for a single {@link AsyncActionState.run} call. */
interface RunOptions {
  /** Message stored in `error` when the action throws (network / parse failure).
   *  Omit to swallow throws silently — matches call sites whose `catch` is a
   *  no-op (e.g. a "take offline" button that never surfaces an error). */
  serverError?: string;
  /** Extra work to run in the same `finally` as clearing the busy flag, so it
   *  batches with `busy → false` (e.g. resetting a per-item confirm state). */
  onSettled?: () => void;
}

export interface AsyncActionState {
  /** True while an action is in flight — bind to a button's `disabled`. */
  busy: boolean;
  /** The last surfaced error message, or `null`. Cleared at the start of the
   *  next `run`. */
  error: string | null;
  /** Set a response-derived error from inside the action (the `!res.ok` branch),
   *  where the message comes from the parsed body rather than the thrown catch. */
  setError: Dispatch<SetStateAction<string | null>>;
  /** Run an async action with the shared busy/error envelope: flip `busy` on,
   *  clear `error`, await `fn`, store `serverError` if it throws, and flip `busy`
   *  off in `finally`. Returns `fn`'s result, or `undefined` if it threw. */
  run: <T>(fn: () => Promise<T>, opts?: RunOptions) => Promise<T | undefined>;
}

/** The hand-copied `setBusy(true) → setError(null) → try { … } catch { setError }
 *  → finally { setBusy(false) }` fetch-action skeleton, factored into one place.
 *
 *  Owns a single boolean busy flag and one error string, so it fits call sites
 *  with exactly one action in flight at a time (a save/publish/share button).
 *  It is deliberately NOT for per-row/per-key busy (where `busy` holds an id to
 *  disable one row) — those keep their own keyed state.
 *
 *  The action's own `!res.ok` handling stays in `fn` (it reads the parsed body
 *  and calls `setError`); the hook only owns the busy flag, the pre-run clear,
 *  and the network-failure `catch`. Client-only — imports nothing server-side. */
export function useAsyncAction(): AsyncActionState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, opts?: RunOptions): Promise<T | undefined> => {
      setBusy(true);
      setError(null);
      try {
        return await fn();
      } catch {
        if (opts?.serverError !== undefined) setError(opts.serverError);
        return undefined;
      } finally {
        setBusy(false);
        opts?.onSettled?.();
      }
    },
    []
  );

  return { busy, error, setError, run };
}
