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
}
