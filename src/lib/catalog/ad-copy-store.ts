/** Per-project persisted ad-copy store — the read-modify-write layer behind
 *  "generate ad copy once, keep it per SKU". The pure state transitions + hashing
 *  live in ./ad-copy; this is the thin store dispatcher. Server-only.
 *
 *  STORAGE CHOICE (documented): this store RIDES the existing `project_state` table
 *  (key "adCopy") rather than introducing a new blob table + sqlite migration. The
 *  reasons: (1) project_state exists for exactly this purpose — "module state that
 *  used to live only in the browser" (its own DDL comment) — which is precisely what
 *  persisted ad copy is; (2) it gives BOTH backends (Firestore + LOCAL_DB sqlite) for
 *  free through the project_state trio, no new table on either side; and (3) it adds
 *  NO migration, so it can't collide with the reserved-version ledger the concurrently
 *  developed contexts share (the db-migrations golden pins the exact version list).
 *  The blob is bounded by AD_COPY_SKU_CAP (≤ the catalog cap), well under the
 *  project_state size ceiling. Project deletion already cascades project_state, so ad
 *  copy is cleaned up with the project automatically. */
import "server-only";
import {
  getProjectState,
  mutateProjectState,
  saveProjectState,
} from "@/lib/project-state/store";
import { PROJECT_STATE_KEYS } from "@/lib/project-state/keys";
import {
  upsertAdCopy,
  type AdCopyState,
  type StoredAdCopy,
} from "./ad-copy";

/** The project_state key the ad-copy blob lives under — declared in the central
 *  registry, so a second feature cannot claim the same key without a compile error. */
const AD_COPY_KEY = "adCopy" satisfies keyof typeof PROJECT_STATE_KEYS;

/** The project's saved ad copy, or null when nothing has been generated yet. */
export async function getAdCopy(userId: string, projectId: string): Promise<AdCopyState | null> {
  return getProjectState<AdCopyState>(userId, projectId, AD_COPY_KEY);
}

/** Replace the project's whole ad-copy blob. */
export async function saveAdCopy(userId: string, projectId: string, state: AdCopyState): Promise<void> {
  return saveProjectState(userId, projectId, AD_COPY_KEY, state);
}

/** Read-modify-write: upsert one SKU's copy (regenerate overwrites in place) and
 *  persist. Runs through the store's compare-and-swap helper, so two SKUs generated
 *  at the same moment BOTH land — the previous read-then-save let whichever finished
 *  last silently drop the other's copy. `upsertAdCopy` is pure, so re-applying it on
 *  a lost race is safe. A store hiccup on the read still degrades to a fresh blob so
 *  a first save never fails on a missing doc. Returns the persisted blob. */
export async function recordAdCopy(
  userId: string,
  projectId: string,
  entry: StoredAdCopy
): Promise<AdCopyState> {
  return mutateProjectState<AdCopyState>(userId, projectId, AD_COPY_KEY, (cur) =>
    upsertAdCopy(cur, entry)
  );
}
