/** Shared character bounds (min AND max) for the AI request fields that the
 *  cross-tool seed mappers (handoff.ts, pipeline.ts) hand to the server validators
 *  (validation.ts's validateAdRequest / validateBriefRequest).
 *
 *  The mappers used to mirror only the MAX caps, so a seed below a validator's MIN
 *  (an empty benefits list, a 1-character audience) advertised "submits without
 *  edits" yet was rejected at the NEXT step with a validation error the user could
 *  not connect to where the bad value originated. Both sides now read the same
 *  floors/caps from here, and a mapper emits an honest EMPTY field (the form opens
 *  with a blank required field) rather than a too-short value that fails downstream.
 *  Pure data — safe to import from client and server. */

export interface FieldBound {
  min: number;
  max: number;
}

/** validateAdRequest bounds (product 2–200, benefits 2–600, audience 2–300). */
export const AD_FIELD_LIMITS = {
  product: { min: 2, max: 200 },
  benefits: { min: 2, max: 600 },
  audience: { min: 2, max: 300 },
} as const satisfies Record<string, FieldBound>;

/** validateBriefRequest bounds (topic 2–200, primaryKeyword 2–120, audience 2–300). */
export const BRIEF_FIELD_LIMITS = {
  topic: { min: 2, max: 200 },
  primaryKeyword: { min: 2, max: 120 },
  audience: { min: 2, max: 300 },
} as const satisfies Record<string, FieldBound>;
