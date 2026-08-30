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
  // The social center's brand-voice field (a short free-text string). Used to live
  // ONLY in localStorage (src/lib/social/brand-storage), so the voice never followed
  // the user across devices; the client hook (useSocialBrand) migrates the local
  // value here on first read (read-old-write-new) and keeps localStorage as the
  // anonymous/offline fallback.
  "social-brand": { owner: "socialni", version: 1, http: true },
  adCopy: { owner: "produkty", version: 1, http: false },
  distributionVariants: { owner: "distribuce", version: 1, http: false },
  contentLibrary: { owner: "ulozeny-obsah", version: 1, http: false },
  orphanLedger: { owner: "nastaveni", version: 1, http: false },
  // WP W2-A — the rolled-up per-channel outcomes of the tenant's own /go links
  // (clicks7d / clicks30d per channel). SERVER-OWNED (`http: false`) on purpose:
  // this blob is a MEASUREMENT, recomputed by the `go-rollup` ledger step from the
  // click counters. A client that could POST it wholesale could write itself any
  // number it liked into a panel labelled "measured", which is the one thing a
  // measurement must never allow.
  organicOutcomes: { owner: "kanaly", version: 1, http: false },
  // W3-A — the advice ledger: what recommendations were actually SHOWN to the
  // operator, and what the signal behind each one did before it went quiet.
  // SERVER-OWNED (`http: false`) for exactly the organicOutcomes reason above: the
  // outcomes on it are a MEASUREMENT. A client that could POST the blob wholesale
  // could write itself "improved" chips, which is the one thing an outcome must
  // never allow. The narrow client affordance (dismiss / undo one subject) goes
  // through /api/projects/[id]/advice, which touches one record, never the blob.
  adviceLedger: { owner: "prehled", version: 1, http: false },
  // W3-C — the rolled-up conversion summary (30-day qualified / won counts, the
  // per-source split, and gclid coverage), recomputed by the `conversion-rollup`
  // ledger step from the `conversion_events` rows. SERVER-OWNED (`http: false`) for
  // the organicOutcomes reason: this blob is a MEASUREMENT, and the strip it feeds
  // decides how many conversions the operator believes they can upload. A client
  // that could POST it wholesale could write itself any coverage number it liked.
  conversionSummary: { owner: "kvalita-leadu", version: 1, http: false },
  // S3 — the LIVE conversion-upload mapping: which Google Ads conversion action the
  // ledger's rows are uploaded into, which kinds go, and where the mapping sits in
  // its dry-run → approve → pause lifecycle. SERVER-OWNED (`http: false`) and NOT for
  // the reason the measurement blobs above are: this one is an AUTHORISATION. Rows
  // uploaded through it reach a third-party processor and cannot be taken back, so
  // the approval must be minted by the guarded upload route (which enforces
  // "a dry run inside the last 24 h") and can never be a wholesale client PUT.
  conversionUpload: { owner: "kvalita-leadu", version: 1, http: false },
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
