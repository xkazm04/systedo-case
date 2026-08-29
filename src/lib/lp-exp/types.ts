/** Persisted landing-page-experiment model. A REAL experiment is the same shape the
 *  evaluate() engine already reads (`LpExperiment` from ./sample: a keyword cluster
 *  with a control + challenger variants and their visitors/signups, plus a
 *  running|done status), but persisted per project through the store trio (Firestore
 *  + LOCAL_DB sqlite twin) instead of scaled from the seeded sample. Framework-free —
 *  the pure sanitizers (never trust the wire) and state transitions live here so they
 *  are unit-testable without any I/O, mirroring annotations/diagnoses/types.
 *
 *  INTEGRITY: a persisted experiment's significant winner may legitimately enter live
 *  tenants' AI prompts as an account-proven creative pattern (patterns/extract.ts
 *  extractExperimentPatterns) — unlike the SAMPLE_EXPERIMENTS, which stay quarantined
 *  as "(ukázková lekce)" sample lessons. That is the whole point of persisting them. */
import type { LpExperiment, Variant } from "./sample";

/** The persisted per-project blob: the experiments + a save stamp. Mirrors the other
 *  single-blob stores ({items, updatedAt}). `items` is newest-first, capped. */
export interface LpExperimentState {
  items: LpExperiment[];
  /** ISO timestamp of the last save */
  updatedAt: string;
}

// --- honest bounds ------------------------------------------------------------

/** Max experiments per project — a working set, not an unbounded archive. Adding
 *  past the cap drops the OLDEST. */
export const EXPERIMENT_CAP = 24;
/** A landing-page A/B needs a control + at least one challenger. */
export const VARIANT_MIN = 2;
/** Šidák-corrected multi-arm reads stay meaningful within a handful of arms. */
export const VARIANT_MAX = 6;
export const CLUSTER_MAX = 120;
export const LABEL_MAX = 60;
export const URL_MAX = 300;
/** W3-B — a minted arm identity is an opaque short token; anything longer than this
 *  arrived from somewhere other than `mintArmId` and is dropped rather than stored. */
export const ARM_ID_MAX = 40;
/** Clamp visitor / signup counts to a sane ceiling so a fat-fingered paste can't
 *  store an absurd number (still far above any real LP traffic). */
export const COUNT_MAX = 100_000_000;

const str = (v: unknown, max: number): string =>
  (typeof v === "string" ? v.trim() : "").slice(0, max);

/** Coerce to a non-negative integer, clamped to COUNT_MAX; non-finite → 0. */
function count(v: unknown): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, COUNT_MAX);
}

// --- wire sanitizers ----------------------------------------------------------

/** Coerce one variant object from the wire into a clean Variant, or null to drop it.
 *  A variant needs a label; signups can never exceed visitors (a conversion count
 *  above the traffic that produced it is nonsense — clamp, never trust the wire). */
export function sanitizeVariant(raw: unknown, index = 0): Variant | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const label = str(o.label, LABEL_MAX) || `Varianta ${index + 1}`;
  const visitors = count(o.visitors);
  const signups = Math.min(count(o.signups), visitors);
  const variant: Variant = { label, visitors, signups };
  const url = str(o.url, URL_MAX);
  if (url) variant.url = url;
  // W3-B — a minted arm identity rides through the sanitizer so a hosted experiment
  // survives a manual edit with its counting identity intact. Bounded like every
  // other wire string; absent on a hand-typed arm, which is what tells the sync step
  // to leave that arm's numbers alone.
  const armId = str(o.armId, ARM_ID_MAX);
  if (armId) variant.armId = armId;
  return variant;
}

/** Coerce a variants array from the wire into a clean, bounded list (≤ VARIANT_MAX).
 *  Returns [] when the input is not an array; the caller enforces VARIANT_MIN. */
export function sanitizeVariants(raw: unknown): Variant[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, VARIANT_MAX)
    .map((v, i) => sanitizeVariant(v, i))
    .filter((v): v is Variant => v !== null);
}

/** The clean, ready-to-store shape a create/replace request coerces to (the id is
 *  stamped by the store on create, never trusted from the wire). */
export interface SanitizedExperimentInput {
  cluster: string;
  status: LpExperiment["status"];
  variants: Variant[];
}

/** Coerce a full experiment body from the wire into a clean input, or null when it
 *  does not describe a usable experiment (blank cluster, or fewer than VARIANT_MIN
 *  variants after sanitising). Status defaults to "running". */
export function sanitizeExperimentInput(raw: unknown): SanitizedExperimentInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cluster = str(o.cluster, CLUSTER_MAX);
  if (!cluster) return null;
  const variants = sanitizeVariants(o.variants);
  if (variants.length < VARIANT_MIN) return null;
  const status: LpExperiment["status"] = o.status === "done" ? "done" : "running";
  return { cluster, status, variants };
}

// --- pure state transitions ---------------------------------------------------

/** A collision-resistant id without a dependency (crypto.randomUUID where available,
 *  else a timestamped random — ids are opaque, only uniqueness matters). */
function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ?? `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Prepend a new experiment (newest-first) and re-cap to EXPERIMENT_CAP by dropping
 *  the OLDEST. Pure — `idOf` is injected so the route supplies crypto.randomUUID while
 *  tests pass a deterministic id. Returns the created experiment alongside the state. */
export function addExperiment(
  prev: LpExperimentState | null,
  input: SanitizedExperimentInput,
  idOf: () => string = newId,
  now: Date = new Date()
): { state: LpExperimentState; created: LpExperiment } {
  const created: LpExperiment = { id: idOf(), cluster: input.cluster, status: input.status, variants: input.variants };
  const items = [created, ...(prev?.items ?? [])].slice(0, EXPERIMENT_CAP);
  return { state: { items, updatedAt: now.toISOString() }, created };
}

/** Replace one experiment's editable fields by id (cluster, status, variants), keeping
 *  its position + id. Returns the next state and whether the id was found (so the route
 *  can 404 an unknown id instead of a silent no-op).
 *
 *  W3-B — two things are CARRIED FORWARD rather than replaced, because the wire body
 *  (the manager's edit form) does not carry them and a silent drop would break a live
 *  measurement: the `hosted` binding, and each arm's minted `armId` at its POSITION.
 *  Renaming an arm's label in the UI must not orphan the counter rows already
 *  attributed to it — the counters key on `armId`, and an arm that lost its id would
 *  stop being recomputed while its rows piled up unread. An input that DOES carry an
 *  armId (a re-publish) wins, so a re-mint is still possible. */
export function replaceExperiment(
  prev: LpExperimentState | null,
  id: string,
  input: SanitizedExperimentInput,
  now: Date = new Date()
): { state: LpExperimentState; found: boolean } {
  const items = prev?.items ?? [];
  let found = false;
  const next = items.map((e) => {
    if (e.id !== id) return e;
    found = true;
    const variants = input.variants.map((v, i) => {
      const carried = v.armId ?? e.variants[i]?.armId;
      return carried ? { ...v, armId: carried } : v;
    });
    return {
      id: e.id,
      cluster: input.cluster,
      status: input.status,
      variants,
      ...(e.hosted ? { hosted: e.hosted } : {}),
    };
  });
  return { state: { items: next, updatedAt: now.toISOString() }, found };
}

// --- W3-B · hosted-experiment transitions -------------------------------------
// Pure, so publishing, unpublishing and the counter sync are all unit-testable
// without a store. Each returns `found` so its caller can 404 / no-op honestly.

/** Bind an experiment to a published `/m/{slug}` page: stamp one `armId` per arm
 *  (positionally — `armIds[i]` belongs to `variants[i]`) and record the slug.
 *  Re-publishing an already-hosted experiment REUSES each arm's existing id when the
 *  caller passes an empty slot, so the counters collected under the old identity keep
 *  attributing. Arms whose slot is blank and that never had an id stay hand-typed. */
export function hostExperiment(
  prev: LpExperimentState | null,
  id: string,
  armIds: readonly string[],
  slug: string,
  now: Date = new Date()
): { state: LpExperimentState; found: boolean } {
  const items = prev?.items ?? [];
  let found = false;
  const next = items.map((e) => {
    if (e.id !== id) return e;
    found = true;
    const variants = e.variants.map((v, i) => {
      const armId = (armIds[i] ?? "").slice(0, ARM_ID_MAX) || v.armId;
      return armId ? { ...v, armId } : v;
    });
    return { ...e, variants, hosted: { slug, publishedAt: now.toISOString() } };
  });
  return { state: { items: next, updatedAt: now.toISOString() }, found };
}

/** Take an experiment's hosted page offline. The `armId`s are DELIBERATELY kept: the
 *  counter rows collected under them are real measured traffic, and dropping the ids
 *  would orphan them. The experiment simply stops being recomputed (the sync step only
 *  visits hosted ones), so its last synced numbers freeze exactly where the page went
 *  dark — and a re-publish resumes on the same identities. */
export function unhostExperiment(
  prev: LpExperimentState | null,
  id: string,
  now: Date = new Date()
): { state: LpExperimentState; found: boolean } {
  const items = prev?.items ?? [];
  let found = false;
  const next = items.map((e) => {
    if (e.id !== id || !e.hosted) return e;
    found = true;
    // BUILT, not spread-minus-a-key: the field is dropped by construction, so a
    // future field cannot silently ride along past this transition.
    return { id: e.id, cluster: e.cluster, status: e.status, variants: e.variants };
  });
  return { state: { items: next, updatedAt: now.toISOString() }, found };
}

/** One arm's counted traffic, as the sync step reads it out of the counter table. */
export interface ArmTotals {
  views: number;
  conversions: number;
}

/** OVERWRITE each identified arm's `visitors`/`signups` with the counter totals —
 *  the recompute-not-accumulate rule (`organic-channels/rollup-step.ts:12-17`). Adding
 *  would drift upward forever and could never go DOWN when retention ages a day out,
 *  which is the only version of this number that stays honest.
 *
 *  Two boundaries hold here and are pinned:
 *   • an arm with no `armId` (hand-typed) is NEVER touched — the operator's own
 *     numbers are not ours to rewrite;
 *   • `signups ≤ visitors` still holds afterwards (the `sanitizeVariant` clamp), so a
 *     conversion counted against a view that was never counted (a bot filtered on the
 *     way in but not on the way out, a page cached upstream) cannot publish an
 *     above-100 % conversion rate into `evaluate()` — and from there into a live
 *     tenant's AI prompts via `patterns/extract.ts`.
 *
 *  Returns `changed` so a project whose numbers did not move costs no store write. */
export function syncArmCounts(
  prev: LpExperimentState | null,
  id: string,
  totals: ReadonlyMap<string, ArmTotals>,
  now: Date = new Date()
): { state: LpExperimentState; found: boolean; changed: boolean } {
  const items = prev?.items ?? [];
  let found = false;
  let changed = false;
  const next = items.map((e) => {
    if (e.id !== id) return e;
    found = true;
    const variants = e.variants.map((v) => {
      if (!v.armId) return v;
      const t = totals.get(v.armId) ?? { views: 0, conversions: 0 };
      const visitors = count(t.views);
      const signups = Math.min(count(t.conversions), visitors);
      if (v.visitors === visitors && v.signups === signups) return v;
      changed = true;
      return { ...v, visitors, signups };
    });
    return changed ? { ...e, variants } : e;
  });
  return { state: { items: next, updatedAt: now.toISOString() }, found, changed };
}

/** Remove one experiment by id. Returns the next state + whether an item was found. */
export function removeExperiment(
  prev: LpExperimentState | null,
  id: string,
  now: Date = new Date()
): { state: LpExperimentState; found: boolean } {
  const items = prev?.items ?? [];
  const next = items.filter((e) => e.id !== id);
  return { state: { items: next, updatedAt: now.toISOString() }, found: next.length !== items.length };
}
