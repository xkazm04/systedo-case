/** Persisted-diagnosis model. A diagnosis is the stored, actionable form of an AI
 *  diagnosis run (LTV cohort economics or a lead-source root cause): the result
 *  payload the user paid quota for, plus a status lifecycle (new → acknowledged →
 *  resolved), the created timestamp and the input digest it was computed from — so
 *  a paid diagnosis survives a tab close and can be tracked, not evaporate. Stored
 *  per project as one {items[], updatedAt} blob through the store trio (Firestore +
 *  LOCAL_DB sqlite twin), mirroring organic-channels/twin. Framework-free — the
 *  pure state transitions (append with a per-kind cap, status change) and the wire
 *  sanitizers live here so they are unit-testable without any I/O. */
import type {
  AdsDiagnosisCause,
  AdsDiagnosisResult,
  CohortDiagnosisResult,
  DiagnosisMetricKey,
  DiagnosisSnapshot,
  LeadSourceDiagnosisResult,
  LocalDiagnosisResult,
} from "../ai-types";
import { ADS_DIAGNOSIS_CAUSES, LEAD_SOURCE_CAUSES, LEAD_SOURCE_SEVERITIES } from "../ai-types";

/** The diagnosis tools that persist here (the LTV cohort read, the lead-source root
 *  cause, and the local-visibility diagnosis). Keyed by the /api/ai tool mode so the
 *  kinds stay aligned. Extending the tuple is backward-compatible — capPerKind /
 *  the sanitizers are keyed by kind, so an old {cohort,lead-source} blob reads
 *  cleanly and a new "local" item coexists under its own per-kind cap. */
export const DIAGNOSIS_KINDS = ["cohort", "lead-source", "local", "ads"] as const;
export type DiagnosisKind = (typeof DIAGNOSIS_KINDS)[number];

/** The status lifecycle. A fresh diagnosis is `new`; the operator moves it to
 *  `acknowledged` (seen, on the list) and finally `resolved` (acted on). */
export const DIAGNOSIS_STATUSES = ["new", "acknowledged", "resolved"] as const;
export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number];

/** Where a diagnosis came from: a user clicking the panel, or the weekly digest
 *  cron running it passively over the tenant's data (Direction 2). */
export type DiagnosisOrigin = "manual" | "digest";

/** How many diagnoses to keep PER KIND — older ones drop off the history strip. */
export const DIAGNOSIS_HISTORY_CAP = 10;

interface StoredDiagnosisBase {
  /** stable id (keys the React list + the status-PATCH target) */
  id: string;
  status: DiagnosisStatus;
  /** ISO timestamp the diagnosis was produced */
  createdAt: string;
  /** short digest of the request the result was computed from — lets the UI tell
   *  whether a shown diagnosis is stale vs the current data */
  inputDigest: string;
  origin: DiagnosisOrigin;
  /** one-line subject for the history row (worst cohort / the source name) */
  subject: string;
  /** Direction 1 (the loop closes): the at-diagnosis KEY-METRIC snapshot, so the
   *  outcome (improved / unchanged / worse) can be derived at render against the
   *  current value. Optional + additive — a pre-Direction-1 record has none and
   *  simply renders without an outcome chip. */
  snapshot?: DiagnosisSnapshot;
}

export interface CohortStoredDiagnosis extends StoredDiagnosisBase {
  kind: "cohort";
  result: CohortDiagnosisResult;
}

export interface LeadSourceStoredDiagnosis extends StoredDiagnosisBase {
  kind: "lead-source";
  result: LeadSourceDiagnosisResult;
}

export interface LocalStoredDiagnosis extends StoredDiagnosisBase {
  kind: "local";
  result: LocalDiagnosisResult;
}

export interface AdsStoredDiagnosis extends StoredDiagnosisBase {
  kind: "ads";
  result: AdsDiagnosisResult;
}

export type StoredDiagnosis =
  | CohortStoredDiagnosis
  | LeadSourceStoredDiagnosis
  | LocalStoredDiagnosis
  | AdsStoredDiagnosis;

/** The per-project persisted blob (mirrors the {statuses, plan?} shape of the
 *  other single-blob stores). `items` is newest-first, capped per kind. */
export interface DiagnosisState {
  items: StoredDiagnosis[];
  /** ISO timestamp of the last save */
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Pure state transitions — no I/O, so the store's read-modify-write is a thin
// dispatcher and the interesting logic is unit-testable in isolation.
// --------------------------------------------------------------------------

/** Keep at most `cap` items of each kind, preserving the (newest-first) order. */
export function capPerKind(items: StoredDiagnosis[], cap = DIAGNOSIS_HISTORY_CAP): StoredDiagnosis[] {
  const seen: Record<string, number> = {};
  const out: StoredDiagnosis[] = [];
  for (const it of items) {
    const n = (seen[it.kind] ?? 0) + 1;
    seen[it.kind] = n;
    if (n <= cap) out.push(it);
  }
  return out;
}

/** Prepend a new diagnosis (newest-first) and re-cap per kind. Returns the next
 *  blob; never mutates the input. */
export function appendDiagnosis(prev: DiagnosisState | null, d: StoredDiagnosis): DiagnosisState {
  const items = capPerKind([d, ...(prev?.items ?? [])]);
  return { items, updatedAt: new Date().toISOString() };
}

/** Set one diagnosis's status by id. Returns the next blob and whether the id was
 *  found (so the caller can 404 an unknown id instead of a silent no-op save). */
export function setStatusIn(
  prev: DiagnosisState,
  id: string,
  status: DiagnosisStatus
): { state: DiagnosisState; found: boolean } {
  let found = false;
  const items = prev.items.map((it) => {
    if (it.id !== id) return it;
    found = true;
    return { ...it, status } as StoredDiagnosis;
  });
  return { state: { items, updatedAt: new Date().toISOString() }, found };
}

/** Newest diagnosis of a kind, or null. Assumes `items` is newest-first. */
export function latestOfKind(state: DiagnosisState | null, kind: DiagnosisKind): StoredDiagnosis | null {
  return state?.items.find((it) => it.kind === kind) ?? null;
}

// --------------------------------------------------------------------------
// Wire sanitizers — the persist route coerces arbitrary client JSON (the result
// the client just got back from /api/ai) into a clean, bounded payload before it
// is stored. Never trust the wire. Framework-free.
// --------------------------------------------------------------------------

const CAUSE_SET = new Set<string>(LEAD_SOURCE_CAUSES);
const ADS_CAUSE_SET = new Set<string>(ADS_DIAGNOSIS_CAUSES);
const SEVERITY_SET = new Set<string>(LEAD_SOURCE_SEVERITIES);
const STATUS_SET = new Set<string>(DIAGNOSIS_STATUSES);
const KIND_SET = new Set<string>(DIAGNOSIS_KINDS);
const ORIGIN_SET = new Set<string>(["manual", "digest"]);

const str = (v: unknown, max: number): string =>
  (typeof v === "string" ? v.trim() : "").slice(0, max);

function strList(v: unknown, maxItems: number, maxLen: number): string[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, maxItems)
        .map((x) => x.slice(0, maxLen))
    : [];
}

export function sanitizeDiagnosisKind(v: unknown): DiagnosisKind | null {
  return KIND_SET.has(v as string) ? (v as DiagnosisKind) : null;
}

export function sanitizeDiagnosisStatus(v: unknown): DiagnosisStatus | null {
  return STATUS_SET.has(v as string) ? (v as DiagnosisStatus) : null;
}

/** Coerce a cohort-diagnosis result from the wire into a clean payload, or null
 *  when the mandatory fields are missing. */
export function sanitizeCohortResult(raw: unknown): CohortDiagnosisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = str(o.summary, 1200);
  const worstCohort = str(o.worstCohort, 120);
  const recommendation = str(o.recommendation, 1200);
  if (!summary || !recommendation || !worstCohort) return null;
  const result: CohortDiagnosisResult = { summary, worstCohort, recommendation };
  const risks = strList(o.risks, 3, 400);
  if (risks.length > 0) result.risks = risks;
  return result;
}

/** Coerce a local-diagnosis result from the wire into a clean payload, or null when
 *  the mandatory fields are missing. worstGap is domain-limited at generation time
 *  (the tool's validator), so here we only require the mandatory strings. */
export function sanitizeLocalResult(raw: unknown): LocalDiagnosisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = str(o.summary, 1200);
  const worstGap = str(o.worstGap, 160);
  const recommendation = str(o.recommendation, 1200);
  if (!summary || !recommendation || !worstGap) return null;
  const result: LocalDiagnosisResult = { summary, worstGap, recommendation };
  const risks = strList(o.risks, 3, 400);
  if (risks.length > 0) result.risks = risks;
  return result;
}

/** Coerce a lead-source-diagnosis result from the wire into a clean payload, or
 *  null when the mandatory fields are missing. */
export function sanitizeLeadSourceResult(raw: unknown): LeadSourceDiagnosisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = str(o.summary, 1200);
  const recommendation = str(o.recommendation, 1200);
  const cause = o.likelyCause;
  if (!summary || !recommendation || !CAUSE_SET.has(cause as string)) return null;
  const result: LeadSourceDiagnosisResult = {
    summary,
    likelyCause: cause as LeadSourceDiagnosisResult["likelyCause"],
    recommendation,
  };
  if (SEVERITY_SET.has(o.severity as string)) {
    result.severity = o.severity as LeadSourceDiagnosisResult["severity"];
  }
  return result;
}

/** Coerce an ads-performance-diagnosis result from the wire into a clean payload,
 *  or null when the mandatory fields are missing. `severity` and
 *  `affectedCampaignIds` are REQUIRED on the type but tolerated from the wire: an
 *  unknown severity falls back to "medium" and an unusable id list to empty, so a
 *  slightly-off client echo still persists the diagnosis the user paid for instead
 *  of silently dropping it. Ids are NOT validated against a campaign set here — the
 *  tool already normalised them to the request's ids at generation time. */
export function sanitizeAdsResult(raw: unknown): AdsDiagnosisResult | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = str(o.summary, 1200);
  const recommendation = str(o.recommendation, 1200);
  const cause = o.likelyCause;
  if (!summary || !recommendation || !ADS_CAUSE_SET.has(cause as string)) return null;
  return {
    summary,
    likelyCause: cause as AdsDiagnosisCause,
    recommendation,
    severity: SEVERITY_SET.has(o.severity as string)
      ? (o.severity as AdsDiagnosisResult["severity"])
      : "medium",
    affectedCampaignIds: strList(o.affectedCampaignIds, 6, 120),
  };
}

/** Which key metric each diagnosis kind snapshots (mirrors the extractors in
 *  `outcome.ts`). A snapshot only means anything when its key is the one its kind is
 *  ABOUT — a "coverage" fraction compared against a cohort's LTV:CAC is a nonsense
 *  comparison, so the pairing is part of the contract, not a convention. */
export const DIAGNOSIS_METRIC_KEY_BY_KIND: Record<DiagnosisKind, DiagnosisMetricKey> = {
  cohort: "ltvCac",
  "lead-source": "qualRate",
  local: "coverage",
  ads: "pno",
};

const METRIC_KEY_SET = new Set<string>(Object.values(DIAGNOSIS_METRIC_KEY_BY_KIND));

/** Coerce an at-diagnosis snapshot from the wire (client-echoed from the result meta)
 *  into a clean {key, metric}, or null when it isn't a well-formed snapshot. Never
 *  trust the wire: the key must be a known metric and the value a finite number. When
 *  `kind` is given the key must additionally be the one THAT kind snapshots — a
 *  mismatched pair (e.g. a cohort diagnosis carrying a "coverage" baseline) would make
 *  the render-time outcome chip compare differently-scaled numbers, so it is dropped. */
export function sanitizeDiagnosisSnapshot(raw: unknown, kind?: DiagnosisKind): DiagnosisSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const key = o.key;
  const metric = o.metric;
  if (!METRIC_KEY_SET.has(key as string)) return null;
  if (kind && key !== DIAGNOSIS_METRIC_KEY_BY_KIND[kind]) return null;
  if (typeof metric !== "number" || !Number.isFinite(metric)) return null;
  return { key: key as DiagnosisMetricKey, metric };
}

/** Every kind's result payload, as one union — the shape the sanitizer produces and
 *  the builder stores. */
export type DiagnosisResult =
  | CohortDiagnosisResult
  | LeadSourceDiagnosisResult
  | LocalDiagnosisResult
  | AdsDiagnosisResult;

/** Per-kind wire sanitizer. A kind-keyed map rather than a ternary chain, so adding
 *  a kind is one row and the compiler proves every kind has one. */
const RESULT_SANITIZER_BY_KIND: Record<DiagnosisKind, (raw: unknown) => DiagnosisResult | null> = {
  cohort: sanitizeCohortResult,
  "lead-source": sanitizeLeadSourceResult,
  local: sanitizeLocalResult,
  ads: sanitizeAdsResult,
};

/** Per-kind fallback subject when the wire supplies none — the field that reads as
 *  the diagnosis's one-line subject in the history strip. Same map discipline. */
const DEFAULT_SUBJECT_BY_KIND: Record<DiagnosisKind, (r: DiagnosisResult) => string> = {
  cohort: (r) => (r as CohortDiagnosisResult).worstCohort,
  "lead-source": (r) => (r as LeadSourceDiagnosisResult).likelyCause,
  local: (r) => (r as LocalDiagnosisResult).worstGap,
  ads: (r) => (r as AdsDiagnosisResult).likelyCause,
};

/** The clean, ready-to-store body a persist request coerces to (id/createdAt are
 *  stamped by the builder, not trusted from the wire). */
export interface SanitizedDiagnosisInput {
  kind: DiagnosisKind;
  result: DiagnosisResult;
  inputDigest: string;
  subject: string;
  origin: DiagnosisOrigin;
  /** Direction 1: the at-diagnosis key-metric snapshot, when the client echoed a
   *  well-formed one from the result meta (absent → the record has no outcome chip). */
  snapshot?: DiagnosisSnapshot;
}

/** Options only a trusted server-side caller passes. */
export interface SanitizeDiagnosisOptions {
  /** Provenance to stamp on the record. Defaults to "manual" — `origin` is never
   *  read from the wire, because the weekly digest cron gates its once-per-week
   *  run on the newest "digest" record, so a forgeable origin would let any
   *  client suppress the real digest diagnosis (and fake passive provenance in
   *  the history UI). `digest-run.ts` is the only legitimate "digest" writer. */
  origin?: DiagnosisOrigin;
}

/** Coerce a full persist-request body into a clean input, or null when it does
 *  not describe a valid diagnosis (bad kind / unusable result). */
export function sanitizeDiagnosisInput(
  raw: unknown,
  opts?: SanitizeDiagnosisOptions
): SanitizedDiagnosisInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = sanitizeDiagnosisKind(o.kind);
  if (!kind) return null;
  const result = RESULT_SANITIZER_BY_KIND[kind](o.result);
  if (!result) return null;
  // Server-supplied only: the wire's `origin` is ignored entirely.
  const origin: DiagnosisOrigin = ORIGIN_SET.has(opts?.origin as string)
    ? (opts!.origin as DiagnosisOrigin)
    : "manual";
  const subject = str(o.subject, 120) || DEFAULT_SUBJECT_BY_KIND[kind](result);
  const snapshot = sanitizeDiagnosisSnapshot(o.snapshot, kind);
  const input: SanitizedDiagnosisInput = {
    kind,
    result,
    inputDigest: str(o.inputDigest, 64),
    subject,
    origin,
  };
  if (snapshot) input.snapshot = snapshot;
  return input;
}

/** Assemble a fresh StoredDiagnosis (status `new`, id + timestamp stamped here).
 *  `idOf` is injected so callers on the edge (route / cron) supply crypto.randomUUID
 *  while tests can pass a deterministic id. */
export function buildStoredDiagnosis(
  input: SanitizedDiagnosisInput,
  idOf: () => string,
  now: Date = new Date()
): StoredDiagnosis {
  const base = {
    id: idOf(),
    status: "new" as const,
    createdAt: now.toISOString(),
    inputDigest: input.inputDigest,
    origin: input.origin,
    subject: input.subject,
    ...(input.snapshot ? { snapshot: input.snapshot } : {}),
  };
  // kind and result were paired by the sanitizer (RESULT_SANITIZER_BY_KIND), so the
  // one cast is sound by that invariant — and the union no longer needs a ternary
  // chain that grows a rung per kind.
  return { ...base, kind: input.kind, result: input.result } as StoredDiagnosis;
}

/** The digest format version. It PREFIXES every digest so the freshness comparison
 *  (digestFreshness) can tell a current-format digest from an older one and stay
 *  backward-tolerant: a pre-versioned stored digest is treated as unknown-age, never
 *  as a hard "stale" claim. Bump on any change to the stringify below. */
export const DIGEST_VERSION = "2";

/** Key-order-normalized JSON — so `{ a, b }` and `{ b, a }` serialize identically and
 *  a stored digest doesn't spuriously mismatch just because the request builder
 *  emitted its keys in a different order. Arrays keep their order (it is meaningful);
 *  `undefined`-valued keys are dropped (JSON would omit them anyway). */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(",")}}`;
}

/** Stable, cheap digest (fnv-1a, base36, version-prefixed) of any JSON-serializable
 *  request — so a stored diagnosis records the shape of the data it was computed from
 *  without keeping the whole payload. Key-order-independent (stableStringify). Not
 *  cryptographic; just a change-detector. */
export function inputDigest(value: unknown): string {
  const s = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${DIGEST_VERSION}:${(h >>> 0).toString(36)}`;
}

/** Whether a STORED diagnosis's input digest still matches the CURRENT data digest.
 *   - "fresh"   — the digests match; the diagnosis reflects the current data.
 *   - "stale"   — both are current-format and differ; the data changed since — a hard
 *                 claim, safe because both were produced by the same stable stringify.
 *   - "unknown" — no stored digest, OR the stored one predates the current format
 *                 (backward tolerance): we CANNOT prove staleness, so we never claim
 *                 it — the UI shows a soft, uncommitted label instead of "stale". */
export type DigestFreshness = "fresh" | "stale" | "unknown";

export function digestFreshness(
  stored: string | undefined | null,
  current: string
): DigestFreshness {
  if (!stored) return "unknown";
  if (stored === current) return "fresh";
  const isCurrentFormat = (d: string) => d.startsWith(`${DIGEST_VERSION}:`);
  return isCurrentFormat(stored) && isCurrentFormat(current) ? "stale" : "unknown";
}
