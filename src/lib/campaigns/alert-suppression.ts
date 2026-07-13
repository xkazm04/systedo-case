/** Pure alert-suppression policy shared by campaign-critical and performance-
 *  anomaly alerts. Kills alert fatigue two ways:
 *
 *   - hysteresis: an alerted key stays in its episode until it clears a recovery
 *     band (a critical campaign that only recovers to "warning" does NOT re-arm —
 *     so a campaign flickering across the critical boundary re-alerts once, not
 *     every sync);
 *   - per-key cooldown: within a fixed window a key never re-alerts, even after a
 *     full recovery-then-relapse — the repeat is grouped (count++) instead.
 *
 *  No I/O, no firebase — so the exact decision is unit-testable with synthetic
 *  sync sequences, and both the server alert paths and the inbox grouping import
 *  from one source of truth. */

/** Fixed per-key cooldown window (6h). One breach → at most one alert per key per
 *  window; a still-broken key can re-alert once as a reminder after it elapses. */
export const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/** Persisted per-key memory of an alert episode. */
export interface AlertKeyState {
  /** ISO timestamp of the last time this key actually FIRED an alert */
  lastAlertAt: string;
  /** how many times this key has entered the alert condition since the episode
   *  began (fired + suppressed) — drives the inbox "×N" repeat count */
  count: number;
  /** true while the key is unresolved (still breaching, or within the hysteresis
   *  band); false once it has recovered to healthy but is kept as a cooldown
   *  tombstone so a relapse still groups rather than re-alerting */
  active: boolean;
}

/** Per-key episode memory persisted on the tenant doc. */
export type AlertState = Record<string, AlertKeyState>;

export interface SuppressionInput {
  /** keys currently breaching the alert threshold (critical campaigns / fresh
   *  anomalies) — candidates to alert */
  breaching: string[];
  /** keys that are unresolved but not breaching — the hysteresis band (e.g. a
   *  campaign that recovered only to "warning"). Their episodes are held so a
   *  band↔breach flicker never re-arms. Anomalies have no band → pass `[]`. */
  banded?: string[];
  /** current wall-clock (ms) — injected so sequences are deterministic in tests */
  now: number;
  /** override the default cooldown window (tests) */
  cooldownMs?: number;
}

export interface SuppressionResult {
  /** keys that should fire an alert on this run (a subset of `breaching`) */
  toAlert: string[];
  /** the next state to persist */
  nextState: AlertState;
  /** per-key episode counts for keys in `toAlert` (for the alert body / grouping) */
  counts: Record<string, number>;
}

/**
 * Decide which breaching keys alert this run and roll the episode memory forward.
 *
 * A key alerts iff it is breaching AND either it has no live episode (first entry,
 * or a fully cooled-down clean slate) or its cooldown has elapsed (reminder /
 * post-cooldown relapse). Otherwise the breach is suppressed and only bumps the
 * episode's repeat count. Unresolved-but-banded keys hold their episode; recovered
 * keys keep a cooldown tombstone until the window elapses, then drop (re-armed).
 */
export function planSuppression(prev: AlertState, input: SuppressionInput): SuppressionResult {
  const cooldownMs = input.cooldownMs ?? ALERT_COOLDOWN_MS;
  const nowISO = new Date(input.now).toISOString();
  const banded = new Set(input.banded ?? []);
  const breaching = new Set(input.breaching);

  const next: AlertState = {};
  const toAlert: string[] = [];
  const counts: Record<string, number> = {};

  // Breaching keys: alert or suppress-and-group.
  for (const key of input.breaching) {
    const ep = prev[key];
    if (!ep) {
      next[key] = { lastAlertAt: nowISO, count: 1, active: true };
      toAlert.push(key);
      counts[key] = 1;
      continue;
    }
    const cooled = input.now - Date.parse(ep.lastAlertAt) >= cooldownMs;
    if (cooled) {
      // cooldown elapsed → (re)alert: an ongoing-episode reminder, or a genuine
      // relapse after a recovery that has since cooled.
      const count = ep.count + 1;
      next[key] = { lastAlertAt: nowISO, count, active: true };
      toAlert.push(key);
      counts[key] = count;
    } else {
      // within cooldown → suppress; keep lastAlertAt, just group (count++).
      next[key] = { lastAlertAt: ep.lastAlertAt, count: ep.count + 1, active: true };
    }
  }

  // Non-breaching keys carried from the previous state: hold the band, or keep a
  // cooldown tombstone through recovery, or drop once fully cooled + recovered.
  for (const key of Object.keys(prev)) {
    if (breaching.has(key)) continue; // already handled above
    const ep = prev[key];
    if (banded.has(key)) {
      // unresolved-but-not-breaching → episode persists (hysteresis band).
      next[key] = { lastAlertAt: ep.lastAlertAt, count: ep.count, active: true };
      continue;
    }
    const cooled = input.now - Date.parse(ep.lastAlertAt) >= cooldownMs;
    if (!cooled) {
      // recovered but still inside the cooldown window → tombstone so a relapse
      // groups instead of re-alerting.
      next[key] = { lastAlertAt: ep.lastAlertAt, count: ep.count, active: false };
    }
    // else: recovered AND cooled → drop entirely (a future breach re-alerts fresh).
  }

  return { toAlert, nextState: next, counts };
}

// --- inbox grouping ----------------------------------------------------------

/** The subset of an alert record the grouping needs (client-safe: no firebase). */
export interface GroupableAlert {
  id: string;
  type: string;
  title: string;
  body: string;
  items: { campaignId: string }[];
  createdAt: string;
  read: boolean;
}

export interface AlertGroup<T extends GroupableAlert> {
  /** stable grouping signature */
  key: string;
  /** newest record in the group — the representative shown in the inbox */
  latest: T;
  /** how many records collapsed into this group (repeat count) */
  count: number;
  /** how many of the grouped records are unread */
  unread: number;
  /** every record id in the group (so "mark read" can address them) */
  ids: string[];
}

/** Two alert records belong to the same group when they concern the same set of
 *  campaigns (same type + same campaign-id set); item-less records (e.g. a
 *  "report sent" digest) group by their title so distinct ones stay separate. */
function groupSignature(a: GroupableAlert): string {
  const ids = a.items.map((i) => i.campaignId).sort();
  return ids.length ? `${a.type}|${ids.join(",")}` : `${a.type}|${a.title}`;
}

/**
 * Collapse repeated alerts about the same campaign(s) into one row with a repeat
 * count, preserving the newest as the representative. Assumes the input is
 * newest-first (as `listAlerts` returns), so the first record seen per signature
 * is the newest. Group order follows first appearance (newest group first).
 */
export function groupAlertRecords<T extends GroupableAlert>(alerts: T[]): AlertGroup<T>[] {
  const groups = new Map<string, AlertGroup<T>>();
  const order: string[] = [];
  for (const a of alerts) {
    const sig = groupSignature(a);
    let g = groups.get(sig);
    if (!g) {
      g = { key: sig, latest: a, count: 0, unread: 0, ids: [] };
      groups.set(sig, g);
      order.push(sig);
    }
    g.count += 1;
    g.ids.push(a.id);
    if (!a.read) g.unread += 1;
  }
  return order.map((k) => groups.get(k)!);
}
