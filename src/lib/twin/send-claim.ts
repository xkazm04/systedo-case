/** The send claim's failure path, made reliable.
 *
 *  `send/route.ts` claims a draft `approved → sent` atomically BEFORE attempting
 *  connector delivery (so a double-click / two tabs can't deliver twice). When the
 *  connector then throws, that optimistic claim must be reverted — and the revert
 *  used to be a single fire-and-forget `.catch(() => {})`: one store hiccup
 *  stranded a draft permanently marked `sent` that never left the building, the
 *  exact lie the audit trail exists to prevent.
 *
 *  `retryRevert` bounds that risk: the revert is attempted up to `attempts` times,
 *  each failure reported to `onError`, and the final outcome is returned so the
 *  caller can log a stranded claim LOUDLY instead of swallowing it. Pure control
 *  flow (no store import) so it unit-tests without a backend. */

/** Default number of revert attempts before giving up and reporting a strand. */
export const REVERT_ATTEMPTS = 3;

/** Run `revert` until it resolves, up to `attempts` times. Returns true when the
 *  revert landed, false when every attempt failed (the caller must then surface
 *  the stranded claim — never ignore a false). */
export async function retryRevert(
  revert: () => Promise<unknown>,
  attempts: number = REVERT_ATTEMPTS,
  onError?: (err: unknown, attempt: number) => void
): Promise<boolean> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await revert();
      return true;
    } catch (err) {
      onError?.(err, attempt);
    }
  }
  return false;
}
