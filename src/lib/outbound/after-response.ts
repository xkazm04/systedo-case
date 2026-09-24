/** The outbound bus's ONE post-response seam: run a task after the current response
 *  via `after()` from next/server, or detached when there is no request to follow.
 *  Server-only.
 *
 *  Why a module of its own: `after()` throws outside a request scope (a unit test, a
 *  script, a CLI importing the store), and a plain node run cannot even resolve the
 *  bare `next/server` specifier. The dynamic import + the detached fallback live here
 *  once, so the emit path stays testable and a caller outside Next still gets its
 *  delivery attempted rather than silently dropped.
 *
 *  Honest about what `after()` buys: the callback still runs inside the SAME function
 *  invocation and its `maxDuration` — it moves the sends off the caller's await, it
 *  does not buy them extra time. Work cut off by the platform limit is not lost: the
 *  rows are durable `pending` (or lease-dated `sending`) and the `webhook-retry`
 *  ledger step sweeps them. */
import "server-only";

export type AfterMode = "after" | "detached";

export async function scheduleAfterResponse(task: () => Promise<unknown>): Promise<AfterMode> {
  const run = () =>
    task().catch((err) => {
      console.error("[outbound] post-response task failed:", err);
    });
  try {
    const { after } = await import("next/server");
    after(run);
    return "after";
  } catch {
    // No request scope (or no Next runtime at all): start it now, unawaited.
    void run();
    return "detached";
  }
}
