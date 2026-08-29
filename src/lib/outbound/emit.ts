/** The emit side of the outbound bus: turn one thing that happened into signed,
 *  logged, retryable deliveries to a project's own webhook endpoints. Server-only.
 *
 *  THE ONE RULE this module exists to keep: an emit is BEST-EFFORT and must never
 *  fail — or even slow down — the alert, digest or report that triggered it. Every
 *  store read, every send and every status write is inside a try/catch, and the
 *  function resolves with counts instead of throwing. The five call sites are
 *  therefore one line each, in the same best-effort position `sendWebhook` already
 *  occupies (after the durable in-app record, never before it).
 *
 *  Ordering, stated once: the durable record lands FIRST (recordAlert / the report's
 *  claim), the outbound event second. A crash between them costs an event, not an
 *  alert — and an alert nobody can see is the unrecoverable failure, an event nobody
 *  received is not (the log shows it as pending and the cron retries).
 *
 *  Each delivery is attempted ONCE inline, so a healthy receiver sees the event
 *  within milliseconds and no cron tick is needed for the common case. A failure
 *  schedules the first retry (`nextAt = now + backoffMs(1)`) and hands off to the
 *  `webhook-retry` ledger step. */
import "server-only";
import { randomUUID } from "node:crypto";
import { buildTenantKey } from "@/lib/campaigns/store-keys";
import {
  getWebhookConfig,
  listUserWebhookConfigs,
  saveWebhookConfig,
} from "./config-store";
import { appendDelivery, updateDelivery } from "./delivery-store";
import { decryptSecret } from "./secret-crypto";
import { postGuarded, type OutboundTransport } from "./send";
import {
  DELIVERY_MAX_ATTEMPTS,
  backoffMs,
  endpointsFor,
  serializeEvent,
  type Delivery,
  type OutboundEvent,
  type OutboundEventInput,
  type WebhookEndpoint,
} from "./types";

/** What one emit did. `matched` counts the endpoints subscribed to the type;
 *  `delivered` + `pending` account for every one of them, so a cron can report the
 *  outcome without reading the log back. */
export interface EmitResult {
  eventId: string | null;
  matched: number;
  delivered: number;
  pending: number;
}

const NOTHING: EmitResult = { eventId: null, matched: 0, delivered: 0, pending: 0 };

/** Options exist for the tests: the transport is injected so the signing, logging
 *  and backoff logic is exercised without a socket, and the clock is injected so the
 *  scheduled `nextAt` is asserted exactly rather than approximately. */
export interface EmitOptions {
  transport?: OutboundTransport;
  now?: Date;
}

/** Apply one attempt's outcome to a delivery: success is terminal `ok`, a failure
 *  either schedules the next attempt or gives up at {@link DELIVERY_MAX_ATTEMPTS}.
 *  PURE (no I/O) so the state machine — the part that must not lose or loop a
 *  delivery — is unit-testable on its own. */
export function nextDeliveryState(
  delivery: Delivery,
  attempt: { ok: boolean; code?: number; error?: string },
  now: Date
): Partial<Delivery> {
  const attempts = delivery.attempts + 1;
  const base = {
    attempts,
    updatedAt: now.toISOString(),
    ...(typeof attempt.code === "number" ? { lastCode: attempt.code } : {}),
  };
  if (attempt.ok) return { ...base, status: "ok" as const, nextAt: null, lastError: undefined };
  if (attempts >= DELIVERY_MAX_ATTEMPTS) {
    return { ...base, status: "gave-up" as const, nextAt: null, lastError: attempt.error };
  }
  return {
    ...base,
    status: "pending" as const,
    nextAt: new Date(now.getTime() + backoffMs(attempts)).toISOString(),
    lastError: attempt.error,
  };
}

/** Send one delivery to one endpoint and persist the outcome. Never throws.
 *  Shared by the inline attempt below and by the `webhook-retry` ledger step, so
 *  there is exactly ONE place that decrypts a secret, signs, sends and records. */
export async function attemptDelivery(
  delivery: Delivery,
  endpoint: WebhookEndpoint,
  opts: EmitOptions = {}
): Promise<{ ok: boolean; patch: Partial<Delivery> }> {
  const now = opts.now ?? new Date();
  const secret = decryptSecret(endpoint.secretEnc);
  const attempt = secret
    ? await postGuarded(endpoint.url, secret, delivery.payload, { type: delivery.type }, delivery.id, {
        transport: opts.transport,
        now,
      })
    : {
        ok: false,
        error: "Podpisové tajemství nelze dešifrovat (změněný WEBHOOK_SECRET_KEY?).",
      };
  const patch = nextDeliveryState(delivery, attempt, now);
  try {
    await updateDelivery(delivery.projectId, delivery.id, patch);
  } catch (err) {
    console.error(`[outbound] delivery ${delivery.id} status write failed:`, err);
  }
  return { ok: attempt.ok, patch };
}

/** Record each endpoint's last outcome on the config, best-effort. One write per
 *  emit, after the sends — never in the hot path, never allowed to throw. */
async function stampEndpoints(
  userId: string,
  projectId: string,
  outcomes: Map<string, "ok" | "failed">,
  at: string
): Promise<void> {
  if (outcomes.size === 0) return;
  try {
    const cfg = await getWebhookConfig(userId, projectId);
    const endpoints = cfg.endpoints.map((e) => {
      const status = outcomes.get(e.id);
      return status ? { ...e, lastDeliveryAt: at, lastStatus: status } : e;
    });
    await saveWebhookConfig(userId, projectId, { endpoints });
  } catch (err) {
    console.error(`[outbound] endpoint stamp failed for ${userId}/${projectId}:`, err);
  }
}

/** Emit one event to every endpoint of `projectId` subscribed to its type.
 *  Fire-and-forget at the call sites (`void emitOutbound(…)`); a cron may `await` it
 *  to make the count observable in its run record. Never throws. */
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

    let delivered = 0;
    let pending = 0;
    const outcomes = new Map<string, "ok" | "failed">();

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
        // The log row lands BEFORE the send: a crash mid-attempt leaves a pending
        // delivery the cron picks up, rather than an event that silently never was.
        await appendDelivery(delivery);
      } catch (err) {
        console.error(`[outbound] delivery log write failed for ${projectId}:`, err);
        continue;
      }
      const { ok } = await attemptDelivery(delivery, endpoint, { ...opts, now });
      if (ok) delivered++;
      else pending++;
      outcomes.set(endpoint.id, ok ? "ok" : "failed");
    }

    await stampEndpoints(userId, projectId, outcomes, now.toISOString());
    return { eventId: event.id, matched: targets.length, delivered, pending };
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
