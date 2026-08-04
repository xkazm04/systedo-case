/** THE registry of `project_state` keys.
 *
 *  `project_state` is a generic per-(user, project, key) JSON-blob table, so its keys
 *  used to be ad-hoc string literals scattered across the code that writes them:
 *  "content-schedule"/"reviews" in the state route, "adCopy" in the catalog store,
 *  "distributionVariants" in the distribution store. Nothing connected them, so two
 *  features could pick the SAME key and silently overwrite each other's blob — a
 *  data-loss bug with no compile-time, review-time or runtime signal.
 *
 *  Every key now lives here, once. Because the storage key IS the object property,
 *  a duplicate is a TypeScript error at this declaration (ts1117 "An object literal
 *  cannot have multiple properties with the same name"), which is exactly the
 *  compile-time collision check the ad-hoc literals could never give.
 *
 *  Framework-free and pure (no store, no React) so the client shell, the route layer
 *  and the server stores can all import it. Server-only concerns stay in ./store.
 *
 *  Fields:
 *   • `owner`   — the module key the activity feed attributes this state to. Doubles
 *                 as human documentation of who owns the blob.
 *   • `version` — the CURRENT schema version of the blob's `data`, stamped into the
 *                 stored envelope (see ./envelope). Bump it when the shape changes so
 *                 a reader can migrate rather than guess; version 0 is reserved for
 *                 the legacy, pre-envelope blobs already in the installed base.
 *   • `http`    — true when a CLIENT may read/write this key through
 *                 /api/projects/[id]/state/[key]. Server-owned blobs (ad copy,
 *                 distribution variants) are deliberately false: they are derived
 *                 from generation runs and must not be replaceable wholesale by a
 *                 browser POST. */

/** One registered key's metadata. */
export interface ProjectStateKeySpec {
  /** module key used for activity attribution + ownership documentation */
  owner: string;
  /** current schema version of the blob's `data` (0 is reserved for legacy blobs) */
  version: number;
  /** may a client read/write this key over the state route? */
  http: boolean;
}

/** THE registration point. Adding a `project_state` key means adding one line here;
 *  a colliding key fails to compile. Keep the property names EXACTLY as stored — they
 *  are the on-disk/document keys of the installed base and must never be renamed
 *  without a migration. (The kebab-case/camelCase mix below is PRE-EXISTING: the two
 *  route-driven keys shipped kebab, the three server-owned ones camel. Recorded as
 *  used, deliberately not normalised — a rename is a data migration, not a tidy-up.) */
export const PROJECT_STATE_KEYS = {
  "content-schedule": { owner: "obsah-plan", version: 1, http: true },
  reviews: { owner: "recenze", version: 1, http: true },
  adCopy: { owner: "produkty", version: 1, http: false },
  distributionVariants: { owner: "distribuce", version: 1, http: false },
  contentLibrary: { owner: "ulozeny-obsah", version: 1, http: false },
} as const satisfies Record<string, ProjectStateKeySpec>;

/** Every registered key, as a union — the type every store/route API takes. */
export type ProjectStateKey = keyof typeof PROJECT_STATE_KEYS;

/** Narrow an untrusted string (a route param) to a registered key. */
export function isProjectStateKey(key: string): key is ProjectStateKey {
  return Object.prototype.hasOwnProperty.call(PROJECT_STATE_KEYS, key);
}

/** The registered spec for a key. */
export function projectStateSpec(key: ProjectStateKey): ProjectStateKeySpec {
  return PROJECT_STATE_KEYS[key];
}

/** The keys a client may drive through the state route. */
export function isHttpProjectStateKey(key: string): key is ProjectStateKey {
  return isProjectStateKey(key) && PROJECT_STATE_KEYS[key].http;
}
