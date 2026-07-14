/** Persisted-recap model. A recap is the stored form of a monthly-recap generation —
 *  the most report-like AI artifact, which used to regenerate on every visit (costing
 *  quota, losing history). Each stored recap holds the result payload the user paid
 *  for, the created timestamp, the input hash it was computed from (so the UI can show
 *  an honest "stale" marker when the current data no longer matches), and the locale
 *  it was written in. Stored per project as one {items[], updatedAt} blob through the
 *  store trio (Firestore + LOCAL_DB sqlite twin), mirroring diagnoses / annotations.
 *
 *  Framework-free — the pure state transitions (append with a per-period cap, latest /
 *  history lookups, the staleness decision) live here so they are unit-testable
 *  without any I/O. */
import { createHash } from "node:crypto";
import type { AnalysisPeriod, MonthlyRecapResult } from "../ai-types";
import type { ProjectType } from "../projects/types";
import type { PerformanceData } from "../types";
import type { SupportedLocale } from "../format";

/** How many recaps to keep PER PERIOD — older ones drop off the history strip. */
export const RECAP_HISTORY_CAP = 6;

export interface StoredRecap {
  /** stable id (keys the React history list + the preview target) */
  id: string;
  /** which report period this recap summarizes (30d / 90d / 12m) */
  period: AnalysisPeriod;
  /** the generated recap payload */
  result: MonthlyRecapResult;
  /** ISO timestamp the recap was produced */
  createdAt: string;
  /** hash of the inputs the recap was computed from — the report compares it against
   *  the CURRENT inputs to decide whether the shown recap is stale (data changed) */
  inputHash: string;
  /** the locale the recap was written in (part of the input hash, kept for display) */
  locale: string;
}

/** The per-project persisted blob (mirrors the {items, updatedAt} shape of the other
 *  single-blob stores). `items` is newest-first, capped per period. */
export interface RecapState {
  items: StoredRecap[];
  /** ISO timestamp of the last save */
  updatedAt: string;
}

// --------------------------------------------------------------------------
// Input hash — the staleness signal. Reuses the exact hashing the /api/ai
// response cache uses (mode + locale + a stable JSON of the determining inputs),
// so the value the route stores at generation time and the value the report page
// recomputes on load are computed the same way on both sides.
//
// The recap's content is a function of: the period, the locale it's written in, the
// project type (which frames the metric vocabulary) and the resolved dataset (the
// numbers). When any of those change, the stored recap is stale. Secondary grounding
// edits (competitor set, client notes) are deliberately NOT folded in: both sides
// resolve the dataset identically and cheaply, whereas reconstructing every grounding
// version string on the page would be fragile and risk false "stale" flags.
// --------------------------------------------------------------------------

/** Stable hash of the inputs a recap is a function of. The same function is called by
 *  the route (at generation, with the resolved dataset) and by the report page (on
 *  load, with the same resolved dataset) — an equal hash means "still current". */
export function recapInputHash(
  locale: SupportedLocale | string,
  period: AnalysisPeriod,
  projectType: ProjectType | undefined,
  data: PerformanceData | undefined
): string {
  const value = { period, projectType: projectType ?? null, data: data ?? null };
  return createHash("sha256")
    .update(`monthly-recap ${locale} app ${JSON.stringify(value)}`)
    .digest("hex");
}

/** Whether a stored recap no longer matches the current inputs (data / period /
 *  locale / project type changed since it was generated). Pure. */
export function isRecapStale(stored: StoredRecap, currentHash: string): boolean {
  return stored.inputHash !== currentHash;
}

// --------------------------------------------------------------------------
// Pure state transitions — no I/O, so the store's read-modify-write is a thin
// dispatcher and the interesting logic is unit-testable in isolation.
// --------------------------------------------------------------------------

/** Keep at most `cap` items of each period, preserving the (newest-first) order. */
export function capPerPeriod(items: StoredRecap[], cap = RECAP_HISTORY_CAP): StoredRecap[] {
  const seen: Partial<Record<AnalysisPeriod, number>> = {};
  const out: StoredRecap[] = [];
  for (const it of items) {
    const n = (seen[it.period] ?? 0) + 1;
    seen[it.period] = n;
    if (n <= cap) out.push(it);
  }
  return out;
}

/** Prepend a new recap (newest-first) and re-cap per period. Returns the next blob;
 *  never mutates the input. */
export function appendRecap(prev: RecapState | null, r: StoredRecap): RecapState {
  const items = capPerPeriod([r, ...(prev?.items ?? [])]);
  return { items, updatedAt: new Date().toISOString() };
}

/** The recaps for a period, newest-first, capped for display. Assumes items are
 *  newest-first. */
export function historyForPeriod(
  state: RecapState | null,
  period: AnalysisPeriod,
  cap = RECAP_HISTORY_CAP
): StoredRecap[] {
  return (state?.items ?? []).filter((it) => it.period === period).slice(0, cap);
}

/** The newest recap for a period, or null. Assumes items are newest-first. */
export function latestForPeriod(state: RecapState | null, period: AnalysisPeriod): StoredRecap | null {
  return state?.items.find((it) => it.period === period) ?? null;
}

/** The clean input a persist coerces to (id/createdAt are stamped by the builder). */
export interface RecapInput {
  period: AnalysisPeriod;
  result: MonthlyRecapResult;
  inputHash: string;
  locale: string;
}

/** Assemble a fresh StoredRecap (id + timestamp stamped here). `idOf` is injected so
 *  callers on the edge (route) supply crypto.randomUUID while tests pass a
 *  deterministic id. */
export function buildStoredRecap(
  input: RecapInput,
  idOf: () => string,
  now: Date = new Date()
): StoredRecap {
  return {
    id: idOf(),
    period: input.period,
    result: input.result,
    createdAt: now.toISOString(),
    inputHash: input.inputHash,
    locale: input.locale,
  };
}
