/** Per-PROJECT monthly revenue goal — the honest target the live report's pacing +
 *  attainment surfaces are judged against, replacing the illustrative sample goal
 *  baked into the dataset spine.
 *
 *  Deliberately PER-PROJECT (keyed by project id), NOT the account-scoped
 *  campaigns/report-config `revenueGoalHistory`: a report link folds the Ads
 *  customerId into its tenant, so a goal stored there would follow the account, not
 *  the client project. A client's revenue goal belongs to the project. The blob is
 *  `{ goal, history }`: `goal` is the headline target the editor shows, `history` the
 *  append-only timeline `goalForMonth` resolves so each past month is scored against
 *  the goal that was actually in force THAT month.
 *
 *  Framework-free (the pure goal-history primitives do the work); the store trio
 *  persists it, mirroring cost-model / competitors. */
import { sanitizeGoalHistory, type GoalChange } from "@/lib/metrics/goal-history";

export interface ProjectGoal {
  /** the monthly revenue goal in force NOW (CZK, > 0) */
  goal: number;
  /** append-only dated changes; `goalForMonth` resolves the per-month goal from it */
  history: GoalChange[];
}

/** Coerce a stored/partial blob to a clean {@link ProjectGoal}, or null when there is
 *  no usable goal (absent / non-positive → the report falls back to the sample goal
 *  and labels its pacing/attainment "ukázkový cíl"). Pure. */
export function sanitizeProjectGoal(raw: unknown): ProjectGoal | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const goal = Number(o.goal);
  if (!Number.isFinite(goal) || goal <= 0) return null;
  return { goal, history: sanitizeGoalHistory(o.history) };
}
