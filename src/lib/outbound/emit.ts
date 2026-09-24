/** The emit side of the outbound bus: turn one thing that happened into signed,
 *  logged, retryable deliveries to a project's own webhook endpoints. Server-only.
 *
 *  THE ONE RULE this module exists to keep: an emit is BEST-EFFORT and must never
 *  fail — or even slow down — the alert, digest or report that triggered it. Every
 *  store read and write is inside a try/catch, and the function resolves with counts
 *  instead of throwing.
 *
 *  An emit is an OUTBOX append, not a send: one config read and at most
 *  MAX_ENDPOINTS row writes, cheap enough that every call site AWAITS it — so the
 *  durable `pending` row exists before the caller moves on (a `void` emit could lose
 *  the event, row and all, when the function froze after its response). The network
 *  work is handed to ./drain.ts via `after()` (./after-response.ts): it runs once
 *  the response is sent, still inside the same invocation and its time limit, and
 *  anything it does not finish is swept by the `webhook-retry` ledger step. A caller's
 *  cron budget is therefore never spent waiting on another party's receiver.
 *
 *  Ordering, stated once: the durable record lands FIRST (recordAlert / the report's
 *  claim), the outbound event second. A crash between them costs an event, not an
 *  alert — and an alert nobody can see is the unrecoverable failure, an event nobody
 *  received is not (the log shows it as pending and the cron retries). */
import "server-only";
import { randomUUID } from "node:crypto";
import { buildTenantKey } from "@/lib/campaigns/store-keys";
import { getWebhookConfig, listUserWebhookConfigs } from "./config-store";
import { appendDelivery } from "./delivery-store";
import { scheduleAfterResponse } from "./after-response";
import { drainDeliveries } from "./drain";
import type { OutboundTransport } from "./send";
import {
  endpointsFor,
  serializeEvent,
  type Delivery,
  type OutboundEvent,
  type OutboundEventInput,
} from "./types";

/** What one emit did. `matched` counts the endpoints subscribed to the type;
 *  `delivered` + `pending` account for every row written, so a cron can report the
 *  outcome without reading the log back. Outside inline mode `delivered` is 0: the
 *  sends have not happened yet when the emit returns. */
export interface EmitResult {
  eventId: string | null;
  matched: number;
  delivered: number;
  pending: number;
}

const NOTHING: EmitResult = { eventId: null, matched: 0, delivered: 0, pending: 0 };

/** The transport is injected so the signing, logging and backoff logic is exercised
 *  without a socket, and the clock so the scheduled `nextAt` is asserted exactly.
 *  `inline` drains THIS emit's rows in-request instead of after the response — the
 *  test-send route's mode, where the owner is waiting for the answer. */
export interface EmitOptions {
  transport?: OutboundTransport;
  now?: Date;
  inline?: boolean;
}

/** Emit one event to every endpoint of `projectId` subscribed to its type: append
 *  one `pending` row per endpoint, then drain them after the response (or now, in
 *  inline mode). Awaited at every call site; never throws. */
export async function emitOutbound(
  userId: string,
  projectId: string,
  input: OutboundEventInput,
  opts: EmitOptions = {}
): Promise<EmitResult> {
  const now = opts.now ?? new Date();
  try {
    const cfg = await getWebhookConfig(userId, projectId);
    const targets = endpointsFor(cfg, input.type);
    if (targets.length === 0) return NOTHING;

    // id/at/projectId are stamped HERE, never taken from the caller: an emit point
    // cannot mint an event id that collides with another project's, and the
    // receiver's replay key is ours to guarantee unique.
    const event: OutboundEvent = {
      id: randomUUID(),
      at: now.toISOString(),
      projectId,
      ...input,
    };
    const payload = serializeEvent(event);

    const queued: Delivery[] = [];
    for (const endpoint of targets) {
      const delivery: Delivery = {
        id: randomUUID(),
        userId,
        projectId,
        endpointId: endpoint.id,
        eventId: event.id,
        type: event.type,
        status: "pending",
        attempts: 0,
        nextAt: now.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        payload,
      };
      try {
        // The log row IS the queue entry: once it lands, the event survives this
        // function freezing — the post-response drain or the ledger sweep sends it.
        await appendDelivery(delivery);
        queued.push(delivery);
      } catch (err) {
        console.error(`[outbound] delivery log write failed for ${projectId}:`, err);
      }
    }
    if (queued.length === 0) return { eventId: event.id, matched: targets.length, delivered: 0, pending: 0 };

    const drain = () =>
      drainDeliveries({ candidates: queued, transport: opts.transport, now: opts.now, stamp: true });
    if (opts.inline) {
      const { counts } = await drain();
      return {
        eventId: event.id,
        matched: targets.length,
        delivered: counts.delivered,
        pending: queued.length - counts.delivered,
      };
    }
    await scheduleAfterResponse(drain);
    return { eventId: event.id, matched: targets.length, delivered: 0, pending: queued.length };
  } catch (err) {
    console.error(`[outbound] emit failed for ${userId}/${projectId}:`, err);
    return NOTHING;
  }
}

/** Emit from a call site that holds a TENANT key rather than a projectId — the two
 *  campaign alert paths (`evaluateAndAlert`, `evaluateAnomalyAlerts`) take
 *  `(tenant, userId)` and their caller (campaigns/sync.ts) is outside this WP's write
 *  set, so widening their signatures was not an option.
 *
 *  The inverse is resolved against the user's OWN stored webhook configs, not against
 *  their project list: the common case (no endpoints registered) costs one bounded
 *  read and returns, and the match is exact rather than a lossy parse of the tenant
 *  string. A tenant is `buildTenantKey(userId, projectId)` optionally followed by
 *  `_{customerId}` (ADR-0010's per-account tenants), so a configured project matches
 *  when its key IS the tenant or is its prefix; the LONGEST such key wins, which is
 *  what disambiguates a project id that happens to be a prefix of another's. */
export async function emitOutboundForTenant(
  userId: string,
  tenant: string,
  input: OutboundEventInput,
  opts: EmitOptions = {}
): Promise<EmitResult> {
  try {
    const configs = await listUserWebhookConfigs(userId);
    const projectId = matchTenantProject(userId, tenant, configs.map((c) => c.projectId));
    if (!projectId) return NOTHING;
    return await emitOutbound(userId, projectId, input, opts);
  } catch (err) {
    console.error(`[outbound] tenant emit failed for ${userId}/${tenant}:`, err);
    return NOTHING;
  }
}

/** Which of `projectIds` this tenant key belongs to, or null. PURE — the resolution
 *  rule above, testable without a store. */
export function matchTenantProject(
  userId: string,
  tenant: string,
  projectIds: readonly string[]
): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const projectId of projectIds) {
    const key = buildTenantKey(userId, projectId);
    if (tenant !== key && !tenant.startsWith(`${key}_`)) continue;
    if (key.length > bestLen) {
      best = projectId;
      bestLen = key.length;
    }
  }
  return best;
}
