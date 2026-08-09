/** Honesty meta of one /api/social/draft response — the flattened envelope's
 *  `status / repaired / violations / languageMismatch` fields, read back into one
 *  shape ALL THREE draft clients (Composer, WeekPlanner, ContentSchedule) branch
 *  on. The route forwards these fields precisely so a truncated or wrong-language
 *  caption stops rendering identically to a clean one; this module is the single
 *  client-side reader, so the three surfaces cannot drift in how they interpret
 *  the same envelope. Pure and framework-free — unit-tested offline. */
import { isDegraded } from "@/lib/llm/output-health";
import type { AiCallStatus } from "@/lib/ai-types";

export interface SocialDraftMeta {
  /** the parse came back thin/truncated (`status === "corrupt"`) */
  degraded: boolean;
  /** the answer is not in the project's language and the one repair didn't fix it */
  languageMismatch: boolean;
  /** the output needed a repair re-prompt to fit the platform limits */
  repaired: boolean;
  /** the limit violations detected in the first output (tooltip material) */
  violations: string[];
}

/** Read the honesty fields out of one draft-route response body. Returns null for
 *  a CLEAN answer (all fields absent/falsy), so callers can render zero extra
 *  chrome on the healthy path by construction — `meta && <DraftHealth …/>`. */
export function draftResponseMeta(json: unknown): SocialDraftMeta | null {
  if (!json || typeof json !== "object") return null;
  const o = json as {
    status?: AiCallStatus;
    repaired?: boolean;
    violations?: unknown;
    languageMismatch?: boolean;
  };
  const meta: SocialDraftMeta = {
    degraded: isDegraded(o.status),
    languageMismatch: o.languageMismatch === true,
    repaired: o.repaired === true,
    violations: Array.isArray(o.violations) ? o.violations.filter((v) => typeof v === "string") : [],
  };
  return meta.degraded || meta.languageMismatch || meta.repaired || meta.violations.length > 0
    ? meta
    : null;
}

/** Whether a meta warrants a user-facing note (the DegradedNote states). A merely
 *  `repaired` answer is fine — the existing pill philosophy treats it as quiet
 *  house-keeping, not a warning. */
export function needsDraftNote(meta: SocialDraftMeta | null): boolean {
  return Boolean(meta && (meta.degraded || meta.languageMismatch));
}

/** Merge the metas of one BATCH run (WeekPlanner drafts up to 7 topics) into a
 *  single verdict: flagged if ANY draft came back degraded or in the wrong
 *  language. Returns null when every draft was clean, mirroring
 *  {@link draftResponseMeta}'s "clean ⇒ null ⇒ no chrome" contract. */
export function mergeDraftMetas(metas: readonly (SocialDraftMeta | null)[]): SocialDraftMeta | null {
  const flagged = metas.filter((m): m is SocialDraftMeta => needsDraftNote(m));
  if (flagged.length === 0) return null;
  return {
    degraded: flagged.some((m) => m.degraded),
    languageMismatch: flagged.some((m) => m.languageMismatch),
    repaired: flagged.some((m) => m.repaired),
    violations: flagged.flatMap((m) => m.violations),
  };
}
