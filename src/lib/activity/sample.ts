/** Illustrative project-wide activity — a unified "what happened across every
 *  module" timeline (the account-level generalization of the campaigns activity
 *  feed in src/lib/campaigns/activity.ts). Seeded off the project id so it's
 *  stable and per-project; events carry a template key + params so the UI can
 *  localise the title. Real seam: recordActivity() from every mutation/sync/alert
 *  path. Framework-free. */
import type { Project } from "@/lib/projects/types";
import type { Locality } from "@/lib/catalog/offering";
import { seed01 } from "@/lib/project-data/seed";

export type ActivitySeverity = "info" | "success" | "warning" | "critical";
export type ActivityActor = "ai" | "system" | "you";

export interface ActivityEvent {
  id: string;
  /** module key the event belongs to (matches the module registry) */
  module: string;
  /** localizable template key (resolved in the UI) */
  tmpl: string;
  severity: ActivitySeverity;
  actor: ActivityActor;
  /** age in days (0 = today) */
  daysAgo: number;
  params: { area?: string; name?: string; value?: number };
  /** pre-localized literal title (set when mapped from a live ActivityRecord,
   *  which already stores a written title); the UI renders it instead of `tmpl`. */
  text?: string;
}

interface Recipe {
  module: string;
  tmpl: string;
  severity: ActivitySeverity;
  actor: ActivityActor;
  needsArea?: boolean;
  names?: string[];
  valueRange?: [number, number];
}

const CAMPAIGN_NAMES = ["Search · Brand", "Search · Služby", "Performance Max · Leady", "Demand Gen"];
const POST_NAMES = ["Nabídka týdne", "Tip pro klienty", "Novinka na pobočce", "Spokojený zákazník"];
const INTEGRATION_NAMES = ["Google Ads", "Google Business Profile", "Resend", "Meta"];

const RECIPES: Recipe[] = [
  { module: "recenze", tmpl: "review_reply_drafted", severity: "success", actor: "ai", needsArea: true },
  { module: "recenze", tmpl: "review_flagged", severity: "warning", actor: "you", needsArea: true },
  { module: "recenze", tmpl: "review_published", severity: "success", actor: "you", needsArea: true },
  { module: "mapa", tmpl: "map_rank_up", severity: "success", actor: "system", needsArea: true, valueRange: [1, 3] },
  { module: "mapa", tmpl: "map_rank_down", severity: "warning", actor: "system", needsArea: true, valueRange: [8, 14] },
  { module: "mapa", tmpl: "keyword_top3", severity: "success", actor: "system", needsArea: true },
  { module: "obsah-plan", tmpl: "post_published", severity: "info", actor: "system", names: POST_NAMES },
  { module: "kampane", tmpl: "budget_shift", severity: "info", actor: "ai", names: CAMPAIGN_NAMES },
  { module: "kampane", tmpl: "sync", severity: "info", actor: "system" },
  { module: "lokalni", tmpl: "location_needs", severity: "critical", actor: "system", needsArea: true },
  { module: "lokalni", tmpl: "coverage_gap", severity: "warning", actor: "ai", needsArea: true },
  { module: "integrace", tmpl: "integration_action", severity: "warning", actor: "system", names: INTEGRATION_NAMES },
];

export function activityForProject(project: Project, localities: Locality[], count = 24): ActivityEvent[] {
  const areas = localities.length > 0 ? localities.map((l) => l.name) : ["Praha"];
  return Array.from({ length: count }, (_, i) => {
    const s = (k: string) => seed01(`${project.id}:act:${i}:${k}`);
    const rec = RECIPES[Math.floor(s("rec") * RECIPES.length)];
    const params: ActivityEvent["params"] = {};
    if (rec.needsArea) params.area = areas[Math.floor(s("area") * areas.length)];
    if (rec.names) params.name = rec.names[Math.floor(s("name") * rec.names.length)];
    if (rec.valueRange) {
      params.value = rec.valueRange[0] + Math.round(s("val") * (rec.valueRange[1] - rec.valueRange[0]));
    }
    return {
      id: `act-${i}`,
      module: rec.module,
      tmpl: rec.tmpl,
      severity: rec.severity,
      actor: rec.actor,
      daysAgo: Math.floor(s("days") * 45),
      params,
    };
  }).sort((a, b) => a.daysAgo - b.daysAgo);
}
