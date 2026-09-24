/** Endpoint standing and the dead-letter verbs of the webhook log — PURE and NODE-FREE.
 *
 *  Why this exists: the settings card used to show one pill per endpoint, read from a
 *  `lastStatus` stamp that only an emit's own drain writes. A retry that later
 *  succeeded (the ledger sweep) never cleared "Last delivery failed", a secret made
 *  unreadable by a server-key change still showed as present, and a `gave-up` row was a
 *  dead end. Here the standing is DERIVED from the delivery log itself — consecutive
 *  failures since the last success, the last success kept apart from the last attempt
 *  — and the two verbs the log offers (redeliver, rotate) have their rules in one place.
 *
 *  No `node:` import, no store, no I/O: the settings UI is a client component and
 *  imports this directly (the ./event-types.ts precedent), and the redeliver route
 *  uses the same `canRedeliver` / `buildRedelivery`, so the button and the server
 *  cannot disagree about which row may be replayed. `import type` from ./types is
 *  erased at build time and pulls no node:crypto into the client bundle. */
import type { Delivery, PublicDelivery } from "./types";

/** `idle` (nothing attempted yet) and `failing` are spelled apart on purpose: an empty
 *  log must never read as a broken endpoint, nor a broken one as "fine, just quiet". */
export type EndpointHealthState = "idle" | "healthy" | "failing" | "dead" | "secret-unreadable";

export interface EndpointHealth {
  state: EndpointHealthState;
  /** delivery rows whose last attempt failed, newer than the last success */
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
}

/** An endpoint whose newest this-many attempted deliveries ALL gave up is `dead`: the
 *  retry budget (DELIVERY_MAX_ATTEMPTS, ~15 h) ran out three times in a row. */
export const DEAD_AFTER = 3;

/** What the rule reads — PublicDelivery's fields, so the client can pass its log. */
export type HealthRow = Pick<PublicDelivery, "endpointId" | "status" | "attempts" | "updatedAt">;

/** A row's settled outcome, or null when it says nothing about the endpoint yet: in
 *  flight (`sending`), or never attempted (a fresh `pending` row, an orphan closed
 *  before any send). A `pending` row WITH attempts is a failure awaiting its retry. */
function outcome(d: HealthRow): "ok" | "failed" | null {
  if (d.status === "ok") return "ok";
  if (d.status === "sending" || d.attempts < 1) return null;
  return "failed";
}

/** Derive one endpoint's standing from the log (any order; newest-first by attempt
 *  time is applied here, since `updatedAt` is when a row's last attempt settled). The
 *  log page the client holds is bounded, so "since the last success" means within it.
 *  `secretReadable: false` wins over the log: until a re-mint, no attempt can sign. */
export function endpointHealth(
  log: readonly HealthRow[],
  endpointId: string,
  opts: { secretReadable?: boolean } = {}
): EndpointHealth {
  const attempted = log
    .filter((d) => d.endpointId === endpointId && outcome(d) !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  let consecutiveFailures = 0;
  for (const d of attempted) {
    if (outcome(d) === "ok") break;
    consecutiveFailures++;
  }
  const lastSuccess = attempted.find((d) => d.status === "ok");
  const dead =
    attempted.length >= DEAD_AFTER && attempted.slice(0, DEAD_AFTER).every((d) => d.status === "gave-up");
  const state: EndpointHealthState =
    opts.secretReadable === false
      ? "secret-unreadable"
      : attempted.length === 0
        ? "idle"
        : consecutiveFailures === 0
          ? "healthy"
          : dead
            ? "dead"
            : "failing";
  return {
    state,
    consecutiveFailures,
    lastSuccessAt: lastSuccess?.updatedAt ?? null,
    lastAttemptAt: attempted[0]?.updatedAt ?? null,
  };
}

/** Statuses a row may be replayed from: the terminal ones. `pending` and `sending` are
 *  owned by the queue (a scheduled retry, a live claim) — replaying them would send
 *  the same event twice at once. `failed` is in the union but never written by the
 *  drain; it is terminal if it ever appears. */
const REDELIVERABLE: readonly Delivery["status"][] = ["ok", "gave-up", "failed"];

export function canRedeliver(d: Pick<Delivery, "status">): boolean {
  return REDELIVERABLE.includes(d.status);
}

/** The replay row: a NEW pending delivery due now, carrying the original's verbatim
 *  signed payload and event id (the receiver's de-dupe key), with lineage in
 *  `redeliveryOf`. The original row is left as it was — it is history. Nothing of the
 *  old attempt (error, code, claim) is carried over. */
export function buildRedelivery(orig: Delivery, opts: { id: string; now: Date }): Delivery {
  const at = opts.now.toISOString();
  return {
    id: opts.id,
    userId: orig.userId,
    projectId: orig.projectId,
    endpointId: orig.endpointId,
    eventId: orig.eventId,
    type: orig.type,
    status: "pending",
    attempts: 0,
    nextAt: at,
    createdAt: at,
    updatedAt: at,
    payload: orig.payload,
    redeliveryOf: orig.id,
  };
}

/** The PUT body for "rotate this endpoint's secret": the current drafts, with ONLY
 *  the chosen row asking the server to re-mint. Every other row keeps its secret — a
 *  receiver pinned to it must not break because a sibling was rotated. */
export function rotateDraftPayload<D extends { id?: string }>(
  drafts: readonly D[],
  endpointId: string
): (D & { rotate?: true })[] {
  return drafts.map((d) => (d.id === endpointId ? { ...d, rotate: true as const } : d));
}
