/** The microsite registry's data contract — the shape both store backends read and
 *  write, kept beside the store (and re-exported from `@/lib/microsite`, which stays
 *  the public module every caller imports). Framework-free and firebase-free so the
 *  LOCAL_DB path never pulls firebase-admin in through a type import. */

/** What a microsite RENDERS. `performance` is the self-updating proof page every
 *  microsite has been until now; the other two are declared here so the registry can
 *  already carry them, but `enableMicrosite` refuses them (the renderers land in
 *  later waves) — an accepted-but-unrenderable config would publish a blank page at
 *  a public URL. Absent on a stored doc → `performance` (see `normalizeConfig`). */
export type MicrositeKind = "performance" | "local-landing" | "lp";

export interface MicrositeConfig {
  /** stable public slug (the /m/{slug} URL) */
  slug: string;
  /** owning tenant (the account-agnostic tenant key) — pins slug ownership */
  tenant: string;
  /** the owning PROJECT id — the key into the per-project synced-metrics store
   *  (report-metrics), captured at enable time so resolveMicrositeView can substitute
   *  the project's REAL series. Optional: microsites published before this field
   *  existed (and the built-in demo) lack it and stay on the disclosed sample. */
  projectId?: string;
  clientName: string;
  segment: string;
  brandName: string;
  /** white-label accent (hex or CSS color) */
  accentColor: string;
  /** white-label logo URL, rendered in the microsite header (R08) */
  logoUrl?: string;
  /** trailing window in days */
  periodDays: number;
  enabled: boolean;
  /** which renderer the slug resolves to. Optional on the WIRE (documents written
   *  before this field existed have no `kind`), never absent on a value handed to a
   *  caller — every read goes through `normalizeConfig`. */
  kind?: MicrositeKind;
  /** true when the figures are the scaled case-study series, not a tenant's real
   *  synced data — the page then discloses it and is NOT search-indexed, so demo
   *  numbers are never published as indexed "proof". A real, Ads-connected tenant
   *  leaves this false and keeps the indexed proof page. */
  illustrative?: boolean;
  updatedAt: string;
}

/** Is this one of the DECLARED kinds? A runtime guard, because `kind` can arrive
 *  from an untyped request body — which kinds are actually PUBLISHABLE is a separate,
 *  narrower question, and it belongs to policy (`PUBLISHABLE_KINDS` in microsite.ts). */
export function isMicrositeKind(value: unknown): value is MicrositeKind {
  return value === "performance" || value === "local-landing" || value === "lp";
}

/** THE one place a stored config gets its `kind` default. Called by the store
 *  dispatcher on every read, so both backends hand callers the same normalized
 *  value and no reader has to remember that legacy documents predate the field.
 *  Deliberately not a validator: an unrecognised stored `kind` (a document written
 *  by a newer deploy, mid-rollout) is left alone rather than silently rewritten to
 *  `performance` — that would publish the WRONG renderer under a real slug. */
export function normalizeConfig(cfg: MicrositeConfig): MicrositeConfig {
  return cfg.kind === undefined ? { ...cfg, kind: "performance" } : cfg;
}
