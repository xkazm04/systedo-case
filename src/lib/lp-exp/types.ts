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
 *  can 404 an unknown id instead of a silent no-op). */
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
    return { id: e.id, cluster: input.cluster, status: input.status, variants: input.variants };
  });
  return { state: { items: next, updatedAt: now.toISOString() }, found };
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
