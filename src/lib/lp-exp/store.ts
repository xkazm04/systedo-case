/** Per-project landing-page-experiments store — backend dispatcher + read-modify-write
 *  helpers. Local node:sqlite when LOCAL_DB is on, else Firestore; the backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module.
 *  Project-scoped (the experiments belong to the project). Server-only. Mirrors
 *  annotations/store; the pure state transitions live in ./types. */
import "server-only";
import { LOCAL_DB } from "@/lib/local-mode";
import type { LpExperiment } from "./sample";
import {
  addExperiment,
  hostExperiment,
  removeExperiment,
  replaceExperiment,
  syncArmCounts,
  unhostExperiment,
  type ArmTotals,
  type LpExperimentState,
  type SanitizedExperimentInput,
} from "./types";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

/** The project's saved experiments blob, or null when nothing has been created. */
export async function getExperiments(projectId: string): Promise<LpExperimentState | null> {
  return (await backend()).getExperiments(projectId);
}

/** Replace the project's experiments blob. */
export async function saveExperiments(projectId: string, state: LpExperimentState): Promise<void> {
  return (await backend()).saveExperiments(projectId, state);
}

/** Drop a project's experiments (→ reverts to the seeded sample experiments). */
export async function clearExperiments(projectId: string): Promise<void> {
  return (await backend()).clearExperiments(projectId);
}

/** Every persisted experiment for a project (newest-first). Never throws — a store
 *  hiccup degrades to "no experiments" so the module + pattern miner never break on it. */
export async function listExperiments(projectId: string): Promise<LpExperiment[]> {
  try {
    return (await getExperiments(projectId))?.items ?? [];
  } catch {
    return [];
  }
}

/** Read-modify-write: create one sanitized experiment (re-capped) and persist. Returns
 *  the created experiment + the next full list so the route can echo it back. A read
 *  hiccup degrades to a fresh blob so a first create never fails on a missing doc. */
export async function createExperiment(
  projectId: string,
  input: SanitizedExperimentInput
): Promise<{ created: LpExperiment; items: LpExperiment[] }> {
  let cur: LpExperimentState | null = null;
  try {
    cur = await getExperiments(projectId);
  } catch {
    cur = null;
  }
  const { state, created } = addExperiment(cur, input);
  await saveExperiments(projectId, state);
  return { created, items: state.items };
}

/** Read-modify-write: replace one experiment's editable fields by id. Returns the next
 *  list, or null when the id is unknown (so the route can 404). */
export async function updateExperiment(
  projectId: string,
  id: string,
  input: SanitizedExperimentInput
): Promise<LpExperiment[] | null> {
  const cur = await getExperiments(projectId);
  const { state, found } = replaceExperiment(cur, id, input);
  if (!found) return null;
  await saveExperiments(projectId, state);
  return state.items;
}

// --- W3-B · the hosted-page bindings ------------------------------------------
// Read-modify-write around the pure transitions in ./types, so the publish route,
// the unpublish path and the sync step share ONE way of moving these fields.

/** Bind an experiment to a published `/m/{slug}` page and stamp its arm identities.
 *  Returns false (no write) when the id is unknown, so the route can refuse instead
 *  of publishing a page whose counters point at nothing. */
export async function setExperimentHosted(
  projectId: string,
  id: string,
  armIds: readonly string[],
  slug: string
): Promise<boolean> {
  const cur = await getExperiments(projectId);
  const { state, found } = hostExperiment(cur, id, armIds, slug);
  if (!found) return false;
  await saveExperiments(projectId, state);
  return true;
}

/** Take an experiment's hosted binding off (the arm ids stay — see unhostExperiment).
 *  Best-effort by contract: the caller is unpublishing a page, and a bookkeeping write
 *  that fails must not leave the PAGE live, so callers ignore the result. */
export async function clearExperimentHosted(projectId: string, id: string): Promise<boolean> {
  const cur = await getExperiments(projectId);
  const { state, found } = unhostExperiment(cur, id);
  if (!found) return false;
  await saveExperiments(projectId, state);
  return true;
}

/** Overwrite one experiment's identified arms with the counter totals. Returns whether
 *  anything actually MOVED — a project whose numbers are unchanged costs no write,
 *  which is what makes running the sync step every tick cheap. */
export async function applyArmCounts(
  projectId: string,
  id: string,
  totals: ReadonlyMap<string, ArmTotals>
): Promise<boolean> {
  const cur = await getExperiments(projectId);
  const { state, found, changed } = syncArmCounts(cur, id, totals);
  if (!found || !changed) return false;
  await saveExperiments(projectId, state);
  return true;
}

/** Read-modify-write: remove one experiment by id. Returns false (no write) when the
 *  project has no blob or the id is unknown, so the route can 404. */
export async function deleteExperiment(projectId: string, id: string): Promise<boolean> {
  const cur = await getExperiments(projectId);
  if (!cur) return false;
  const { state, found } = removeExperiment(cur, id);
  if (!found) return false;
  await saveExperiments(projectId, state);
  return true;
}
