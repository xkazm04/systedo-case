/** W3-B — the hosted LP experiment's counters, LOCAL node:sqlite backend (table
 *  `lp_arm_counts`, DDL + migration v30 in src/lib/db.ts). Selected when LOCAL_DB is
 *  on. Server-only. Mirrors the Firestore backend's interface exactly.
 *
 *  `bumpLpCount` is an upsert-INCREMENT (`go_clicks`' shape), not a read-modify-write:
 *  a public landing page is a concurrent write path and two views in the same
 *  millisecond must both count. */
import { getDb } from "@/lib/db";
import type { LpArmCountDay, LpCountKind } from "./counts";

interface Row {
  experiment_id: string;
  arm_id: string;
  day: string;
  views: number;
  conversions: number;
}

/** The two upserts, written out in full rather than assembled around a column name.
 *  `kind` picks a WHOLE STATEMENT, so there is no string-built SQL here even though
 *  the varying part is an identifier a bound parameter cannot carry — the thing
 *  `scripts/sast.mjs` blocks, and the rule is worth more than the four saved lines. */
const UPSERT: Record<LpCountKind, string> = {
  views: `INSERT INTO lp_arm_counts (experiment_id, arm_id, day, project_id, views, conversions)
          VALUES (?, ?, ?, ?, 1, 0)
          ON CONFLICT (experiment_id, arm_id, day)
          DO UPDATE SET views = views + 1, project_id = excluded.project_id`,
  conversions: `INSERT INTO lp_arm_counts (experiment_id, arm_id, day, project_id, views, conversions)
          VALUES (?, ?, ?, ?, 0, 1)
          ON CONFLICT (experiment_id, arm_id, day)
          DO UPDATE SET conversions = conversions + 1, project_id = excluded.project_id`,
};

export async function bumpLpCount(
  experimentId: string,
  armId: string,
  day: string,
  kind: LpCountKind,
  projectId: string
): Promise<void> {
  getDb().prepare(UPSERT[kind]).run(experimentId, armId, day, projectId);
}

export async function listLpCountDays(
  experimentId: string,
  sinceDay: string
): Promise<LpArmCountDay[]> {
  const rows = getDb()
    .prepare(
      `SELECT experiment_id, arm_id, day, views, conversions
         FROM lp_arm_counts
        WHERE experiment_id = ? AND day >= ?
        ORDER BY day ASC, arm_id ASC`
    )
    .all(experimentId, sinceDay) as unknown as Row[];
  return rows.map((r) => ({
    experimentId: r.experiment_id,
    armId: r.arm_id,
    day: r.day,
    views: r.views,
    conversions: r.conversions,
  }));
}

export async function listLpCountProjects(limit = 200): Promise<string[]> {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT project_id FROM lp_arm_counts ORDER BY project_id ASC LIMIT ?"
    )
    .all(limit) as unknown as Array<{ project_id: string }>;
  return rows.map((r) => r.project_id).filter(Boolean);
}

export async function pruneLpCounts(beforeDay: string): Promise<number> {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM lp_arm_counts WHERE day < ?")
    .get(beforeDay) as { n: number } | undefined;
  const n = row?.n ?? 0;
  if (n > 0) db.prepare("DELETE FROM lp_arm_counts WHERE day < ?").run(beforeDay);
  return n;
}

export async function clearLpCounts(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM lp_arm_counts WHERE project_id = ?").run(projectId);
}
