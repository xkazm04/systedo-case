/** Per-project local-signals store — backend dispatcher. Local node:sqlite when
 *  LOCAL_DB is on, else Firestore; the backend is imported LAZILY so the LOCAL_DB
 *  path never evaluates the Firestore module. Project-scoped (the imported ladder
 *  belongs to the project). Server-only. Mirrors report-metrics/store. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { LocalSignals } from "./types";
import { normalizeSignals } from "./import";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's synced local signals, or null when never imported (→ sample).
 *  Normalized on read so legacy blobs (bare-number ladder history) surface in the
 *  canonical dated shape without any read-time rewrite to disk. */
export async function getLocalSignals(projectId: string): Promise<LocalSignals | null> {
  const raw = await (await backend()).getLocalSignals(projectId);
  return raw ? normalizeSignals(raw) : null;
}

/** Replace the project's local signals with a fresh import/sync. */
export async function saveLocalSignals(projectId: string, signals: LocalSignals): Promise<void> {
  return (await backend()).saveLocalSignals(projectId, signals);
}

/** Drop a project's local signals (→ reverts the ladder to sample). */
export async function clearLocalSignals(projectId: string): Promise<void> {
  return (await backend()).clearLocalSignals(projectId);
}
