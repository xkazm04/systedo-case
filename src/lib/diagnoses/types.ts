/** Persisted-diagnosis model. A diagnosis is the stored, actionable form of an AI
 *  diagnosis run (LTV cohort economics or a lead-source root cause): the result
 *  payload the user paid quota for, plus a status lifecycle (new → acknowledged →
 *  resolved), the created timestamp and the input digest it was computed from — so
 *  a paid diagnosis survives a tab close and can be tracked, not evaporate. Stored
 *  per project as one {items[], updatedAt} blob through the store trio (Firestore +
 *  LOCAL_DB sqlite twin), mirroring organic-channels/twin. Framework-free — the
 *  pure state transitions (append with a per-kind cap, status change) and the wire
 *  sanitizers live here so they are unit-testable without any I/O. */
import type { CohortDiagnosisResult, LeadSourceDiagnosisResult, LocalDiagnosisResult } from "../ai-types";
import { LEAD_SOURCE_CAUSES, LEAD_SOURCE_SEVERITIES } from "../ai-types";

/** The diagnosis tools that persist here (the LTV cohort read, the lead-source root
 *  cause, and the local-visibility diagnosis). Keyed by the /api/ai tool mode so the
 *  kinds stay aligned. Extending the tuple is backward-compatible — capPerKind /
 *  the sanitizers are keyed by kind, so an old {cohort,lead-source} blob reads
 *  cleanly and a new "local" item coexists under its own per-kind cap. */
export const DIAGNOSIS_KINDS = ["cohort", "lead-source", "local"] as const;
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

export type StoredDiagnosis =
  | CohortStoredDiagnosis
  | LeadSourceStoredDiagnosis
  | LocalStoredDiagnosis;

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

/** The clean, ready-to-store body a persist request coerces to (id/createdAt are
 *  stamped by the builder, not trusted from the wire). */
export interface SanitizedDiagnosisInput {
  kind: DiagnosisKind;
  result: CohortDiagnosisResult | LeadSourceDiagnosisResult | LocalDiagnosisResult;
  inputDigest: string;
  subject: string;
  origin: DiagnosisOrigin;
}

/** Coerce a full persist-request body into a clean input, or null when it does
 *  not describe a valid diagnosis (bad kind / unusable result). */
export function sanitizeDiagnosisInput(raw: unknown): SanitizedDiagnosisInput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = sanitizeDiagnosisKind(o.kind);
  if (!kind) return null;
  const result =
    kind === "cohort"
      ? sanitizeCohortResult(o.result)
      : kind === "lead-source"
        ? sanitizeLeadSourceResult(o.result)
        : sanitizeLocalResult(o.result);
  if (!result) return null;
  const origin = ORIGIN_SET.has(o.origin as string) ? (o.origin as DiagnosisOrigin) : "manual";
  const subject =
    str(o.subject, 120) ||
    (kind === "cohort"
      ? (result as CohortDiagnosisResult).worstCohort
      : kind === "lead-source"
        ? (result as LeadSourceDiagnosisResult).likelyCause
        : (result as LocalDiagnosisResult).worstGap);
  return { kind, result, inputDigest: str(o.inputDigest, 64), subject, origin };
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
  };
  return input.kind === "cohort"
    ? { ...base, kind: "cohort", result: input.result as CohortDiagnosisResult }
    : input.kind === "lead-source"
      ? { ...base, kind: "lead-source", result: input.result as LeadSourceDiagnosisResult }
      : { ...base, kind: "local", result: input.result as LocalDiagnosisResult };
}

/** Stable, cheap digest (fnv-1a, base36) of any JSON-serializable request — so a
 *  stored diagnosis records the shape of the data it was computed from without
 *  keeping the whole payload. Not cryptographic; just a change-detector. */
export function inputDigest(value: unknown): string {
  const s = JSON.stringify(value) ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
