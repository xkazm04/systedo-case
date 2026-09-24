/** The "Needs attention" TRIAGE INBOX — the pure core behind the dismiss / undo /
 *  restore controls on a single project's feed. Framework-free, no I/O, and it imports
 *  only ledger TYPES: it is shared by a server component and a client one, and
 *  ./store and ./record are server-only.
 *
 *  THE VERDICT IS OPTIMISTIC, AND NEVER SILENT. A dismissed row leaves the feed at
 *  once (the operator's click is the verdict), but the write can still fail: a failed
 *  write returns the row WITH a named notice, and a 404 — the fire-and-forget sighting
 *  has not landed yet for a brand-new subject — is its own kind, because "try again in
 *  a moment" is true there and "something broke" is not. A refresh that arrives while
 *  a verdict is in flight must not resurrect the row (`reconcile`).
 *
 *  Only `dismissed` ↔ `open` travel over the wire; `resolved` is machine-minted by the
 *  ledger (see the route's header), so no action here can ask for it. */
import type { AdviceLedger, AdviceRecord } from "./ledger";

/** The minimum a feed row needs to be triaged. */
export interface TriageableRec {
  subjectKey: string;
  title: string;
}

export interface DismissedItem {
  subjectKey: string;
  title: string;
  dismissedAt: string;
}

export interface FeedPartition<R> {
  /** rows to render, in the producer's order */
  visible: R[];
  /** rows in this feed the operator hid — the "Hidden (n)" list */
  dismissed: DismissedItem[];
  /** the heading's count: the feed total minus what is hidden */
  badge: number;
  /** false without a ledger — no write route backs a verdict there (portfolio, demo,
   *  anonymous), so no control is rendered */
  canTriage: boolean;
}

/** Split a feed by the ledger's verdicts. `count` is the feed's full size when `recs`
 *  is a truncated slice of it (the portfolio's top eight). A dismissed subject that is
 *  no longer firing is not listed — it is not hidden from THIS feed. */
export function partitionFeed<R extends TriageableRec>(
  recs: R[],
  ledger: AdviceLedger | null | undefined,
  count: number = recs.length
): FeedPartition<R> {
  if (!ledger) return { visible: recs, dismissed: [], badge: count, canTriage: false };
  const byKey = new Map<string, AdviceRecord>();
  for (const r of ledger.records) if (r.status === "dismissed") byKey.set(r.subjectKey, r);
  const visible: R[] = [];
  const dismissed: DismissedItem[] = [];
  for (const r of recs) {
    const hit = byKey.get(r.subjectKey);
    if (!hit) visible.push(r);
    else dismissed.push({ subjectKey: r.subjectKey, title: r.title, dismissedAt: hit.dismissedAt ?? "" });
  }
  return { visible, dismissed, badge: count - dismissed.length, canTriage: true };
}

export type AdviceWireStatus = "dismissed" | "open";

/** The one request a verdict sends — `PATCH /api/projects/{id}/advice`. */
export function adviceStatusRequest(
  projectId: string,
  subjectKey: string,
  status: AdviceWireStatus
): { url: string; init: { method: "PATCH"; headers: Record<string, string>; body: string } } {
  return {
    url: `/api/projects/${encodeURIComponent(projectId)}/advice`,
    init: {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subjectKey, status }),
    },
  };
}

/** A row's client-side verdict. Absent = whatever the server rendered.
 *  pending → dismiss in flight (hidden) · dismissed → written, undoable (hidden) ·
 *  pending-restore → undo/restore in flight (shown) · open → restored, until the
 *  server's next render agrees. */
export type RowVerdict = "pending" | "dismissed" | "pending-restore" | "open";

export type TriageErrorKind = "failed" | "untracked";

/** Row verdicts keyed by subjectKey, plus the one notice on screen. Subject keys are
 *  always `module:...`, so they never collide with `error`. */
export type TriageState = { [subjectKey: string]: RowVerdict | TriageError | null | undefined } & {
  error?: TriageError | null;
};
export interface TriageError {
  key: string;
  kind: TriageErrorKind;
}

export type TriageAction =
  | { type: "dismiss"; key: string }
  | { type: "undo"; key: string }
  | { type: "settled"; key: string; httpStatus: number }
  | { type: "reconcile"; visibleKeys: readonly string[] };

/** The wire status an action asks for. */
export function actionStatus(action: { type: "dismiss" | "undo" }): AdviceWireStatus {
  return action.type === "dismiss" ? "dismissed" : "open";
}

function verdictOf(state: TriageState, key: string): RowVerdict | undefined {
  const v = key === "error" ? undefined : state[key];
  return typeof v === "string" ? (v as RowVerdict) : undefined;
}

/** Whether the row is out of the feed right now, as far as the client knows. */
export function isHidden(state: TriageState, key: string): boolean {
  const v = verdictOf(state, key);
  return v === "pending" || v === "dismissed";
}

export function canUndo(state: TriageState, key: string): boolean {
  return verdictOf(state, key) === "dismissed";
}

function withRow(state: TriageState, key: string, verdict: RowVerdict | undefined, error: TriageError | null) {
  const next: TriageState = { ...state, error };
  if (verdict) next[key] = verdict;
  else delete next[key];
  return next;
}

/** Drop the client verdicts the server's fresh render now agrees with. An in-flight
 *  verdict is kept whatever the refresh says — that is what stops a resurrection — and
 *  a settled dismissal is kept so its "Hidden · Undo" row stays where it was. */
export function reconcile(state: TriageState, freshVisibleKeys: readonly string[]): TriageState {
  const visible = new Set(freshVisibleKeys);
  const next: TriageState = { ...state };
  for (const key of Object.keys(next)) {
    if (key !== "error" && next[key] === "open" && visible.has(key)) delete next[key];
  }
  return next;
}

export function triageReducer(state: TriageState, action: TriageAction): TriageState {
  switch (action.type) {
    case "dismiss":
      return withRow(state, action.key, "pending", null);
    case "undo":
      return withRow(state, action.key, "pending-restore", null);
    case "reconcile":
      return reconcile(state, action.visibleKeys);
    case "settled": {
      const v = verdictOf(state, action.key);
      const ok = action.httpStatus >= 200 && action.httpStatus < 300;
      if (ok) return withRow(state, action.key, v === "pending-restore" ? "open" : "dismissed", state.error ?? null);
      const error: TriageError = { key: action.key, kind: action.httpStatus === 404 ? "untracked" : "failed" };
      // Roll the optimistic move back: a failed dismiss shows the row again, a failed
      // restore hides it again — in both cases with the notice beside it.
      return withRow(state, action.key, v === "pending-restore" ? "dismissed" : undefined, error);
    }
  }
}

/** A subject shown this often is judgment-relevant ("shown 11× in 23 days"). */
export const REPEAT_HINT_MIN_TIMES = 5;

export function repeatHint(
  record: Pick<AdviceRecord, "timesSeen" | "firstSeenAt"> | null | undefined,
  now: Date
): { times: number; days: number } | null {
  if (!record || record.timesSeen < REPEAT_HINT_MIN_TIMES) return null;
  const first = Date.parse(record.firstSeenAt);
  if (!Number.isFinite(first)) return null;
  const days = Math.max(1, Math.floor((now.getTime() - first) / 86_400_000));
  return { times: record.timesSeen, days };
}
