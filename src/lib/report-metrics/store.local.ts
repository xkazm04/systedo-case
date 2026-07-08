/** Per-project live-metrics store — LOCAL node:sqlite backend. One row per project
 *  in `.data/systedo.db` (table `report_metrics`, DDL in src/lib/db.ts) holding the
 *  {meta, rows} blob. Selected when LOCAL_DB is on. Server-only. Mirrors the
 *  Firestore backend's interface. */
import { getDb } from "@/lib/db";
import type { ReportMetrics } from "./types";

interface MetricsRow {
  data: string;
}

export async function getReportMetrics(projectId: string): Promise<ReportMetrics | null> {
  const row = getDb()
    .prepare("SELECT data FROM report_metrics WHERE project_id = ?")
    .get(projectId) as MetricsRow | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as ReportMetrics;
  } catch {
    return null;
  }
}

export async function saveReportMetrics(projectId: string, metrics: ReportMetrics): Promise<void> {
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO report_metrics (project_id, data, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT (project_id)
       DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(projectId, JSON.stringify(metrics), now);
}

export async function clearReportMetrics(projectId: string): Promise<void> {
  getDb().prepare("DELETE FROM report_metrics WHERE project_id = ?").run(projectId);
}
