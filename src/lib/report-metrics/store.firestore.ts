/** Per-project live-metrics store — FIRESTORE backend. One doc at
 *  `reportMetrics/{projectId}` holding the {meta, rows} blob (a year of daily rows
 *  serialises to ~20 KB, well within a document). Server-only (firebase-admin is
 *  Node-only); imported lazily by the dispatcher so the LOCAL_DB path never pulls
 *  firebase-admin in. Mirrors the local backend's interface. */
import { firestore } from "@/lib/firebase";
import type { ReportMetrics } from "./types";

function metricsDoc(projectId: string) {
  return firestore.collection("reportMetrics").doc(projectId);
}

export async function getReportMetrics(projectId: string): Promise<ReportMetrics | null> {
  const doc = await metricsDoc(projectId).get();
  if (!doc.exists) return null;
  const raw = doc.data()?.data;
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw) as ReportMetrics;
  } catch {
    return null;
  }
}

export async function saveReportMetrics(projectId: string, metrics: ReportMetrics): Promise<void> {
  await metricsDoc(projectId).set({
    data: JSON.stringify(metrics),
    updatedAt: new Date().toISOString(),
  });
}

export async function clearReportMetrics(projectId: string): Promise<void> {
  await metricsDoc(projectId).delete();
}
