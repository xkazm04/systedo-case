/** The hot-blob ⇄ history split — pure policy, no store, no clock.
 *
 *  The twin's outbox lives in one JSON blob the client POSTs whole. Left unchecked
 *  it grew until `sanitizeTwinState`'s MAX_DRAFTS cap silently sliced the OLDEST
 *  records off the top — and the oldest records are exactly the audit trail (who
 *  approved what, why a human rejected it). Silently dropping an audit record is the
 *  worst thing this blob can do, so terminal drafts (sent/rejected) now ARCHIVE into
 *  a capped-larger history store instead of vanishing.
 *
 *  Policy (documented, enforced by `partitionDrafts`): the hot blob keeps every
 *  LIVE draft (pending/approved — work still in progress) plus a small window of the
 *  most-recent TERMINAL drafts (so the outbox history and the rejection tally still
 *  read familiar shapes with no DB round-trip), bounded by HOT_DRAFTS_CAP. Older
 *  terminal drafts are handed to the archive. Live work is never archived: if it
 *  alone somehow exceeds the cap, the blob is allowed to run over rather than lose
 *  in-progress drafts. */
import type { TwinChannel, TwinDraft } from "./types";

/** A draft past the autonomy gate's reach — an audit record, not live work. */
export const isTerminal = (d: TwinDraft): boolean => d.status === "sent" || d.status === "rejected";

/** How many of the most-recent terminal drafts stay hot alongside live work. */
export const RECENT_TERMINAL_WINDOW = 40;

/** The hot blob's hard ceiling (the old MAX_DRAFTS, kept as the live+window cap). */
export const HOT_DRAFTS_CAP = 200;

export interface DraftPartition {
  /** stays in the JSON blob, in the input's chronological order */
  hot: TwinDraft[];
  /** terminal audit records evicted to the history store */
  archive: TwinDraft[];
}

/** Split an outbox into what stays hot and what archives. Input order is assumed
 *  chronological (drafts are appended), so the "most recent terminal" window is the
 *  tail of the terminal drafts. */
export function partitionDrafts(
  drafts: TwinDraft[],
  window: number = RECENT_TERMINAL_WINDOW,
  cap: number = HOT_DRAFTS_CAP
): DraftPartition {
  const live = drafts.filter((d) => !isTerminal(d));
  const terminal = drafts.filter(isTerminal);

  // Keep the newest terminal drafts, bounded BOTH by the window and by whatever
  // room the cap leaves after live work (which is never archived).
  const room = Math.max(0, cap - live.length);
  const keepCount = Math.min(window, room);
  const keptTerminalIds = new Set(
    terminal.slice(terminal.length - keepCount).map((d) => d.id)
  );

  const hot = drafts.filter((d) => !isTerminal(d) || keptTerminalIds.has(d.id));
  const archive = terminal.filter((d) => !keptTerminalIds.has(d.id));
  return { hot, archive };
}

/** The timestamp an archived draft is ordered/evicted by: when it became terminal,
 *  falling back to creation for a record that somehow lacks a decision stamp. */
export function archivedAt(d: TwinDraft): string {
  return d.sentAt ?? d.decidedAt ?? d.createdAt;
}

/** Fold a bounded set of archived rejects into the live drafts for a rejection
 *  tally, so `rejectionPatterns` doesn't regress as older rejects move to history.
 *  De-duped by id (archive and hot are disjoint by construction, but a save race
 *  could momentarily overlap — a double-counted reject would over-weight an avoid). */
export function withArchivedRejects(hot: TwinDraft[], archived: TwinDraft[]): TwinDraft[] {
  if (archived.length === 0) return hot;
  const seen = new Set(hot.map((d) => d.id));
  return [...hot, ...archived.filter((d) => !seen.has(d.id))];
}

/** How many records overflow a cap (≥ 0). The eviction decision, made testable
 *  apart from the SQL that performs it. */
export function overflowCount(total: number, cap: number): number {
  return Math.max(0, total - cap);
}

/** Per-project archive ceiling — larger than the hot blob because history is the
 *  point; oldest-evicted beyond it (with a logged line). */
export const TWIN_ARCHIVE_CAP = 1000;

/** Filter a draft list to a single channel's rejects (for a channel-scoped tally). */
export function rejectsForChannel(drafts: TwinDraft[], channel: TwinChannel): TwinDraft[] {
  return drafts.filter((d) => d.status === "rejected" && d.channel === channel);
}

/** The durable per-project record of what the archive cap has DELETED. Eviction
 *  removes audit records, and a deleted record cannot testify for itself — so both
 *  backends write this tally in the same atomic step as the delete (Firestore: the
 *  delete batch, twinArchiveEvictions/{projectId}; sqlite: a BEGIN IMMEDIATE
 *  transaction over twin_archive_evictions). ONE vocabulary for both backends —
 *  the field set is defined here and nowhere else (spec:
 *  docs/specs/2026-08-30-local-archive-eviction-accounting.md). */
export interface EvictionAccounting {
  projectId: string;
  /** the cap that forced the eviction (TWIN_ARCHIVE_CAP at write time) */
  cap: number;
  /** lifetime count of audit records this project's cap has deleted */
  totalEvicted: number;
  /** ISO of the most recent eviction */
  lastEvictedAt: string;
  /** the most recent run's victims — id + the archivedAt they were ordered by */
  lastBatch: { id: string; archivedAt: string }[];
}
