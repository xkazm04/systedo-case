/** The `webhook-retry` ledger step: the outbox's BACKSTOP drain. Registered in
 *  src/lib/cron/ledgers.ts — that one line in LEDGER_STEPS is the whole registration
 *  ceremony (no new route, no new `cron-schedules.json` entry, no new guard; see WP F4).
 *
 *  An emit only enqueues and asks `after()` to drain its own rows; this sweep covers
 *  everything that path did not finish: a failed attempt whose backoff came due, an
 *  emit whose post-response drain was cut off by the platform's time limit, and a
 *  `sending` row whose holder died (its lease lapsed — stuck-reaping). One call:
 *  {@link drainDeliveries} over the due set.
 *
 *  Due EVERY tick. There is no per-tenant sent-guard claim because each ROW is
 *  claimed: the drain moves a row `pending → sending` by one conditional write before
 *  sending, so two overlapping invocations (or this tick and an emit's post-response
 *  drain) elect exactly one sender. Delivery stays AT-LEAST-ONCE — a holder that dies
 *  after the receiver answered is re-sent once its lease lapses — which is why the
 *  event id is in the payload AND in `X-Adamant-Delivery`: the receiver's de-dupe
 *  key. Claiming exactly-once here would be a lie.
 *
 *  Bounded per tick ({@link RETRY_BATCH}) so one tenant with a dead endpoint cannot
 *  consume the whole invocation — the shared 300 s budget belongs to every step.
 *  Server-only. */
import "server-only";
import type { LedgerStep, LedgerStepResult } from "@/lib/cron/ledgers";
import { drainDeliveries } from "./drain";
import type { OutboundTransport } from "./send";

/** Deliveries attempted in one tick. Five attempts spread over ~15 h means the
 *  steady-state backlog is small; this caps the pathological case. */
export const RETRY_BATCH = 100;

/** The step id — also the `ledger-webhook-retry` sent-guard kind prefix, the run
 *  record's key, and the namespace its counts are reported under. */
export const WEBHOOK_RETRY_STEP_ID = "webhook-retry";

export const webhookRetryStep: LedgerStep = {
  id: WEBHOOK_RETRY_STEP_ID,
  // Every tick: the backoff lives on each delivery's own `nextAt`, so the step's
  // cadence must be at least as fast as the shortest backoff (1 minute) allows the
  // cron to be. Gating the STEP as well would add a second, redundant clock that
  // could only ever delay a due delivery.
  due: () => true,
  run: (ctx) => runWebhookRetries(ctx.now),
};

/** One tick's work. Never throws — the ledger runner isolates a throw anyway, but a
 *  step that reports `{ ok: false, error }` gives the run record something readable
 *  instead of a stack-trace message. `transport` exists for the tests (the cron has
 *  nothing to inject). */
export async function runWebhookRetries(
  now: Date,
  opts: { transport?: OutboundTransport } = {}
): Promise<LedgerStepResult> {
  return drainDeliveries({ now, limit: RETRY_BATCH, transport: opts.transport });
}
