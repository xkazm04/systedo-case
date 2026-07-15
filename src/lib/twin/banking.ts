/** The one banking path every channel shares: turn a generation into an outbox
 *  record with a lifecycle, and move that record between statuses.
 *
 *  Extracted from TwinOutbox so the `leads` inbox (SpeedLeadModule) banks through
 *  exactly the same gate rather than duplicating a second, drifting copy. Pure and
 *  framework-free (no React, no clock, no id source — the caller passes `id` and
 *  `now`), so the mapping unit-tests cleanly and the autonomy verdict lives in the
 *  single place it always has (`decideDraft`).
 *
 *  The server still owns the last word: `enforceAutonomy` re-derives the gate on
 *  every POST, so a status these helpers produce is a client PROPOSAL, never a
 *  trusted fact — the same contract TwinOutbox already relied on. */
import {
  decideDraft,
  type RejectReason,
  type TwinChannel,
  type TwinChannelConfig,
  type TwinDraft,
} from "./types";

/** Everything a fresh generation contributes to a record — the human-editable
 *  `reply` plus the model's own read (confidence/risks) that the gate judges. */
export interface DraftSeed {
  channel: TwinChannel;
  contact: string;
  inbound: string;
  reply: string;
  questions: string[];
  confidence: number;
  risks: string[];
}

/** Bank a generation as a record, running the autonomy gate for its initial
 *  status. Under `auto` a confident, risk-free draft lands `approved` (and carries
 *  a `decidedAt`, since the machine decided it); everything else lands `pending`. */
export function buildDraft(cfg: TwinChannelConfig, seed: DraftSeed, id: string, now: string): TwinDraft {
  const verdict = decideDraft(cfg, { confidence: seed.confidence, risks: seed.risks });
  const draft: TwinDraft = {
    id,
    channel: seed.channel,
    contact: seed.contact,
    inbound: seed.inbound,
    reply: seed.reply,
    questions: seed.questions,
    confidence: seed.confidence,
    risks: seed.risks,
    status: verdict.status,
    autoApproved: verdict.autoApproved,
    createdAt: now,
  };
  if (verdict.autoApproved) draft.decidedAt = now;
  return draft;
}

/** A human pressed Approve — never an auto-approval, however the gate would rule. */
export function asApproved(d: TwinDraft, now: string): TwinDraft {
  return { ...d, status: "approved", autoApproved: false, decidedAt: now };
}

/** A human turned the draft down, with a COUNTED reason (feeds `rejectionPatterns`)
 *  and an optional free-text note. */
export function asRejected(d: TwinDraft, now: string, reason: RejectReason, note?: string): TwinDraft {
  const trimmed = note?.trim();
  const out: TwinDraft = {
    ...d,
    status: "rejected",
    autoApproved: false,
    decidedAt: now,
    rejectReason: reason,
  };
  if (trimmed) out.rejectNote = trimmed;
  else delete out.rejectNote;
  return out;
}

/** The human recorded their own send. Terminal: past the autonomy gate's reach. */
export function asSent(d: TwinDraft, now: string): TwinDraft {
  return { ...d, status: "sent", sentAt: now };
}

/** Append a draft, or REPLACE the record with the same id in place. Flipping a
 *  verdict the gate already banked (auto-approve → reject, approve → sent) must
 *  edit that record, not append a duplicate — otherwise the rejection tally and the
 *  audit trail double-count. */
export function upsertDraft(drafts: TwinDraft[], draft: TwinDraft): TwinDraft[] {
  return drafts.some((d) => d.id === draft.id)
    ? drafts.map((d) => (d.id === draft.id ? draft : d))
    : [...drafts, draft];
}
