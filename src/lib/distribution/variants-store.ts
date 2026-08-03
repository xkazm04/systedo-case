/** Per-project persisted distribution variants — the read-modify-write layer
 *  behind "your edited variants survive a refresh". The pure state transitions
 *  live in ./variants; this is the thin store dispatcher. Server-only.
 *
 *  STORAGE CHOICE (documented, per the round-13 precedent): this store RIDES the
 *  existing `project_state` table (key "distributionVariants") rather than adding a
 *  new blob table + sqlite migration. Reasons: (1) project_state exists for exactly
 *  this — "module state that used to live only in the browser" (its own DDL
 *  comment) — which is precisely what an edited channel variant is; (2) it gives
 *  BOTH backends (Firestore + LOCAL_DB sqlite) for free through the project_state
 *  trio, with no new table on either side; and (3) it adds NO migration, so it
 *  cannot collide with the reserved-version ledger the concurrently developed
 *  contexts share — and cannot repeat the failure mode where a table added straight
 *  into the base SCHEMA never gets created on an existing DB. The blob is bounded
 *  by VARIANT_ARTICLE_CAP × the channel count × VARIANT_TEXT_MAX, well under the
 *  project_state size ceiling. Project deletion already cascades project_state, so
 *  variants are cleaned up with the project automatically. */
import "server-only";
import { getProjectState, saveProjectState } from "@/lib/project-state/store";
import { upsertVariant, type StoredVariant, type VariantState } from "./variants";

/** The project_state key the variants blob lives under. */
const VARIANTS_KEY = "distributionVariants";

/** The project's saved variants, or null when nothing has been stored yet. */
export async function getVariants(userId: string, projectId: string): Promise<VariantState | null> {
  return getProjectState<VariantState>(userId, projectId, VARIANTS_KEY);
}

/** Replace the project's whole variants blob. */
export async function saveVariants(
  userId: string,
  projectId: string,
  state: VariantState
): Promise<void> {
  return saveProjectState(userId, projectId, VARIANTS_KEY, state);
}

/** Read-modify-write: upsert one channel's variant for one article and persist. A
 *  store hiccup on the READ degrades to a fresh blob so a first save never fails on
 *  a missing doc — a write failure still propagates, because silently losing the
 *  edit is exactly the bug this store exists to fix. Returns the persisted blob. */
export async function recordVariant(
  userId: string,
  projectId: string,
  articleKey: string,
  title: string,
  entry: StoredVariant
): Promise<VariantState> {
  let cur: VariantState | null = null;
  try {
    cur = await getVariants(userId, projectId);
  } catch {
    cur = null;
  }
  const next = upsertVariant(cur, articleKey, title, entry);
  await saveVariants(userId, projectId, next);
  return next;
}
