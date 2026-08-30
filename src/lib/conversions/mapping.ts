/** WP S3 — the CONVERSION-UPLOAD MAPPING: the operator's standing authorisation to
 *  send this project's ledger rows to Google Ads, and the lifecycle that authorisation
 *  moves through.
 *
 *  WHY A RECORD AND NOT A BUTTON. An offline click-conversion upload is irreversible
 *  and NOT idempotent against Google: the same gclid posted twice against the same
 *  conversion action is counted twice, and there is no retraction endpoint. So the
 *  drain may not be something a click starts — it has to be something a FROZEN,
 *  re-checkable record permits. This module is that record: which conversion action
 *  the rows land in, which ledger kinds go, when the operator last SAW the exact rows
 *  that would be sent (the dry run), and when they approved.
 *
 *  THE ONE RULE THE LIFECYCLE EXISTS FOR: no upload without a dry run the operator
 *  actually looked at, inside {@link DRY_RUN_MAX_AGE_MS}. Changing the action or the
 *  kinds after approval throws the record back to `draft` — the approval was for THAT
 *  mapping, and a mapping the operator never dry-ran is not a mapping they approved.
 *  (The inventory-plan "accepted, mutates nothing" precedent: a change-set envelope is
 *  budget-shaped and cannot express a mapping, so the authorisation rides its own
 *  `project_state` blob instead.)
 *
 *  The lifecycle half is PURE (no clock read, no store, no React) — every instant is
 *  passed in, so "approve refuses a stale dry run" is a unit test with no database.
 *  The store wrapper at the bottom is the only part that touches `project_state`. */
import "server-only";
import { getProjectState, mutateProjectState } from "@/lib/project-state/store";
import { PROJECT_STATE_KEYS } from "@/lib/project-state/keys";
import { CONVERSION_KINDS, type ConversionKind } from "@/lib/leads/conversion-events";

/* ── the record ──────────────────────────────────────────────────────────────── */

export type ConversionUploadStatus = "draft" | "dry-run" | "approved" | "paused";

/** The Google Ads conversion action rows are uploaded into — resource name (the wire
 *  identifier) plus the human name the operator picked it by. */
export interface ConversionUploadAction {
  resourceName: string;
  name: string;
}

/** Which ledger kinds this mapping sends. Both may be off, which is a mapping that
 *  cannot be approved (there is nothing to authorise). */
export interface ConversionUploadKinds {
  qualified: boolean;
  won: boolean;
}

export interface ConversionUploadMapping {
  status: ConversionUploadStatus;
  conversionAction?: ConversionUploadAction;
  kinds: ConversionUploadKinds;
  /** when the operator last ran a dry run, and over how many rows */
  dryRunAt?: string;
  dryRunRows?: number;
  /** what Google's `validateOnly` pass said: true = accepted, false = rejected,
   *  null = not attempted (no live account, or the probe itself failed). NULL IS NOT
   *  A PASS — it is "we could not ask", and the card says so rather than implying a
   *  verdict we never got. */
  dryRunValidated?: boolean | null;
  approvedAt?: string;
  pausedAt?: string;
  /** what the last `conversion-drain` tick actually did for this project */
  lastDrain?: { at: string; uploaded: number; failed: number; batchId: string };
  updatedAt: string;
}

/** How old a dry run may be at the moment of approval. A day: long enough that the
 *  operator can look at the rows, think, and come back; short enough that the ledger
 *  they approved is still substantially the ledger that will be sent. */
export const DRY_RUN_MAX_AGE_MS = 24 * 3_600_000;
/** Rows uploaded per project per drain tick. */
export const DRAIN_BATCH = 200;
/** How many times one row may fail before the drain stops re-offering it. */
export const DRAIN_MAX_ATTEMPTS = 3;
/** Rows a dry run will show/count at most — the same ceiling the drain works under,
 *  so "what the dry run showed" and "what a drain would take" are the same set. */
export const DRY_RUN_MAX_ROWS = 500;

/** Why an approve was refused — a machine code the route turns into copy, so the UI
 *  and this module cannot drift on what "not allowed" means. */
export type ApproveRefusal = "no-action" | "no-kinds" | "no-dry-run" | "stale-dry-run";

/* ── pure lifecycle ──────────────────────────────────────────────────────────── */

/** A never-configured mapping. `draft`, no action, both kinds pre-selected (the
 *  ledger records exactly two, and an operator who gets this far wants both) — but
 *  pre-selection is not authorisation: nothing uploads until the dry-run/approve
 *  path has been walked. */
export function emptyConversionUploadMapping(now: Date): ConversionUploadMapping {
  return {
    status: "draft",
    kinds: { qualified: true, won: true },
    updatedAt: now.toISOString(),
  };
}

function isKinds(raw: unknown): ConversionUploadKinds {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { qualified: o.qualified === true, won: o.won === true };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Coerce whatever is stored into the mapping's shape. Anything unreadable degrades
 *  to `null` → the caller reseeds an empty DRAFT, which is the only safe direction:
 *  a corrupt blob must never be read as an approval. */
export function sanitizeConversionUploadMapping(raw: unknown): ConversionUploadMapping | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const status = str(o.status);
  if (status !== "draft" && status !== "dry-run" && status !== "approved" && status !== "paused") {
    return null;
  }
  const actionRaw = (o.conversionAction ?? null) as Record<string, unknown> | null;
  const resourceName = str(actionRaw?.resourceName);
  const conversionAction: ConversionUploadAction | undefined = resourceName
    ? { resourceName, name: str(actionRaw?.name) || resourceName }
    : undefined;
  const drain = (o.lastDrain ?? null) as Record<string, unknown> | null;
  const drainAt = str(drain?.at);
  return {
    // An `approved` blob whose action went missing cannot authorise anything; it
    // reads back as the draft it effectively is.
    status: status === "draft" || conversionAction ? status : "draft",
    ...(conversionAction ? { conversionAction } : {}),
    kinds: isKinds(o.kinds),
    ...(str(o.dryRunAt) ? { dryRunAt: str(o.dryRunAt) } : {}),
    ...(Number.isFinite(Number(o.dryRunRows)) ? { dryRunRows: Math.max(0, Math.trunc(Number(o.dryRunRows))) } : {}),
    ...(o.dryRunValidated === true || o.dryRunValidated === false || o.dryRunValidated === null
      ? { dryRunValidated: o.dryRunValidated as boolean | null }
      : {}),
    ...(str(o.approvedAt) ? { approvedAt: str(o.approvedAt) } : {}),
    ...(str(o.pausedAt) ? { pausedAt: str(o.pausedAt) } : {}),
    ...(drainAt
      ? {
          lastDrain: {
            at: drainAt,
            uploaded: Math.max(0, Math.trunc(Number(drain?.uploaded) || 0)),
            failed: Math.max(0, Math.trunc(Number(drain?.failed) || 0)),
            batchId: str(drain?.batchId),
          },
        }
      : {}),
    updatedAt: str(o.updatedAt),
  };
}

/** Drop everything the dry run and the approval asserted. Called by every edit that
 *  changes WHAT would be sent — the approval was for the old mapping. */
function toDraft(m: ConversionUploadMapping, now: Date): ConversionUploadMapping {
  const { dryRunAt: _a, dryRunRows: _b, dryRunValidated: _c, approvedAt: _d, pausedAt: _e, ...rest } = m;
  return { ...rest, status: "draft", updatedAt: now.toISOString() };
}

/** Pick (or re-pick) the conversion action. Selecting a DIFFERENT action invalidates
 *  the dry run and the approval; re-selecting the one already chosen is a no-op on
 *  the lifecycle, so an idempotent client save cannot silently un-approve a mapping. */
export function selectConversionAction(
  m: ConversionUploadMapping,
  action: ConversionUploadAction,
  now: Date
): ConversionUploadMapping {
  const resourceName = action.resourceName.trim();
  const next = { resourceName, name: action.name.trim() || resourceName };
  if (m.conversionAction?.resourceName === resourceName && m.conversionAction.name === next.name) {
    return m;
  }
  return { ...toDraft(m, now), conversionAction: next };
}

/** Change which ledger kinds go. Same rule as the action: a different set of rows is
 *  a different mapping, so it needs a fresh dry run. */
export function setConversionKinds(
  m: ConversionUploadMapping,
  kinds: ConversionUploadKinds,
  now: Date
): ConversionUploadMapping {
  if (m.kinds.qualified === kinds.qualified && m.kinds.won === kinds.won) return m;
  return { ...toDraft(m, now), kinds: { qualified: kinds.qualified, won: kinds.won } };
}

/** Record that the operator ran a dry run over `rows` rows. This is the ONLY thing
 *  that makes an approve legal, so it stamps the instant it happened rather than the
 *  instant it is read. An already-approved mapping stays approved — re-dry-running a
 *  live mapping is inspection, not a downgrade. */
export function recordDryRun(
  m: ConversionUploadMapping,
  input: { rows: number; validated: boolean | null },
  now: Date
): ConversionUploadMapping {
  return {
    ...m,
    status: m.status === "approved" ? "approved" : "dry-run",
    dryRunAt: now.toISOString(),
    dryRunRows: Math.max(0, Math.trunc(input.rows)),
    dryRunValidated: input.validated,
    updatedAt: now.toISOString(),
  };
}

/** Is the recorded dry run still evidence at `now`? Pure. */
export function isDryRunFresh(m: ConversionUploadMapping, now: Date): boolean {
  if (!m.dryRunAt) return false;
  const t = Date.parse(m.dryRunAt);
  if (!Number.isFinite(t)) return false;
  const age = now.getTime() - t;
  // A dry run stamped in the future (clock skew) is not evidence either.
  return age >= 0 && age <= DRY_RUN_MAX_AGE_MS;
}

/** Approve the mapping — the moment the drain becomes allowed to send. Refuses,
 *  with a reason, unless there is an action, at least one kind, and a dry run inside
 *  the last 24 h. Approving also clears `pausedAt`, so RESUMING a paused mapping goes
 *  through this same gate: an operator who paused, waited a week and came back has to
 *  look at today's rows before the drain starts again. */
export function approveMapping(
  m: ConversionUploadMapping,
  now: Date
): { ok: true; mapping: ConversionUploadMapping } | { ok: false; reason: ApproveRefusal } {
  if (!m.conversionAction) return { ok: false, reason: "no-action" };
  if (!m.kinds.qualified && !m.kinds.won) return { ok: false, reason: "no-kinds" };
  if (!m.dryRunAt) return { ok: false, reason: "no-dry-run" };
  if (!isDryRunFresh(m, now)) return { ok: false, reason: "stale-dry-run" };
  const { pausedAt: _p, ...rest } = m;
  return {
    ok: true,
    mapping: { ...rest, status: "approved", approvedAt: now.toISOString(), updatedAt: now.toISOString() },
  };
}

/** Stop the drain. Keeps the action, the kinds and the dry-run stamp (so a pause
 *  taken and lifted within the day needs no second dry run), but the status alone is
 *  what {@link isDrainEligible} reads. */
export function pauseMapping(m: ConversionUploadMapping, now: Date): ConversionUploadMapping {
  return { ...m, status: "paused", pausedAt: now.toISOString(), updatedAt: now.toISOString() };
}

/** May the drain send for this mapping RIGHT NOW? The single predicate the drain
 *  step asks; nothing else in this module grants permission.
 *
 *  Deliberately NOT re-checking dry-run freshness: the freshness rule is a gate on
 *  APPROVAL (the operator saw the rows before authorising), not a licence that
 *  expires under a running integration — an approval that silently lapsed after a day
 *  would stop uploads with no event anyone could see. */
export function isDrainEligible(m: ConversionUploadMapping | null): m is ConversionUploadMapping {
  if (!m || m.status !== "approved" || !m.conversionAction) return false;
  return m.kinds.qualified || m.kinds.won;
}

/** The ledger kinds a mapping sends, in the ledger's own order. */
export function mappedKinds(m: ConversionUploadMapping): ConversionKind[] {
  return CONVERSION_KINDS.filter((k) => m.kinds[k]);
}

/** Record what a drain tick did. Never changes the status — a failed batch is not an
 *  un-approval, and a successful one is not an approval. */
export function recordDrain(
  m: ConversionUploadMapping,
  drain: { uploaded: number; failed: number; batchId: string },
  now: Date
): ConversionUploadMapping {
  return {
    ...m,
    lastDrain: { at: now.toISOString(), ...drain },
    updatedAt: now.toISOString(),
  };
}

/* ── store wrapper ───────────────────────────────────────────────────────────── */

const MAPPING_KEY = "conversionUpload" satisfies keyof typeof PROJECT_STATE_KEYS;

/** The project's mapping, or null when it was never configured (or the blob is
 *  unreadable — both mean "nothing is authorised"). */
export async function getConversionUploadMapping(
  userId: string,
  projectId: string
): Promise<ConversionUploadMapping | null> {
  try {
    return sanitizeConversionUploadMapping(
      await getProjectState<ConversionUploadMapping>(userId, projectId, MAPPING_KEY)
    );
  } catch {
    return null;
  }
}

/** Read-modify-write the mapping under the store's compare-and-swap. The mutation
 *  sees the SANITISED current record (or a fresh draft), never a raw blob, so no
 *  caller can be handed a half-parsed approval. */
export async function mutateConversionUploadMapping(
  userId: string,
  projectId: string,
  now: Date,
  mutate: (current: ConversionUploadMapping) => ConversionUploadMapping
): Promise<ConversionUploadMapping> {
  return mutateProjectState<ConversionUploadMapping>(userId, projectId, MAPPING_KEY, (raw) =>
    mutate(sanitizeConversionUploadMapping(raw) ?? emptyConversionUploadMapping(now))
  );
}
