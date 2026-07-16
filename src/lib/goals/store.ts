/** Per-project revenue-goal store — backend dispatcher + read-modify-write helper.
 *  Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is imported
 *  LAZILY so the LOCAL_DB path never evaluates the Firestore module. Project-scoped
 *  (a client's revenue goal belongs to the project, not the volatile Ads account).
 *  Server-only. The pure goal-history primitives live in @/lib/metrics/goal-history. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import { recordGoalChange } from "@/lib/metrics/goal-history";
import type { ProjectGoal } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved revenue goal + history, or null when none set (→ the report
 *  falls back to the sample goal and labels its pacing/attainment "ukázkový cíl"). */
export async function getProjectGoal(projectId: string): Promise<ProjectGoal | null> {
  return (await backend()).getProjectGoal(projectId);
}

/** Replace the project's goal blob. */
export async function saveProjectGoal(projectId: string, goal: ProjectGoal): Promise<void> {
  return (await backend()).saveProjectGoal(projectId, goal);
}

/** Drop a project's goal (→ reverts pacing/attainment to the sample goal). */
export async function clearProjectGoal(projectId: string): Promise<void> {
  return (await backend()).clearProjectGoal(projectId);
}

/** Record a monthly revenue goal effective from `effectiveMonth` (YYYY-MM). Sets the
 *  headline `goal` and appends to the history via the shared `recordGoalChange`
 *  primitive — idempotent BY VALUE: a save that repeats the goal already in force for
 *  that month writes the same history (it never grows the log). Returns the next blob.
 *  A store hiccup on the read degrades to a fresh history so a first save never fails. */
export async function recordProjectGoal(
  projectId: string,
  effectiveMonth: string,
  goal: number
): Promise<ProjectGoal> {
  let cur: ProjectGoal | null = null;
  try {
    cur = await getProjectGoal(projectId);
  } catch {
    cur = null;
  }
  const history = recordGoalChange(cur?.history ?? [], effectiveMonth, goal);
  const next: ProjectGoal = { goal, history };
  await saveProjectGoal(projectId, next);
  return next;
}
