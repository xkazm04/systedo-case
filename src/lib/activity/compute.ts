/** Activity-feed filtering + rollups. Pure (framework-free), tested. */
import type { ActivityActor, ActivityEvent, ActivitySeverity } from "./sample";
import type { ActivityRecord } from "@/lib/campaigns/activity";

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

/** RFC-4180 CSV cell escaping — re-exported from the shared `@/lib/export` so the
 *  activity feed and the rest of the app share one escaping rule (now including
 *  bare-CR handling the local copy was missing); consumers still resolve it from
 *  this module path. */
export { csvCell } from "@/lib/export";

const DAY_MS = 86_400_000;

/** Module + severity a legacy campaign event maps to when it carries neither. */
const MODULE_FOR_KIND: Record<string, string> = {
  budget_shift: "kampane", pause: "kampane", sync: "kampane", alert: "kampane", report: "reporty", update: "nastaveni",
};
const SEVERITY_FOR_KIND: Record<string, ActivitySeverity> = {
  budget_shift: "info", pause: "warning", sync: "info", alert: "warning", report: "info", update: "info",
};

/** "Vy"/"You" → you; auto/sync labels → system; any other named actor → a person. */
export function actorFor(actor: string | undefined): ActivityActor {
  if (!actor) return "system";
  if (/^(vy|you)$/i.test(actor.trim())) return "you";
  if (/auto|synchron|sync/i.test(actor)) return "system";
  return "you";
}

/** Map a live activity record (free-text title, already localized) into the
 *  module's ActivityEvent shape. Uses the record's module/severity when present,
 *  else infers them from the kind. `nowMs` grounds the relative age. Pure. */
export function recordToEvent(r: ActivityRecord, nowMs: number): ActivityEvent {
  return {
    id: r.id,
    module: r.module ?? MODULE_FOR_KIND[r.kind] ?? "kampane",
    tmpl: "",
    severity: r.severity ?? SEVERITY_FOR_KIND[r.kind] ?? "info",
    actor: actorFor(r.actor),
    daysAgo: Math.max(0, Math.floor((nowMs - Date.parse(r.at)) / DAY_MS)),
    params: {},
    text: r.detail ? `${r.title} — ${r.detail}` : r.title,
  };
}
