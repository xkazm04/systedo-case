/** Activity-feed filtering + rollups. Pure (framework-free), tested. */
import type { ActivityEvent, ActivitySeverity } from "./sample";

export interface ActivityFilter {
  /** module key, or "all" */
  module: string;
  severity: ActivitySeverity | "all";
  /** only events within this many days; 0 = no limit */
  windowDays: number;
}

export function filterActivity(events: ActivityEvent[], f: ActivityFilter): ActivityEvent[] {
  return events.filter((e) => {
    if (f.module !== "all" && e.module !== f.module) return false;
    if (f.severity !== "all" && e.severity !== f.severity) return false;
    if (f.windowDays > 0 && e.daysAgo > f.windowDays) return false;
    return true;
  });
}

export function severityCounts(events: ActivityEvent[]): Record<ActivitySeverity, number> {
  const out: Record<ActivitySeverity, number> = { info: 0, success: 0, warning: 0, critical: 0 };
  for (const e of events) out[e.severity]++;
  return out;
}

/** Distinct module keys present in the feed, in first-seen order — populates the
 *  module filter so it only offers modules that actually have events. */
export function activeModules(events: ActivityEvent[]): string[] {
  const seen: string[] = [];
  for (const e of events) if (!seen.includes(e.module)) seen.push(e.module);
  return seen;
}

/** RFC-4180-safe CSV cell (quote when it contains a comma, quote or newline). */
export function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
