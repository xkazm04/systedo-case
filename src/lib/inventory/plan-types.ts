/** Direction 1 — the persisted, honest inventory action plan + the stock-transition
 *  alert payload. Both are PURE and framework-free so the store's read-modify-write
 *  is a thin dispatcher and every decision (per-move state, the inputs digest that
 *  detects a stale plan, which SKUs breach, the cs/en alert text) is unit-testable
 *  without any I/O. Persisted per project as one {plan, stockAlerts, updatedAt} blob
 *  through the store trio (Firestore + LOCAL_DB sqlite twin), mirroring diagnoses.
 *
 *  Honesty is the point: "accepting" a move records a decision the operator can
 *  track — it does NOT mutate any ad account (Adamant has no write access here).
 *  The old InventoryBudgetActions faked a control-plane apply with a setTimeout; this
 *  replaces it with a saved recommendation and a plain "nedotýká se reklamních účtů". */
import type { StockRow } from "./compute";
import type { AlertState } from "@/lib/campaigns/alert-suppression";
import type { SupportedLocale } from "@/lib/format";

/** Where a proposed budget move sits: freshly proposed, the operator has accepted
 *  (saved) it, or dismissed it. No "applied" — nothing is executed. */
export const MOVE_STATES = ["proposed", "accepted", "dismissed"] as const;
export type MoveState = (typeof MOVE_STATES)[number];

/** One persisted move. `key` = `${fromSku}->${toSku}` (the component's row key), so
 *  a reloaded plan re-attaches each saved state to its current row. */
export interface StoredMove {
  key: string;
  fromSku: string;
  toSku: string;
  amountCzk: number;
  state: MoveState;
}

/** The persisted plan: the moves with their states, when it was first saved, and the
 *  digest of the inputs it was computed from (so a plan saved against stale stock is
 *  detected and reset rather than silently re-applied to different SKUs). */
export interface StoredPlan {
  createdAt: string;
  inputsDigest: string;
  moves: StoredMove[];
}

/** The per-project inventory blob: the saved plan (Direction 1 persisted plan) plus
 *  the per-SKU stock-alert suppression episodes (Direction 1 stockout alerts). One
 *  row per project; the two concerns are written by different callers (the user via
 *  the API route; the sync via the alert path), so the store's helpers do a
 *  read-modify-write that preserves the field they don't own. */
export interface InventoryPlanState {
  plan: StoredPlan | null;
  /** per-SKU alert-suppression episodes (planSuppression state), keyed by SKU. */
  stockAlerts: AlertState;
  updatedAt: string;
}

export function emptyPlanState(): InventoryPlanState {
  return { plan: null, stockAlerts: {}, updatedAt: new Date().toISOString() };
}

/** The stable row key for a proposed move (matches InventoryBudgetActions). */
export function moveKey(a: { fromSku: string; toSku: string }): string {
  return `${a.fromSku}->${a.toSku}`;
}

/** Cheap, stable fnv-1a (base36) digest of the plan's INPUTS — the ordered set of
 *  (from, to, amount) moves. Two renders with the same proposal produce the same
 *  digest, so a saved plan is recognised as current; any change to the SKUs or
 *  amounts flips it, so the saved per-move states are treated as stale. Not
 *  cryptographic — just a change-detector, like diagnoses' inputDigest. */
export function planInputsDigest(
  actions: { fromSku: string; toSku: string; amountCzk: number }[]
): string {
  const s = actions
    .map((a) => `${a.fromSku}>${a.toSku}:${a.amountCzk}`)
    .sort()
    .join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Initial per-move states for the current proposal: the saved states when the
 *  stored plan matches the current inputs (same digest), else every move `proposed`
 *  (the stored plan was computed against different stock and is stale). Only keys
 *  present in the current proposal are returned. Pure. */
export function initialMoveStates(
  stored: StoredPlan | null,
  currentDigest: string,
  actions: { fromSku: string; toSku: string }[]
): Record<string, MoveState> {
  const savedByKey = new Map<string, MoveState>();
  if (stored && stored.inputsDigest === currentDigest) {
    for (const m of stored.moves) savedByKey.set(m.key, m.state);
  }
  const out: Record<string, MoveState> = {};
  for (const a of actions) {
    const k = moveKey(a);
    out[k] = savedByKey.get(k) ?? "proposed";
  }
  return out;
}

const MOVE_STATE_SET = new Set<string>(MOVE_STATES);
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim() : "").slice(0, max);

/** Coerce a plan-persist request body into a clean StoredPlan, or null when it does
 *  not describe a usable plan. `createdAt` is stamped by the caller (not trusted from
 *  the wire); a bounded number of moves are kept. Never trust the wire. */
export function sanitizeStoredPlan(raw: unknown, now: Date): StoredPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const inputsDigest = str(o.inputsDigest, 32);
  if (!inputsDigest) return null;
  if (!Array.isArray(o.moves)) return null;
  const moves: StoredMove[] = [];
  for (const rawMove of o.moves.slice(0, 100)) {
    if (!rawMove || typeof rawMove !== "object") continue;
    const mo = rawMove as Record<string, unknown>;
    const fromSku = str(mo.fromSku, 64);
    const toSku = str(mo.toSku, 64);
    if (!fromSku || !toSku) continue;
    const amount = Number(mo.amountCzk);
    const state = MOVE_STATE_SET.has(mo.state as string) ? (mo.state as MoveState) : "proposed";
    moves.push({
      key: str(mo.key, 160) || `${fromSku}->${toSku}`,
      fromSku,
      toSku,
      amountCzk: Number.isFinite(amount) && amount >= 0 ? Math.round(amount) : 0,
      state,
    });
  }
  return { createdAt: now.toISOString(), inputsDigest, moves };
}

// --------------------------------------------------------------------------
// Stock-transition alerts — the pure selection + cs/en payload. The sync path
// wraps these with planSuppression + recordAlert (see sync-alerts.ts).
// --------------------------------------------------------------------------

/** The SKUs in an alertable stock condition: hard pause / resuming (< 7 days cover)
 *  or at-risk (7–14 days). These are the keys fed to planSuppression, so an alert
 *  fires only when a SKU CROSSES in (and, after the cooldown, as a reminder) — a SKU
 *  already in an open episode is suppressed. Pure. */
export function breachingSkus(rows: StockRow[]): string[] {
  return rows
    .filter((r) => r.status === "pause" || r.status === "resuming" || r.atRisk)
    .map((r) => r.product.sku);
}

const ALERT_T = {
  cs: {
    title: (n: number) => `${n} SKU s docházející zásobou`,
    pause: (n: number | null) => (n !== null ? `vyprodáno za ${n} dní` : "vyprodáno velmi brzy"),
    risk: (n: number | null) => (n !== null ? `zásoba na ${n} dní — brzy dojde` : "zásoba dochází"),
  },
  en: {
    title: (n: number) => `${n} SKU${n === 1 ? "" : "s"} running low on stock`,
    pause: (n: number | null) => (n !== null ? `out of stock in ${n}d` : "out of stock very soon"),
    risk: (n: number | null) => (n !== null ? `${n} days of cover — running low` : "cover running out"),
  },
} as const;

export interface StockAlertPayload {
  type: "critical" | "digest";
  title: string;
  body: string;
  items: { campaignId: string; name: string; reason: string }[];
  href: string;
}

/** Build the inbox alert payload for a set of breaching stock rows, in the given
 *  locale. `critical` when any row is a hard pause/resuming (< 7d); otherwise
 *  `digest` (at-risk only). Deep-links to the Sklad & sezónnost module. Pure. */
export function stockAlertPayload(
  rows: StockRow[],
  projectId: string,
  locale: SupportedLocale
): StockAlertPayload {
  const t = ALERT_T[locale] ?? ALERT_T.cs;
  const items = rows.map((r) => {
    const hardPause = r.status === "pause" || r.status === "resuming";
    const days = Number.isFinite(r.stockoutDays) ? r.stockoutDays : null;
    return {
      campaignId: r.product.sku,
      name: r.product.title,
      reason: hardPause ? t.pause(days) : t.risk(days),
    };
  });
  const anyHard = rows.some((r) => r.status === "pause" || r.status === "resuming");
  return {
    type: anyHard ? "critical" : "digest",
    title: t.title(rows.length),
    body: items.map((i) => `${i.name} — ${i.reason}`).join(" · "),
    items,
    href: `/app/${projectId}/sklad-sezonnost`,
  };
}
