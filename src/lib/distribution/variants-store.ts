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
import {
  getProjectState,
  mutateProjectState,
  saveProjectState,
} from "@/lib/project-state/store";
import { PROJECT_STATE_KEYS } from "@/lib/project-state/keys";
import {
  upsertSource,
  upsertVariant,
  type StoredArticleSource,
  type StoredVariant,
  type VariantState,
} from "./variants";

/** The project_state key the variants blob lives under — declared in the central
 *  registry, so a second feature cannot claim the same key without a compile error. */
const VARIANTS_KEY = "distributionVariants" satisfies keyof typeof PROJECT_STATE_KEYS;

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

/** Read-modify-write: upsert one channel's variant for one article and persist.
 *  Runs through the store's compare-and-swap helper, so two channels generated at
 *  the same moment BOTH land — the previous read-then-save let whichever finished
 *  last silently drop the other's variant, which is the very loss this store exists
 *  to prevent. `upsertVariant` is pure, so re-applying it on a lost race is safe. A
 *  store hiccup on the READ still degrades to a fresh blob so a first save never
 *  fails on a missing doc; a write failure still propagates. Returns the persisted
 *  blob. */
export async function recordVariant(
  userId: string,
  projectId: string,
  articleKey: string,
  title: string,
  entry: StoredVariant
): Promise<VariantState> {
  return mutateProjectState<VariantState>(userId, projectId, VARIANTS_KEY, (cur) =>
    upsertVariant(cur, articleKey, title, entry)
  );
}

/** Read-modify-write: record one article handed into Distribuce from elsewhere in
 *  the app (re-sending a revised draft updates it in place). Rides the SAME blob as
 *  the variants — one record per project, one transport for the whole handoff — and
 *  therefore races the variant writes above; the same compare-and-swap keeps both.
 *  Returns the persisted blob. */
export async function recordSource(
  userId: string,
  projectId: string,
  source: StoredArticleSource
): Promise<VariantState> {
  return mutateProjectState<VariantState>(userId, projectId, VARIANTS_KEY, (cur) =>
    upsertSource(cur, source)
  );
}
