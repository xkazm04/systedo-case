/** The shared cross-module signal model. Every module emits `Recommendation`s
 *  from its data; the Overview command center and (later) an alerts inbox consume
 *  them. This is the connective tissue that turns isolated modules into one
 *  product. Framework-free. */

export type Severity = "critical" | "warning" | "opportunity" | "info";

/** Render + sort order (most urgent first). */
export const SEVERITY_ORDER: Severity[] = ["critical", "warning", "opportunity", "info"];

export interface Recommendation {
  id: string;
  /** module key the signal came from — links to /app/[projectId]/[module] */
  module: string;
  /** module label for display */
  moduleLabel: string;
  severity: Severity;
  title: string;
  detail: string;
  /** optional headline metric for context */
  metric?: string;
  /** estimated money at stake (CZK), when a producer can quantify it — drives the
   *  impact ranking so a big leak outranks a small one of the same severity. */
  impactCzk?: number;
  /** PROVENANCE. True when the recommendation was derived from illustrative SAMPLE
   *  data rather than the project's own imported/synced signals — so the surface that
   *  renders it can disclose that, exactly as the module pages it links to already do
   *  (ModulePage's `sample` gutter / LocalSourcePanel's live strip). Absent/false = the
   *  producing signal is live. Never affects ranking: an honest sample rec is still the
   *  most useful thing to show a project that has not connected anything yet — it is
   *  labelled, not demoted. */
  sample?: boolean;
}

/** Impact ranking: severity bucket first (a blocker beats an opportunity), then
 *  money at stake within the bucket, so two same-severity items no longer tie —
 *  the 200k Kč leak sorts above the 200 Kč one. Unknown impact sorts last. */
export function byImpact(a: Recommendation, b: Recommendation): number {
  const sev = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
  if (sev !== 0) return sev;
  return (b.impactCzk ?? -1) - (a.impactCzk ?? -1);
}
