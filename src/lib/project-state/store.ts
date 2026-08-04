/** Per-(user, project, key) state store — backend dispatcher. Resolves to the
 *  local node:sqlite store when LOCAL_DB is on, else Firestore. The backend is
 *  imported LAZILY so the LOCAL_DB path never evaluates the Firestore module.
 *  Both backends export an identical interface. Server-only.
 *
 *  KEYS: every key is registered in ./keys — a colliding key is a compile error there.
 *  ENVELOPE: every write is version-stamped by ./envelope; legacy unversioned blobs
 *  stay readable forever (documented read path in that module).
 *
 *  CONCURRENCY (why this store has a CAS at all): `project_state` became the carrier
 *  for several features' state, and every read-modify-write caller (ad copy,
 *  distribution variants) did read → merge in JS → whole-blob write. Two near-
 *  simultaneous generations on the same project silently dropped one another —
 *  last write wins, no error, no trace. Neither backend offers row-level MERGE
 *  semantics for a nested JSON payload (sqlite's ON CONFLICT DO UPDATE replaces the
 *  column; Firestore's `.set()` replaces the field), so an "atomic per-entry update"
 *  would mean re-modelling every blob as its own document/row on both backends —
 *  a data migration, and one that still could not express the callers' merges
 *  (`upsertAdCopy` prunes to a cap, `upsertVariant` rewrites an article's title).
 *
 *  So: OPTIMISTIC COMPARE-AND-SWAP, with the stored bytes as the revision token.
 *  {@link readProjectState} returns an opaque `revision`;
 *  {@link saveProjectStateIfUnchanged} writes only if the stored bytes are STILL
 *  that revision, and throws a retryable {@link ProjectStateConflictError} otherwise.
 *  {@link mutateProjectState} is the read-modify-write helper every caller should
 *  use: it re-reads and re-applies the mutation on conflict, so both interleaved
 *  writers survive. Using the bytes themselves (rather than an `updatedAt` stamp) is
 *  deliberate — it needs no new column or migration, it cannot collide within a
 *  clock tick, and it works unchanged for a legacy blob and even a corrupt one.
 *  The token is process-internal: never persist or transmit it.
 *
 *  SIZE ENVELOPE: each key holds ONE whole JSON blob (blob-per-key design), so
 *  growth-prone callers (content schedule, review triage, the twin) must keep a
 *  key's blob small. The Firestore backend has a hard 1 MiB document cap; the
 *  sqlite dev backend has none, so an oversized blob would 500 only in production
 *  and never in local dev. To make both backends fail identically, saveProjectState
 *  asserts a serialized-size budget BELOW the Firestore cap and throws
 *  ProjectStateTooLargeError past it — callers should prune/archive old entries
 *  rather than let a key grow unbounded. The budget is measured on the PAYLOAD, as
 *  it always was; the envelope adds a fixed ~60 bytes, comfortably inside the
 *  headroom the budget already leaves under the 1 MiB cap. */
import { LOCAL_DB } from "@/lib/local-mode";
import { decodeProjectState, encodeProjectState, PROJECT_STATE_LEGACY_VERSION } from "./envelope";
import { PROJECT_STATE_KEYS, type ProjectStateKey } from "./keys";

export { PROJECT_STATE_KEYS, isProjectStateKey, isHttpProjectStateKey, type ProjectStateKey } from "./keys";

/** Serialized-blob budget, kept under Firestore's 1 MiB (1048576 B) document cap
 *  with headroom for the doc's other fields + Firestore's own overhead. */
export const PROJECT_STATE_MAX_BYTES = 900 * 1024;

/** Thrown by saveProjectState when a key's serialized blob exceeds the budget — a
 *  typed error so callers can distinguish "too big" from a backend/network failure. */
export class ProjectStateTooLargeError extends Error {
  readonly key: string;
  readonly bytes: number;
  constructor(key: string, bytes: number) {
    super(
      `project-state blob for key "${key}" is ${bytes} bytes, over the ${PROJECT_STATE_MAX_BYTES}-byte budget — prune old entries before saving`
    );
    this.name = "ProjectStateTooLargeError";
    this.key = key;
    this.bytes = bytes;
  }
}

/** Thrown when a compare-and-swap write loses the race — the blob changed under the
 *  writer. RETRYABLE by construction: re-read, re-apply, write again (which is what
 *  {@link mutateProjectState} does). Never a last-write-wins silent overwrite. */
export class ProjectStateConflictError extends Error {
  readonly key: string;
  /** always true — lets a generic error handler classify without an instanceof */
  readonly retryable = true;
  constructor(key: string) {
    super(
      `project-state blob for key "${key}" changed under this writer — re-read and re-apply (retryable)`
    );
    this.name = "ProjectStateConflictError";
    this.key = key;
  }
}

/** How many times {@link mutateProjectState} re-applies its mutation before giving
 *  up and surfacing the conflict. Contention here is a two-tab / two-generation
 *  race, not a hot loop, so a small bound is plenty. */
export const PROJECT_STATE_MUTATE_ATTEMPTS = 8;

/** Opaque compare-and-swap token. Currently the stored bytes; treat as meaningless
 *  outside this module and never persist or send it anywhere. */
export type ProjectStateRevision = string;

/** A read plus everything a safe write-back needs. */
export interface ProjectStateRead<T> {
  /** the decoded payload, or null when nothing is stored (or the bytes are corrupt) */
  data: T | null;
  /** the payload's schema version; 0 for a legacy pre-envelope blob */
  version: number;
  /** CAS token — null when nothing is stored. A corrupt blob still yields a token,
   *  so an overwrite of it is race-safe too. */
  revision: ProjectStateRevision | null;
}

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

function versionFor(key: string): number {
  return (PROJECT_STATE_KEYS as Record<string, { version: number } | undefined>)[key]?.version ?? 1;
}

function assertBudget(key: string, data: unknown): void {
  const bytes = Buffer.byteLength(JSON.stringify(data), "utf8");
  if (bytes > PROJECT_STATE_MAX_BYTES) throw new ProjectStateTooLargeError(key, bytes);
}

/** Read the blob together with its schema version and CAS token. The building block
 *  behind {@link getProjectState} and {@link mutateProjectState}. */
export async function readProjectState<T>(
  userId: string,
  projectId: string,
  key: ProjectStateKey
): Promise<ProjectStateRead<T>> {
  const raw = await (await backend()).readRawProjectState(userId, projectId, key);
  if (raw === null) return { data: null, version: PROJECT_STATE_LEGACY_VERSION, revision: null };
  try {
    const { data, version } = decodeProjectState<T>(raw);
    return { data, version, revision: raw };
  } catch (err) {
    // A corrupt blob and a never-saved key both collapse to null here, so the
    // caller reseeds. Unlike before, the reseed is a COMPARE-AND-SWAP against the
    // corrupt bytes, so it cannot also clobber a concurrent repair. Never silently
    // swallow — the raw blob stays stored until that overwrite, so this log is the
    // one chance to catch it.
    console.error(
      `[project-state] corrupt blob for (${userId}, ${projectId}, ${key}) — reseeding will clobber it`,
      err
    );
    return { data: null, version: PROJECT_STATE_LEGACY_VERSION, revision: raw };
  }
}

/** The stored blob for (user, project, key), or null if never saved (→ caller seed). */
export async function getProjectState<T>(
  userId: string,
  projectId: string,
  key: ProjectStateKey
): Promise<T | null> {
  return (await readProjectState<T>(userId, projectId, key)).data;
}

/** Replace the stored blob for (user, project, key), UNCONDITIONALLY (last write
 *  wins). Correct only where the caller genuinely owns the whole blob — the state
 *  route, whose client PUTs its entire board. Any read-modify-write caller must use
 *  {@link mutateProjectState} instead. Throws ProjectStateTooLargeError if the
 *  serialized payload exceeds PROJECT_STATE_MAX_BYTES, so both backends reject an
 *  oversized blob identically instead of only Firestore failing at its 1 MiB cap. */
export async function saveProjectState<T>(
  userId: string,
  projectId: string,
  key: ProjectStateKey,
  data: T
): Promise<void> {
  assertBudget(key, data);
  const raw = encodeProjectState(data, versionFor(key), new Date().toISOString());
  await (await backend()).writeRawProjectState(userId, projectId, key, raw, undefined);
}

/** Compare-and-swap write: store `data` only if the blob is STILL `expected`
 *  (`null` = still nothing stored). Returns the new revision; throws
 *  {@link ProjectStateConflictError} when another writer got there first. */
export async function saveProjectStateIfUnchanged<T>(
  userId: string,
  projectId: string,
  key: ProjectStateKey,
  data: T,
  expected: ProjectStateRevision | null
): Promise<ProjectStateRevision> {
  assertBudget(key, data);
  const raw = encodeProjectState(data, versionFor(key), new Date().toISOString());
  const won = await (await backend()).writeRawProjectState(userId, projectId, key, raw, expected);
  if (!won) throw new ProjectStateConflictError(key);
  return raw;
}

/** THE read-modify-write helper. Reads the blob, applies `mutate`, and writes back
 *  under compare-and-swap; on a lost race it re-reads and re-applies (up to
 *  {@link PROJECT_STATE_MUTATE_ATTEMPTS}), so two interleaved writers BOTH end up in
 *  the stored blob instead of one silently overwriting the other. Uncontended, this
 *  is exactly one read + one write — the same cost as the old read-then-save.
 *
 *  `mutate` must be PURE and cheap: it can run more than once, and it must never
 *  mutate the value handed to it (build a new blob, as the `upsert*` helpers do).
 *  Returns the blob that was actually persisted. */
export async function mutateProjectState<T>(
  userId: string,
  projectId: string,
  key: ProjectStateKey,
  mutate: (current: T | null) => T,
  attempts: number = PROJECT_STATE_MUTATE_ATTEMPTS
): Promise<T> {
  let lastConflict: ProjectStateConflictError | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    let current: ProjectStateRead<T> = { data: null, version: PROJECT_STATE_LEGACY_VERSION, revision: null };
    try {
      current = await readProjectState<T>(userId, projectId, key);
    } catch {
      // A read hiccup degrades to a fresh blob so a first save never fails on a
      // missing doc — preserved from the previous per-caller behaviour. The write
      // below is still a CAS (against "nothing stored"), so a blob that DOES exist
      // makes this attempt conflict and retry rather than clobber.
      current = { data: null, version: PROJECT_STATE_LEGACY_VERSION, revision: null };
    }
    const next = mutate(current.data);
    try {
      await saveProjectStateIfUnchanged(userId, projectId, key, next, current.revision);
      return next;
    } catch (err) {
      if (!(err instanceof ProjectStateConflictError)) throw err;
      lastConflict = err;
    }
  }
  // Persistent contention on one key is a real signal, not something to paper over.
  throw lastConflict ?? new ProjectStateConflictError(key);
}

/** Drop EVERY stored blob for (user, project, *) — all keys at once. */
export async function deleteProjectState(userId: string, projectId: string): Promise<void> {
  return (await backend()).deleteProjectState(userId, projectId);
}
