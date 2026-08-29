/** Where the ROLLED-UP conversion summary lives — the thin read/write layer over
 *  `project_state` key "conversionSummary". The pure rollup is ./conversion-events;
 *  the rows are ./conversion-store. Server-only.
 *
 *  STORAGE CHOICE (the outcomes-state precedent, documented for the same reason):
 *  the summary RIDES the existing `project_state` table rather than adding a second
 *  table beside `conversion_events`. It is one bounded blob per project — four
 *  integers plus a row per source — recomputed from scratch on every cron tick,
 *  which is exactly what `project_state` exists for. It costs no migration on either
 *  backend, and project deletion already cascades `project_state`, so a deleted
 *  project's summary goes with it automatically.
 *
 *  The write is a compare-and-swap (`mutateProjectState`) even though only the cron
 *  writes this key: two overlapping ledger invocations are possible by construction,
 *  and the CAS makes the losing one recompute rather than clobber. */
import "server-only";
import { getProjectState, mutateProjectState } from "@/lib/project-state/store";
import { PROJECT_STATE_KEYS } from "@/lib/project-state/keys";
import type { ConversionSourceRow, ConversionSummary } from "./conversion-events";

/** The registry key this blob lives under — declared centrally, so a second feature
 *  cannot claim it without a compile error. */
const SUMMARY_KEY = "conversionSummary" satisfies keyof typeof PROJECT_STATE_KEYS;

function int(v: unknown): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pct(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? 1 : n;
}

/** Coerce whatever is stored into the summary's shape. A blob written by an older
 *  build (or corrupted) must degrade to "nothing measured", never to a fabricated
 *  number on a strip that claims to be measured. */
export function sanitizeConversionSummary(raw: unknown): ConversionSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.bySource)) return null;
  const bySource: ConversionSourceRow[] = [];
  for (const item of o.bySource) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = typeof r.sourceLabel === "string" ? r.sourceLabel.trim() : "";
    if (!label) continue;
    bySource.push({
      sourceLabel: label,
      qualified30d: int(r.qualified30d),
      won30d: int(r.won30d),
      gclidPct: pct(r.gclidPct),
    });
  }
  return {
    qualified30d: int(o.qualified30d),
    won30d: int(o.won30d),
    bySource,
    gclidPct: pct(o.gclidPct),
    updatedAt: typeof o.updatedAt === "string" ? o.updatedAt : "",
  };
}

/** The project's rolled-up conversion summary, or null when the rollup has never run
 *  (or the read failed — both callers treat that as "nothing measured yet"). */
export async function getConversionSummary(
  userId: string,
  projectId: string
): Promise<ConversionSummary | null> {
  return sanitizeConversionSummary(
    await getProjectState<ConversionSummary>(userId, projectId, SUMMARY_KEY)
  );
}

/** Replace the project's summary with a freshly computed one. */
export async function saveConversionSummary(
  userId: string,
  projectId: string,
  summary: ConversionSummary
): Promise<ConversionSummary> {
  return mutateProjectState<ConversionSummary>(userId, projectId, SUMMARY_KEY, () => summary);
}
