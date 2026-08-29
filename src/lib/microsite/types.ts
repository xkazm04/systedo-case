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

/** W2-C — the payload a `local-landing` microsite renders: ONE service×area page
 *  generated from the coverage gap. `service` and `area` are stored verbatim (the
 *  catalog's own strings), because the coverage overlay matches them back through
 *  the same `coverageKey` fold the import uses — a re-worded copy here would silently
 *  stop flipping the cell it was published for.
 *
 *  Price is carried as the CATALOG number, never as model prose: the renderer prints
 *  this field, so a published page can only ever show a price the server resolved.
 *  There is deliberately no address / phone / opening-hours field — the repo has no
 *  NAP data model and inventing one for a public page would be fabrication. */
export interface LocalPagePayload {
  /** the catalog service the page is about (verbatim, for coverage folding) */
  service: string;
  /** the locality the page targets (verbatim) */
  area: string;
  /** the generated page text (see LocalPageResult in @/lib/ai-types) */
  page: {
    headline: string;
    intro: string;
    sections: { heading: string; body: string }[];
    faq: { q: string; a: string }[];
    cta: string;
    /** "fallback" when the text is the deterministic floor, not a model draft */
    source?: "fallback";
  };
  price?: number;
  priceModel?: string;
  currency?: string;
  /** a contact line the OPERATOR typed (tel:/mailto:) — never generated. Absent on
   *  every page nobody typed one for, and the renderer then shows no contact CTA. */
  contact?: string;
  /** ISO timestamp the draft was generated at */
  generatedAt: string;
}

/** W3-B — ONE arm of a hosted landing-page experiment: the page copy the visitor who
 *  is assigned this arm sees, plus the identity every view and conversion is counted
 *  against. `armId` is the load-bearing field: it is minted server-side at publish
 *  time, rides the rendered page into the conversion beacon, and is the key the
 *  counter table and the sync step both use. */
export interface LpArmCopy {
  armId: string;
  /** the operator-facing arm name (mirrors the experiment's variant label) */
  label: string;
  headline: string;
  intro: string;
  bullets: string[];
  cta: string;
}

/** W3-B — the payload an `lp` microsite renders: every arm of one experiment, served
 *  one per request. It carries NO numbers: an experiment page must never print the
 *  score of the test it is running (a visitor reading "arm B converts better" is a
 *  visitor no longer producing an independent trial), and the figures live in the
 *  counter table where the sync step folds them back into the experiment.
 *
 *  `target` is the CTA destination and is operator-typed, never generated — the same
 *  rule (and the same `tel:`/`mailto:` restriction, widened to `https:` because a
 *  landing page's action is normally a signup URL) as `LocalPagePayload.contact`. */
export interface LpPagePayload {
  /** the owning experiment (the sync step's key back into the lp-exp store) */
  experimentId: string;
  /** the owning PROJECT — stamped on every counter row so the delete cascade can find
   *  them. Public readers never supply it; it is re-derived at publish time. */
  projectId: string;
  /** 2..VARIANT_MAX arms, `armId`s unique */
  arms: LpArmCopy[];
  /** where the CTA sends the visitor (tel: / mailto: / https:), when the operator
   *  typed one. Absent → the CTA is a sentence, not a link (LocalLanding's rule). */
  target?: string;
  /** ISO timestamp the arm copy was generated at */
  generatedAt: string;
}

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
  /** W2-C — the local-landing renderer's content. Additive and optional: absent on
   *  every `performance` site, so no stored blob changes shape and `normalizeConfig`
   *  needs no new branch. A `local-landing` config without it renders nothing and is
   *  refused at publish time (see enableMicrosite). */
  local?: LocalPagePayload;
  /** W3-B — the `lp` renderer's arms. Additive and optional on exactly the `local?`
   *  precedent above: absent on every other kind, so no stored blob changes shape and
   *  `normalizeConfig` needs no new branch. An `lp` config without it renders nothing
   *  and is refused at publish time (see enableMicrosite). */
  lp?: LpPagePayload;
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
