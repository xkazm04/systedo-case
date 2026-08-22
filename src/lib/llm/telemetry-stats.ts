/** Pure, Firestore-free helpers over LLM telemetry entries: the per-call status
 *  taxonomy, status-count rollups and latency percentiles. Split out of
 *  telemetry.ts (which imports Firestore) so the digest rollup (telemetry-ops.ts)
 *  can share them without dragging a server-only dependency into its bundle — the
 *  same "pure math, no I/O" boundary telemetry-ops already keeps. Type-only import
 *  of LlmTelemetryEntry (erased at runtime, so no cycle). */
import type { AiExtractionRung } from "@/lib/ai-types";
import type { LlmTelemetryEntry } from "./telemetry";

/** Per-call outcome recorded durably so monitoring can tell healthy traffic from
 *  degraded/failed traffic:
 *    success   a usable, schema-complete result
 *    repaired  usable, but only after a self-repair re-prompt
 *    corrupt   parsed yet truncated/garbage (missing required fields) — the app
 *              still normalizes it, but it must NOT read as a healthy success
 *    error     every provider exhausted its retries (the pre-demo failure)
 *    demo      no provider available/succeeded → deterministic canned fallback */
export type LlmTelemetryStatus = "success" | "repaired" | "corrupt" | "error" | "demo";

export const LLM_TELEMETRY_STATUSES: readonly LlmTelemetryStatus[] = [
  "success",
  "repaired",
  "corrupt",
  "error",
  "demo",
];

/** The subset of an entry needed to derive its status. */
type StatusFields = Pick<LlmTelemetryEntry, "status" | "demo">;

/** An entry's status, defaulting legacy (pre-status) rows: a demo entry reads as
 *  "demo", anything else as "success" (durable rows were only ever written on a
 *  usable parse before the status field existed). */
export function entryStatus(e: StatusFields): LlmTelemetryStatus {
  return e.status ?? (e.demo ? "demo" : "success");
}

/** A status that represents a usable real result (counts toward success rate). */
export function isHealthyStatus(s: LlmTelemetryStatus): boolean {
  return s === "success" || s === "repaired";
}

export function emptyStatusCounts(): Record<LlmTelemetryStatus, number> {
  return { success: 0, repaired: 0, corrupt: 0, error: 0, demo: 0 };
}

/** Tally entries by status. */
export function countStatuses(entries: StatusFields[]): Record<LlmTelemetryStatus, number> {
  const counts = emptyStatusCounts();
  for (const e of entries) counts[entryStatus(e)] += 1;
  return counts;
}

/** Fraction of REAL (non-demo) calls that produced a usable result. Demo calls are
 *  excluded (their availability is tracked separately as the demo-rate). An op with
 *  no real calls has, vacuously, no failures → 1. */
export function successRate(entries: StatusFields[]): number {
  const real = entries.filter((e) => entryStatus(e) !== "demo");
  if (real.length === 0) return 1;
  const good = real.filter((e) => isHealthyStatus(entryStatus(e))).length;
  return good / real.length;
}

// ===========================================================================
// Unpriced disclosure — `nullable-cost-never-zero`
// ===========================================================================

/** The subset of an entry needed to decide whether its cost is known. */
type CostFields = Pick<LlmTelemetryEntry, "estCostUsd" | "unpriced">;

/** True when the call did real work whose cost we cannot state: the dev Claude CLI
 *  (subscription, no usage reported) or a model with no rate row in cost.ts. Such an
 *  entry carries NO `estCostUsd` — it must never be folded in as a zero without the
 *  aggregate also disclosing how many of its calls were unpriced. Legacy rows (which
 *  always wrote a number) read as priced. */
export function isUnpriced(e: CostFields): boolean {
  return e.unpriced === true || e.estCostUsd == null;
}

/** How many entries in the window carry no cost figure. The companion every
 *  cost total must be read next to: "$0.42 over 30 calls (11 unpriced)". */
export function countUnpriced(entries: CostFields[]): number {
  return entries.filter(isUnpriced).length;
}

// ===========================================================================
// Extraction observability
// ===========================================================================

/** The subset of an entry needed for the extraction rollup. */
type ExtractionFields = Pick<LlmTelemetryEntry, "promptHash" | "extraction">;

/** Per-prompt-fingerprint distribution of which extraction rung produced the parse,
 *  e.g. `{ "a1b2…": { direct: 40, fence: 2 } }`. Split by `promptHash` because that
 *  IS the contract-version boundary: comparing two fingerprints' distributions
 *  answers "did this prompt revision make the model's JSON harder to extract?".
 *  Entries with no rung (natively-parsed providers, legacy rows) are skipped, so a
 *  fingerprint that only ever ran on Gemini simply does not appear. */
export function extractionDistribution(
  entries: ExtractionFields[]
): Record<string, Partial<Record<AiExtractionRung, number>>> {
  const out: Record<string, Partial<Record<AiExtractionRung, number>>> = {};
  for (const e of entries) {
    if (!e.extraction) continue;
    const bucket = (out[e.promptHash] ??= {});
    bucket[e.extraction] = (bucket[e.extraction] ?? 0) + 1;
  }
  return out;
}

/** Nearest-rank percentile of an ASCENDING-sorted array; 0 for an empty array. */
export function percentile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  const rank = Math.ceil((q / 100) * n);
  return sortedAsc[Math.min(n - 1, Math.max(0, rank - 1))];
}

/** p50/p95 latency (ms) over REAL (non-demo) calls only — a demo's near-zero
 *  latency would otherwise deflate the percentiles that describe live provider
 *  performance. */
export function latencyPercentiles(entries: (StatusFields & { tookMs: number })[]): {
  p50TookMs: number;
  p95TookMs: number;
} {
  const real = entries
    .filter((e) => entryStatus(e) !== "demo")
    .map((e) => e.tookMs)
    .sort((a, b) => a - b);
  return { p50TookMs: percentile(real, 50), p95TookMs: percentile(real, 95) };
}
