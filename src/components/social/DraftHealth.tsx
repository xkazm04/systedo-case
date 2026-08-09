"use client";

/** The degraded-answer state for the social draft clients — a thin composition of
 *  the EXISTING ai primitives (DegradedNote), not a fork: one component all three
 *  draft surfaces (Composer, WeekPlanner, ContentSchedule) render from the same
 *  {@link SocialDraftMeta}, so a truncated or wrong-language caption is flagged the
 *  same way everywhere. Renders nothing for a clean answer (meta null / no note
 *  needed) — the healthy path keeps its exact existing markup. */
import { DegradedNote } from "@/components/ai/primitives";
import { needsDraftNote, type SocialDraftMeta } from "@/lib/social/draft-meta";

export default function DraftHealth({
  meta,
  onRetry,
}: {
  meta: SocialDraftMeta | null;
  /** re-run affordance; omitted where a single retry handle doesn't exist (batch) */
  onRetry?: () => void;
}) {
  if (!needsDraftNote(meta) || !meta) return null;
  return (
    <>
      {meta.degraded && <DegradedNote onRetry={onRetry} />}
      {meta.languageMismatch && <DegradedNote kind="language" onRetry={onRetry} />}
    </>
  );
}
