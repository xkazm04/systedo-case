/** Per-project competitor store — backend dispatcher (LOCAL node:sqlite vs Firestore,
 *  lazily imported). Project-scoped. Server-only. Mirrors cost-model/store. */
/** KEYING INVARIANT: rows here are keyed by projectId ALONE (no uid), unlike the
 *  catalog/warehouse/project-state stores which key by (uid, projectId). This is safe
 *  ONLY because project ids are UUID-unique across all users and EVERY route into this
 *  store first passes requireOwnedProject (or rejectUnknownProject for the tenant-keyed
 *  callers) — never call it with a wire-supplied id that has not been ownership-checked.
 *  deleteProjectCascade scrubs by project id for the same reason. */
import { LOCAL_DB } from "@/lib/local-mode";
import type { CompetitorSet } from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's competitor set, or null when none entered (→ no comparative grounding). */
export async function getCompetitors(projectId: string): Promise<CompetitorSet | null> {
  return (await backend()).getCompetitors(projectId);
}

/** Replace the project's competitor set. */
export async function saveCompetitors(projectId: string, set: CompetitorSet): Promise<void> {
  return (await backend()).saveCompetitors(projectId, set);
}

/** Drop a project's competitor set. */
export async function clearCompetitors(projectId: string): Promise<void> {
  return (await backend()).clearCompetitors(projectId);
}
