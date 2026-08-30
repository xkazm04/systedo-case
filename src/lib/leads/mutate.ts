/** Write-side operations on a contact that must ALWAYS happen together: a stage
 *  move that does not append a `stage_change` activity is a stage move that makes
 *  velocity uncomputable, and an erase that does not leave a tombstone silently
 *  rewrites historic funnel counts. Keeping them here — not inline in a route —
 *  is what stops the next caller from doing half of it.
 *
 *  Server-only (writes the store). The route handlers stay thin. */
import "server-only";
import {
  clampTags,
  clampText,
  consentInForce,
  EMAIL_MAX,
  NAME_MAX,
  NOTE_MAX,
  PHONE_MAX,
  isTerminalStage,
  type Activity,
  type ConsentPurpose,
  type ConsentRecord,
  type Contact,
  type LawfulBasis,
  type LostReason,
  type PipelineStage,
} from "./types";
import { contactKeys } from "./normalize";
import { appendActivity, deleteActivities, listActivities, saveContact } from "./store";
import { newLeadId } from "./apply";
import { scoreContact } from "./score";
import { conversionFromStageChange } from "./conversion-events";
import { appendConversionEvents } from "./conversion-store";

export interface StageChangeInput {
  to: PipelineStage;
  /** required by convention when moving to a terminal negative — a counted reason,
   *  not free text (the twin's REJECT_REASONS precedent) */
  reason?: LostReason;
  note?: string;
  actorId?: string;
}

/** Move a contact's stage, appending the `stage_change` activity that makes
 *  time-in-stage and real daysToQualify/daysToClose computable. A no-op move (same
 *  stage) writes nothing, so a double-clicked button does not pollute the timeline. */
export async function changeStage(
  projectId: string,
  contact: Contact,
  input: StageChangeInput,
  now: Date = new Date()
): Promise<Contact> {
  if (contact.stage === input.to) return contact;
  const nowIso = now.toISOString();

  const activity: Activity = {
    id: newLeadId("sc"),
    at: nowIso,
    kind: "stage_change",
    actor: { type: "user", ...(input.actorId ? { id: input.actorId } : {}) },
    summary: `${contact.stage} → ${input.to}`,
    refs: {
      from: contact.stage,
      to: input.to,
      ...(input.reason ? { reason: input.reason } : {}),
    },
    ...(input.note ? { body: clampText(input.note, NOTE_MAX) } : {}),
  };

  const next: Contact = {
    ...contact,
    stage: input.to,
    stageEnteredAt: nowIso,
    lastActivityAt: nowIso,
    updatedAt: nowIso,
    ...(isTerminalStage(input.to)
      ? {
          ...(input.reason ? { lostReason: input.reason } : {}),
          ...(input.note ? { lostNote: clampText(input.note, NOTE_MAX) } : {}),
        }
      : { lostReason: undefined, lostNote: undefined }),
  };

  await saveContact(projectId, next);
  await appendActivity(projectId, contact.id, activity);

  // WP W3-C — the CONVERSION LEDGER (append site 1). A crossing into qualified / won
  // is the outcome an ad platform can only optimise toward if it is told about it,
  // and this is the instant it happens. BEST-EFFORT and AFTER the contact save: the
  // ledger explains a stage move, it is never a precondition for one, so a ledger
  // outage must never fail the move the operator just made.
  //
  // A rank REGRESSION (qualified → working, → lost) emits NOTHING. Retracting an
  // already-uploaded conversion is a live-API problem (WP S3); the file formats
  // cannot express it, and a silent negative row would be a lie. The upsert id
  // `${contactId}_${kind}` makes a later re-qualify update the existing row instead
  // of double-counting.
  try {
    await appendConversionEvents(
      projectId,
      conversionFromStageChange(contact.stage, input.to, next, now)
    );
  } catch (err) {
    console.error(`[leads] conversion ledger append failed for ${contact.id}:`, err);
  }
  return next;
}

export interface ContactPatch {
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  notes?: string;
  tags?: unknown;
  ownerId?: string;
  firstRespondedAt?: string;
}

/** Patch the editable identity/ownership fields, re-deriving the dedup keys from
 *  whatever the edit produced (a key can never drift from its payload) and
 *  appending a `field_change` entry so the timeline explains the record. */
export async function patchContact(
  projectId: string,
  contact: Contact,
  patch: ContactPatch,
  now: Date = new Date()
): Promise<Contact> {
  const nowIso = now.toISOString();
  const changed: string[] = [];

  const next: Contact = { ...contact, updatedAt: nowIso };
  const setText = (field: "name" | "email" | "phone" | "companyName" | "notes", max: number) => {
    if (patch[field] === undefined) return;
    const v = clampText(patch[field], max);
    if (v === next[field]) return;
    next[field] = v;
    changed.push(field);
  };
  setText("name", NAME_MAX);
  setText("email", EMAIL_MAX);
  setText("phone", PHONE_MAX);
  setText("companyName", NAME_MAX);
  setText("notes", NOTE_MAX);

  if (patch.tags !== undefined) {
    next.tags = clampTags(patch.tags);
    changed.push("tags");
  }
  if (patch.ownerId !== undefined) {
    next.ownerId = clampText(patch.ownerId, NAME_MAX);
    next.assignedAt = nowIso;
    next.assignmentReason = "manual";
    changed.push("ownerId");
  }
  if (patch.firstRespondedAt !== undefined && !next.firstRespondedAt) {
    // First response is recorded ONCE — that is what makes the SLA clock meaningful.
    next.firstRespondedAt = patch.firstRespondedAt;
    changed.push("firstRespondedAt");
  }

  if (changed.length === 0) return contact;

  // Re-derive the dedup keys from the edited identity.
  const keys = contactKeys({ name: next.name, email: next.email, phone: next.phone });
  next.emailKey = keys.emailKey;
  next.phoneKey = keys.phoneKey;
  next.nameKey = keys.nameKey;

  const activities = await listActivities(projectId, contact.id, 200);
  next.score = scoreContact({
    contact: next,
    activities,
    firstRespondedAt: next.firstRespondedAt,
    lastActivityAt: next.lastActivityAt,
    now,
  });

  await saveContact(projectId, next);
  await appendActivity(projectId, contact.id, {
    id: newLeadId("fc"),
    at: nowIso,
    kind: "field_change",
    actor: { type: "user" },
    summary: changed.join(", "),
  });
  return next;
}

/* ── consent (WP S2) ─────────────────────────────────────────────────────────── */

/** The longest piece of evidence text we store — the exact wording the person was
 *  shown. Long enough for a real consent paragraph, bounded like every other field. */
export const EVIDENCE_MAX = 2_000;

export interface ConsentChangeInput {
  purpose: ConsentPurpose;
  granted: boolean;
  basis: LawfulBasis;
  /** the exact wording shown to the person, or how it was obtained — the evidence */
  evidenceText?: string;
  /** where it was captured; defaults to "operator" (someone typed it in the CRM) */
  origin?: string;
  actorId?: string;
}

/** WP S2 — RECORD A CONSENT DECISION. This is the path that lets the twin's delivery
 *  gate ever OPEN: `mayContact` fails closed, so without a way to write a grant, a
 *  `consentRequired` channel could never send at all.
 *
 *  APPEND-ONLY, and that is a legal property rather than a style choice: consent has
 *  to be provable at a point in time, so nothing here rewrites an existing record.
 *   • A GRANT appends a new `ConsentRecord`.
 *   • A WITHDRAWAL stamps `withdrawnAt` on the record currently in force for that
 *     purpose AND appends a `granted: false` record. The stamp is what makes
 *     `consentInForce` stop returning it; the appended row is what makes the
 *     withdrawal itself visible in the history rather than inferable from an absence.
 *  A `consent_change` activity is appended either way — a consent decision nobody can
 *  see in the timeline is a consent decision nobody can defend. */
export async function changeConsent(
  projectId: string,
  contact: Contact,
  input: ConsentChangeInput,
  now: Date = new Date()
): Promise<Contact> {
  const nowIso = now.toISOString();
  const evidenceText = clampText(input.evidenceText, EVIDENCE_MAX);
  const record: ConsentRecord = {
    purpose: input.purpose,
    granted: input.granted,
    basis: input.basis,
    at: nowIso,
    origin: clampText(input.origin, NAME_MAX) ?? "operator",
    ...(evidenceText ? { evidenceText } : {}),
  };

  const previous = input.granted ? null : consentInForce(contact.consent, input.purpose);
  const consent: ConsentRecord[] = [
    ...contact.consent.map((r) =>
      previous && r === previous ? { ...r, withdrawnAt: nowIso } : r
    ),
    record,
  ];

  const next: Contact = { ...contact, consent, lastActivityAt: nowIso, updatedAt: nowIso };
  await saveContact(projectId, next);
  await appendActivity(projectId, contact.id, {
    id: newLeadId("cc"),
    at: nowIso,
    kind: "consent_change",
    actor: { type: "user", ...(input.actorId ? { id: input.actorId } : {}) },
    summary: `${input.granted ? "Souhlas udělen" : "Souhlas odvolán"}: ${input.purpose}`,
    ...(evidenceText ? { body: evidenceText } : {}),
    refs: { purpose: input.purpose, basis: input.basis, granted: String(input.granted) },
  });
  return next;
}

/** Sugar for the two directions, so a caller reads as what it does. */
export function grantConsent(
  projectId: string,
  contact: Contact,
  input: Omit<ConsentChangeInput, "granted">,
  now?: Date
): Promise<Contact> {
  return changeConsent(projectId, contact, { ...input, granted: true }, now);
}

export function withdrawConsent(
  projectId: string,
  contact: Contact,
  input: Omit<ConsentChangeInput, "granted" | "basis"> & { basis?: LawfulBasis },
  now?: Date
): Promise<Contact> {
  return changeConsent(
    projectId,
    contact,
    { ...input, basis: input.basis ?? "consent", granted: false },
    now
  );
}

/** GDPR Art. 17 erasure. Hard-clears every PII field on the contact AND deletes the
 *  whole timeline (which is where message bodies live), then leaves a TOMBSTONE:
 *  the anonymous funnel skeleton — stage, attribution, timestamps — plus
 *  `erasedAt` / `eraseReason`.
 *
 *  Why a tombstone rather than a row delete: Art. 17 does not require destroying
 *  anonymous statistics, and deleting the row would silently change historic funnel
 *  counts in Kvalita leadů — a data-integrity lie told to cover a deletion. The
 *  tombstoned record is never rendered as a person (`isErased`). */
export async function eraseContact(
  projectId: string,
  contact: Contact,
  reason: string,
  now: Date = new Date()
): Promise<Contact> {
  const nowIso = now.toISOString();
  const tombstone: Contact = {
    id: contact.id,
    projectId: contact.projectId,
    stage: contact.stage,
    stageEnteredAt: contact.stageEnteredAt,
    attribution: contact.attribution,
    consent: [],
    tags: [],
    firstSeenAt: contact.firstSeenAt,
    lastActivityAt: contact.lastActivityAt,
    createdAt: contact.createdAt,
    updatedAt: nowIso,
    erasedAt: nowIso,
    eraseReason: clampText(reason, NOTE_MAX) ?? "gdpr-erasure",
    ...(contact.lostReason ? { lostReason: contact.lostReason } : {}),
  };
  // The timeline goes first: if the process dies between the two writes, the worst
  // outcome is a contact whose PII is gone but whose record still says so — never
  // the reverse (a "tombstoned" contact whose message bodies survived).
  await deleteActivities(projectId, contact.id);
  await saveContact(projectId, tombstone);
  return tombstone;
}
