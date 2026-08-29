/** The per-project outbound event bus — PURE model, signing and scheduling rules.
 *
 *  Why this exists: every alert, digest and report used to reach exactly ONE
 *  destination, the deployment-wide `ALERT_WEBHOOK_URL` (src/lib/email.ts). That is
 *  the operator's channel — every tenant's alerts land in the vendor's Slack and no
 *  tenant can receive their own. This module is the tenant-facing counterpart: a
 *  project owner registers up to {@link MAX_ENDPOINTS} URLs, each event is signed
 *  with that endpoint's own secret, and delivery is durable (a log + a retry step on
 *  the ledgers cron) instead of fire-and-forget.
 *
 *  Framework-free and I/O-free on purpose (node:crypto only): the signature format,
 *  the replay window, the backoff table and the event filter are the parts a
 *  consumer must be able to re-implement from a spec, so they carry unit tests
 *  without a store, a route or a socket. Everything that touches the network lives
 *  in ./send.ts, everything that persists in ./config-store.ts + ./delivery-store.ts. */
import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { OutboundEventType } from "./event-types";

// The event vocabulary lives in ./event-types.ts (no node: imports) so the settings
// UI can render its filter without pulling node:crypto into the client bundle;
// re-exported here so every server caller has ONE import for the whole model.
export { OUTBOUND_EVENT_TYPES, isOutboundEventType, MAX_ENDPOINTS } from "./event-types";
export type { OutboundEventType } from "./event-types";

/** The signed JSON body. `data` carries the type-specific tail (alert items, the
 *  report URL, the failing provider); `href` is a deep link into /app. */
export interface OutboundEvent {
  id: string;
  type: OutboundEventType;
  at: string;
  projectId: string;
  title: string;
  body: string;
  href?: string;
  data?: Record<string, unknown>;
}

/** What an emit point supplies — the bus stamps id/at/projectId itself, so no
 *  caller can forge another project's event id. */
export type OutboundEventInput = Omit<OutboundEvent, "id" | "at" | "projectId">;

export interface WebhookEndpoint {
  id: string;
  url: string;
  /** `"all"` subscribes to every type, including ones added later. */
  events: OutboundEventType[] | "all";
  enabled: boolean;
  /** AES-256-GCM blob from ./secret-crypto.ts — NEVER sent to a client. */
  secretEnc: string;
  createdAt: string;
  lastDeliveryAt?: string;
  lastStatus?: "ok" | "failed";
}

/** Client-safe endpoint view: the secret becomes a boolean. The plaintext secret is
 *  returned exactly ONCE, by the PUT that mints it, and never again. */
export interface PublicWebhookEndpoint {
  id: string;
  url: string;
  events: OutboundEventType[] | "all";
  enabled: boolean;
  hasSecret: boolean;
  createdAt: string;
  lastDeliveryAt?: string;
  lastStatus?: "ok" | "failed";
}

/** Bounded (≤ 3 endpoints) → one blob per `(userId, projectId)`, unlike the delivery
 *  log which is unbounded and therefore row-based. */
export interface WebhookConfig {
  endpoints: WebhookEndpoint[];
}

export interface Delivery {
  id: string;
  /** Owner keys ride ON the record: the retry step reads pending deliveries across
   *  every project (one collection-group / one indexed scan) and must then resolve
   *  the endpoint's URL + secret, which live in the config keyed `(userId,
   *  projectId)`. Snapshotting the secret onto the delivery instead would put a
   *  credential in the log, which the invariants forbid. */
  userId: string;
  projectId: string;
  endpointId: string;
  eventId: string;
  type: OutboundEventType;
  status: "pending" | "ok" | "failed" | "gave-up";
  attempts: number;
  /** ISO time the next attempt is due; null once the delivery is terminal. */
  nextAt: string | null;
  lastCode?: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  /** the exact bytes that were signed — re-sent verbatim on a retry */
  payload: string;
}

/** Client-safe delivery view — the payload can be large and is not needed to render
 *  the log, so the table gets its size instead of its bytes. */
export interface PublicDelivery {
  id: string;
  endpointId: string;
  type: OutboundEventType;
  status: Delivery["status"];
  attempts: number;
  nextAt: string | null;
  lastCode?: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  payloadBytes: number;
}

/** Give-up threshold. With the backoff table below, five attempts span ~15 hours —
 *  long enough to ride out an endpoint's maintenance window, short enough that a
 *  permanently-dead URL stops consuming cron budget within a day. */
export const DELIVERY_MAX_ATTEMPTS = 5;

/** Newest deliveries kept per project; older rows are evicted on append. */
export const DELIVERY_LOG_CAP = 500;

/** Hard cap on the signed body. A webhook receiver's own limit is typically 1 MB;
 *  64 KB keeps us far below it and bounds what one alert can cost the log. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

/** Alert `items` spelled into `data` before the payload is capped. */
export const MAX_EVENT_ITEMS = 20;

/** How far a timestamp may be from now before the signature is refused, in ms.
 *  Bounds replay of a captured request; five minutes is the industry-standard
 *  window (Stripe/GitHub) and tolerates ordinary clock drift. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;

/** Per-attempt wait: 1 m, 5 m, 30 m, 2 h, 12 h. `attempt` is the number of attempts
 *  ALREADY made (1 → the wait before attempt 2). Out-of-range values clamp to the
 *  table's ends, so a corrupted `attempts` can never produce NaN or a negative wait
 *  that would busy-loop the cron. */
const BACKOFF_TABLE_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

export function backoffMs(attempt: number): number {
  if (!Number.isFinite(attempt)) return BACKOFF_TABLE_MS[0];
  const i = Math.min(Math.max(Math.floor(attempt), 1), BACKOFF_TABLE_MS.length) - 1;
  return BACKOFF_TABLE_MS[i];
}

/** The signed string: `${timestamp}.${rawBody}`. Binding the timestamp INTO the
 *  signature is what makes the replay window enforceable — a captured request
 *  cannot be re-dated without invalidating the digest. */
export function signingInput(ts: string, raw: string): string {
  return `${ts}.${raw}`;
}

/** HMAC-SHA256 hex over {@link signingInput}. The header value is `v1=<hex>`; the
 *  version prefix is what lets a future algorithm ship without breaking receivers
 *  that pin v1. */
export function signPayload(secret: string, ts: string, raw: string): string {
  return createHmac("sha256", secret).update(signingInput(ts, raw)).digest("hex");
}

export function signatureHeader(secret: string, ts: string, raw: string): string {
  return `v1=${signPayload(secret, ts, raw)}`;
}

/** Verify a received `X-Adamant-Signature`. Constant-time (both sides are SHA-256'd
 *  to a fixed 32 bytes first, so `timingSafeEqual` always gets equal-length inputs —
 *  the cron-auth.ts pattern) and replay-bounded: a timestamp more than
 *  {@link SIGNATURE_TOLERANCE_MS} from `now` is refused even when the digest matches.
 *  Never throws — a malformed header is simply `false`. */
export function verifyOutboundSignature(
  secret: string,
  ts: string,
  raw: string,
  header: string,
  now: number = Date.now()
): boolean {
  if (!secret || typeof header !== "string" || typeof ts !== "string") return false;
  const sent = Date.parse(ts);
  if (!Number.isFinite(sent) || Math.abs(now - sent) > SIGNATURE_TOLERANCE_MS) return false;
  const expected = signatureHeader(secret, ts, raw);
  try {
    return timingSafeEqual(
      createHash("sha256").update(header).digest(),
      createHash("sha256").update(expected).digest()
    );
  } catch {
    return false;
  }
}

/** Which endpoints this event goes to: enabled, and either subscribed to `"all"` or
 *  listing the type explicitly. An endpoint with an EMPTY event array receives
 *  nothing — an empty filter is "subscribed to nothing", never "subscribed to
 *  everything" (the fail-open reading would silently widen a narrowed filter). */
export function endpointsFor(cfg: WebhookConfig, type: OutboundEventType): WebhookEndpoint[] {
  return cfg.endpoints.filter(
    (e) => e.enabled && (e.events === "all" || e.events.includes(type))
  );
}

export function publicEndpoint(e: WebhookEndpoint): PublicWebhookEndpoint {
  return {
    id: e.id,
    url: e.url,
    events: e.events,
    enabled: e.enabled,
    hasSecret: Boolean(e.secretEnc),
    createdAt: e.createdAt,
    ...(e.lastDeliveryAt ? { lastDeliveryAt: e.lastDeliveryAt } : {}),
    ...(e.lastStatus ? { lastStatus: e.lastStatus } : {}),
  };
}

export function publicDelivery(d: Delivery): PublicDelivery {
  return {
    id: d.id,
    endpointId: d.endpointId,
    type: d.type,
    status: d.status,
    attempts: d.attempts,
    nextAt: d.nextAt,
    ...(typeof d.lastCode === "number" ? { lastCode: d.lastCode } : {}),
    ...(d.lastError ? { lastError: d.lastError } : {}),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    payloadBytes: Buffer.byteLength(d.payload, "utf8"),
  };
}

/** Serialise an event to the exact bytes that get signed, enforcing the payload cap.
 *  An oversized `data` is dropped (replaced by `{ truncated: true }`) rather than the
 *  whole event being lost — the receiver still learns that something happened, and
 *  the `href` takes them to the full record. A `data.items` array is capped to
 *  {@link MAX_EVENT_ITEMS} FIRST, since that is what actually grows unboundedly. */
export function serializeEvent(ev: OutboundEvent): string {
  const capped = capItems(ev);
  const raw = JSON.stringify(capped);
  if (Buffer.byteLength(raw, "utf8") <= MAX_PAYLOAD_BYTES) return raw;
  return JSON.stringify({ ...capped, data: { truncated: true } });
}

/** Cap `data.items` to MAX_EVENT_ITEMS, flagging that it happened. Pure. */
export function capItems(ev: OutboundEvent): OutboundEvent {
  const items = ev.data?.items;
  if (!Array.isArray(items) || items.length <= MAX_EVENT_ITEMS) return ev;
  return {
    ...ev,
    data: { ...ev.data, items: items.slice(0, MAX_EVENT_ITEMS), truncated: true },
  };
}
