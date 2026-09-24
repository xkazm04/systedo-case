/** The outbound DRAIN: the one function that sends deliveries. Server-only.
 *
 *  An emit only enqueues `pending` rows (./emit.ts). Everything that touches the
 *  network happens here, reached two ways: right after the emitting response via
 *  `after()` (the common case, so a healthy receiver still hears within seconds), and
 *  from the `webhook-retry` ledger step (./retry-step.ts), which is the backstop, the
 *  retry scheduler and the reaper in one sweep.
 *
 *  Both can run at once — the post-response drain of an emit and a ledgers tick that
 *  happens to land on the same row — so every send is preceded by a CLAIM: a single
 *  conditional write that moves the row `pending → sending` for exactly one holder
 *  and stamps a dated lease. The loser skips. The settling write is conditional on
 *  still holding the claim, so a slow-but-alive holder whose lease was reaped loses
 *  politely instead of overwriting the reaper's outcome. A holder that dies mid-send
 *  leaves a `sending` row whose lease lapses; the next sweep claims it again. That is
 *  still AT-LEAST-ONCE (a death after the receiver answered re-sends), which is why
 *  the event id rides in the payload and in `X-Adamant-Delivery` for the receiver to
 *  de-dupe on — but two live drains can no longer both send the same row.
 *
 *  Same precedent as scheduled social posts (src/lib/social/store.ts claim + reaper)
 *  and tenant-docs compareAndSet on both backends. */
import "server-only";
import { randomUUID } from "node:crypto";
import { getWebhookConfig, saveWebhookConfig } from "./config-store";
import { claimDelivery, completeDelivery, listPendingDeliveries } from "./delivery-store";
import { decryptSecret } from "./secret-crypto";
import { OUTBOUND_TIMEOUT_MS, postGuarded, type OutboundTransport } from "./send";
import {
  DELIVERY_MAX_ATTEMPTS,
  backoffMs,
  type Delivery,
  type WebhookConfig,
  type WebhookEndpoint,
} from "./types";

/** How long a claim holds a row. One attempt is bounded by OUTBOUND_TIMEOUT_MS of
 *  socket idleness; two of them plus a margin covers a slow-drip receiver and the
 *  settling write, and stays well under the ledgers cadence so a dead holder's row
 *  is re-offered on the next tick. */
export const CLAIM_LEASE_MS = 2 * OUTBOUND_TIMEOUT_MS + 30_000;

/** What one drain did. `retried` counts sends actually made (claims won against a
 *  live endpoint); a lost claim counts nowhere — the winner reports it. */
export type DrainCounts = {
  retried: number;
  delivered: number;
  failed: number;
  gaveUp: number;
  orphaned: number;
};

export interface DrainResult {
  ok: boolean;
  counts: DrainCounts;
  error?: string;
}

export interface DrainOptions {
  /** The due cut, and the clock the backoff is scheduled from. Injected by tests and
   *  by the ledger (its tick time). The LEASE is always measured from the wall clock
   *  as well (whichever is later), because it guards real elapsed time: a long sweep
   *  that dated every lease from its start would hand out already-expired claims. */
  now?: Date;
  /** Drain exactly these rows (an emit's own) instead of sweeping the store. */
  candidates?: Delivery[];
  /** Sweep bound when there are no candidates. */
  limit?: number;
  transport?: OutboundTransport;
  /** Record each endpoint's last outcome on its config (an emit's drain does). */
  stamp?: boolean;
}

/** Apply one attempt's outcome to a delivery: success is terminal `ok`, a failure
 *  either schedules the next attempt or gives up at {@link DELIVERY_MAX_ATTEMPTS}.
 *  PURE (no I/O) so the state machine — the part that must not lose or loop a
 *  delivery — is unit-testable on its own. `lastError: undefined` on success is a
 *  CLEAR: both store backends remove the field. */
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

/** Send one delivery to one endpoint and compute its next state. Never throws, never
 *  persists — the caller settles the row through its claim. The ONE place a secret
 *  is decrypted, a payload signed and sent. */
export async function attemptDelivery(
  delivery: Delivery,
  endpoint: WebhookEndpoint,
  opts: { transport?: OutboundTransport; now?: Date } = {}
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
  return { ok: attempt.ok, patch: nextDeliveryState(delivery, attempt, now) };
}

/** Record each endpoint's last outcome on the config, best-effort. One write per
 *  project per drain, after the sends — never allowed to throw. */
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

/** Claim, send and settle every candidate (or every due row in the store). Never
 *  throws: a store failure on the sweep read is reported as `{ ok: false, error }`,
 *  a failure on one row is logged and the drain moves on. */
export async function drainDeliveries(opts: DrainOptions = {}): Promise<DrainResult> {
  const counts: DrainCounts = { retried: 0, delivered: 0, failed: 0, gaveUp: 0, orphaned: 0 };
  const holder = randomUUID();
  let due: Delivery[];
  try {
    due = opts.candidates ?? (await listPendingDeliveries(opts.now ?? new Date(), opts.limit ?? 100));
  } catch (err) {
    return { ok: false, counts, error: err instanceof Error ? err.message : String(err) };
  }

  // One config read per (user, project) rather than per delivery: a project with a
  // dead endpoint typically has a whole run of pending deliveries against it.
  const configs = new Map<string, WebhookConfig | null>();
  const configFor = async (userId: string, projectId: string): Promise<WebhookConfig | null> => {
    const key = `${userId}\u0000${projectId}`;
    if (configs.has(key)) return configs.get(key)!;
    let cfg: WebhookConfig | null = null;
    try {
      cfg = await getWebhookConfig(userId, projectId);
    } catch (err) {
      console.error(`[outbound] drain: config read failed for ${userId}/${projectId}:`, err);
    }
    configs.set(key, cfg);
    return cfg;
  };
  const stamps = new Map<string, { userId: string; projectId: string; outcomes: Map<string, "ok" | "failed"> }>();

  for (const delivery of due) {
    const now = opts.now ?? new Date();
    const cfg = await configFor(delivery.userId, delivery.projectId);
    const endpoint = cfg?.endpoints.find((e) => e.id === delivery.endpointId);

    const leaseFrom = Math.max(now.getTime(), Date.now());
    const leaseUntil = new Date(leaseFrom + CLAIM_LEASE_MS).toISOString();
    let won = false;
    try {
      won = await claimDelivery(delivery.projectId, delivery.id, holder, leaseUntil, now);
    } catch (err) {
      console.error(`[outbound] drain: claim failed for ${delivery.id}:`, err);
    }
    if (!won) continue; // another drain holds it (or it settled / left the due set)

    let patch: Partial<Delivery>;
    if (!endpoint || !endpoint.enabled) {
      // The endpoint was deleted or switched off (or its config is unreadable) while
      // this delivery waited. Retrying forever against nothing is the failure mode a
      // queue must not have — and "disabled" is the owner saying stop, which a
      // backlog draining hours later must respect — so the delivery is closed as
      // `gave-up` with an honest reason.
      counts.orphaned++;
      patch = {
        status: "gave-up",
        attempts: delivery.attempts, // nothing was sent: undo the claim's count
        nextAt: null,
        updatedAt: now.toISOString(),
        lastError: endpoint ? "Cíl byl mezitím vypnut." : "Cíl byl mezitím smazán.",
      };
    } else {
      counts.retried++;
      const attempt = await attemptDelivery(delivery, endpoint, { transport: opts.transport, now });
      patch = attempt.patch;
      if (attempt.ok) counts.delivered++;
      else if (patch.status === "gave-up") counts.gaveUp++;
      else counts.failed++;
      if (opts.stamp) {
        const key = `${delivery.userId}\u0000${delivery.projectId}`;
        const entry = stamps.get(key) ?? { userId: delivery.userId, projectId: delivery.projectId, outcomes: new Map() };
        entry.outcomes.set(endpoint.id, attempt.ok ? "ok" : "failed");
        stamps.set(key, entry);
      }
    }
    try {
      const settled = await completeDelivery(delivery.projectId, delivery.id, holder, patch);
      if (!settled) console.warn(`[outbound] drain: lost the claim on ${delivery.id} before settling`);
    } catch (err) {
      console.error(`[outbound] delivery ${delivery.id} status write failed:`, err);
    }
  }

  const at = (opts.now ?? new Date()).toISOString();
  for (const { userId, projectId, outcomes } of stamps.values()) {
    await stampEndpoints(userId, projectId, outcomes, at);
  }
  return { ok: true, counts };
}
