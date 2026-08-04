/** The stored-blob envelope for `project_state` — the version stamp and the
 *  documented read path for the UNVERSIONED legacy blobs already in the installed base.
 *
 *  Before this, a key's document held the caller's raw `JSON.stringify(data)` with no
 *  shape marker at all, so a change to a blob's shape had no migration path: a reader
 *  could not tell v1 from v2 from garbage, and a blob it failed to understand
 *  collapsed to `null` and got clobbered by the next unrelated save.
 *
 *  Every write now goes through {@link encodeProjectState}, which wraps the payload:
 *
 *      { "__projectState": 1, "v": 1, "savedAt": "…", "data": <payload> }
 *
 *  READ PATH FOR LEGACY BLOBS (the whole point — no backfill, no downtime):
 *   • parses as an envelope (`__projectState` is a number and `data` is present)
 *       → versioned; `version` is the writer's declared schema version.
 *   • parses as anything else (an array, an object without the marker, a string)
 *       → a legacy pre-envelope blob: the parsed value IS the payload, reported at
 *         `version: 0`, `legacy: true`. It is readable forever; the first write
 *         through the new path re-stamps it. Callers that later need to migrate a
 *         shape can branch on `version === 0`.
 *   • does not parse at all → {@link decodeProjectState} throws; the store logs and
 *         degrades to null exactly as it did before.
 *
 *  A payload that is itself an object carrying `__projectState` would be
 *  misdetected — none exists, and the marker name is deliberately obscure enough
 *  that none plausibly will. Pure + framework-free so it is directly unit-testable. */

/** Envelope-format version (the wrapper's own shape, not the payload's schema). */
export const PROJECT_STATE_ENVELOPE_VERSION = 1;

/** Reported for a pre-envelope blob — reserved, never written. */
export const PROJECT_STATE_LEGACY_VERSION = 0;

/** The wrapper actually persisted for every write made through the current store. */
export interface ProjectStateEnvelope<T> {
  /** marker + the envelope FORMAT version (not the payload's schema version) */
  __projectState: number;
  /** the payload's schema version, declared by the key's registry entry */
  v: number;
  /** ISO timestamp of the write (diagnostics only — never a concurrency token) */
  savedAt: string;
  /** the caller's blob */
  data: T;
}

/** A decoded blob plus the provenance a migration would need. */
export interface DecodedProjectState<T> {
  data: T;
  /** the payload's schema version; 0 for a legacy pre-envelope blob */
  version: number;
  /** true when the stored bytes predate the envelope */
  legacy: boolean;
}

function isEnvelope(value: unknown): value is ProjectStateEnvelope<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { __projectState?: unknown }).__projectState === "number" &&
    "data" in value
  );
}

/** Serialize a payload into a versioned envelope. `version` comes from the key's
 *  registry entry, so bumping a shape is a one-line change there. */
export function encodeProjectState<T>(data: T, version: number, savedAt: string): string {
  const envelope: ProjectStateEnvelope<T> = {
    __projectState: PROJECT_STATE_ENVELOPE_VERSION,
    v: version,
    savedAt,
    data,
  };
  return JSON.stringify(envelope);
}

/** Decode stored bytes, transparently accepting legacy unversioned blobs.
 *  Throws (SyntaxError) only when the bytes are not JSON at all. */
export function decodeProjectState<T>(raw: string): DecodedProjectState<T> {
  const parsed: unknown = JSON.parse(raw);
  if (isEnvelope(parsed)) {
    const version = typeof parsed.v === "number" ? parsed.v : PROJECT_STATE_LEGACY_VERSION;
    return { data: parsed.data as T, version, legacy: false };
  }
  return { data: parsed as T, version: PROJECT_STATE_LEGACY_VERSION, legacy: true };
}
