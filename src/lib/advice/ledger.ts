/** WP W3-A — THE ADVICE LEDGER. Pure, framework-free, no I/O.
 *
 *  WHAT IT MEASURES, AND WHY THAT IS THE HONEST ANSWER
 *  ---------------------------------------------------
 *  Every `Recommendation` now carries a locale-free `subjectKey` and, where a real
 *  number underlies it, a `snapshot`. This ledger records what was actually SHOWN to
 *  the operator: first sight, last sight, how many times, and — when the signal stops
 *  appearing — whether the number the signal itself reported got better or worse.
 *
 *  The comparison is `snapshot.firstValue` vs `snapshot.lastValue` OF THE SAME SIGNAL.
 *  It reads NOTHING else: no re-derivation, no external store, no second engine. That
 *  is deliberate and it is the design's honesty core. A resolved subject has no current
 *  row by definition — the rec is gone, that is what "resolved" means — so there is no
 *  "current value" left to fetch. The only defensible measurement is the last thing
 *  the producing signal said before it fell silent. Anything richer would be the app
 *  grading its own homework with a different pen.
 *
 *  WHAT IT REFUSES TO MEASURE
 *  --------------------------
 *   • A record with no snapshot resolves with NO outcome. Absence is not zero — the
 *     same rule as `measuredBadge` in organic-channels/outcomes.ts.
 *   • A record derived from SAMPLE data is never scored, ever, and the flag is STICKY:
 *     once a subject has been seen on fixture data its baseline is fiction, and a
 *     project later going live cannot retroactively make that baseline real. Failing
 *     closed here costs a chip; failing open would put a fabricated number under the
 *     word "improved".
 *   • A move inside the dead-band is `unchanged`, never rounded into a story.
 *
 *  The dead-band, the inverse-key handling and the zero-baseline fallback are the SAME
 *  semantics as `src/lib/diagnoses/outcome.ts` — copied deliberately rather than
 *  imported, because that module's functions are typed to `DiagnosisMetricKey` and a
 *  producer's snapshot key is an open string. Two outcome chips that disagreed about
 *  which direction is "better" would be worse than either chip alone, so the numbers
 *  below must stay in lockstep with OUTCOME_THRESHOLD / INVERSE_METRIC_KEYS. */

export type AdviceStatus = "open" | "resolved" | "dismissed";
export type AdviceOutcomeStatus = "improved" | "unchanged" | "worse";

export interface AdviceOutcome {
  status: AdviceOutcomeStatus;
  /** signed RELATIVE change of the tracked metric (first → last), never inverted */
  deltaPct: number | null;
  /** ISO timestamp the outcome was minted (= the resolve tick) */
  at: string;
}

export interface AdviceRecord {
  /** locale-free identity from the producer — THE key of this ledger */
  subjectKey: string;
  module: string;
  severity: string;
  /** display only, in the locale of the FIRST sighting (never re-written) */
  title: string;
  firstSeenAt: string;
  lastSeenAt: string;
  timesSeen: number;
  reopenedCount: number;
  /** the metric the producer reported, captured at first sight and on every sighting */
  snapshot?: { key: string; firstValue: number; lastValue: number };
  impactCzk?: number;
  /** STICKY: true once the subject has ever been seen on sample data */
  sample?: boolean;
  status: AdviceStatus;
  /** only on `resolved` */
  resolvedAt?: string;
  /** only on `resolved`, only with a snapshot, NEVER on a sample record */
  outcome?: AdviceOutcome;
  /** only on `dismissed` */
  dismissedAt?: string;
}

export interface AdviceLedger {
  records: AdviceRecord[];
  updatedAt: string;
}

/** Bound on the blob (it rides `project_state`, one JSON document per project). */
export const ADVICE_LEDGER_CAP = 200;

/** How many days a subject must be ABSENT from the rendered rec list before it counts
 *  as resolved. Three: the ledger only updates on render, so one missed day of
 *  visits must not mint an outcome. */
export const ADVICE_RESOLVE_AFTER_DAYS = 3;

/** Relative band inside which a metric reads `unchanged`. Identical to
 *  `OUTCOME_THRESHOLD` in diagnoses/outcome.ts — see the header. */
export const ADVICE_OUTCOME_DEADBAND = 0.05;

/** Snapshot keys where a FALL is the improvement. Every other registered key reads
 *  "higher is better" (the list lives in insights/types.ts).
 *
 *  `pno` is the live one — cost share of revenue, exactly as
 *  `INVERSE_METRIC_KEYS` treats it, so the diagnosis chip and the advice chip can
 *  never disagree about direction for the same metric.
 *
 *  `daysToStockout` is declared by the WP contract and RESERVED: no producer emits
 *  it today. The stock producer snapshots `daysOfCover` instead, which is
 *  higher-is-better, because a SKU being restocked (more days of cover) is the
 *  improvement — a producer wanting the inverse framing must use this key and mean
 *  "elapsed time toward a stockout", not "cover remaining". */
export const ADVICE_INVERSE_KEYS: readonly string[] = ["pno", "daysToStockout"];

const DAY_MS = 86_400_000;

/** The minimum a producer must hand the ledger — structurally a `Recommendation`,
 *  but typed narrowly so the ledger stays free of the insights module's graph and
 *  can be unit-tested with plain object literals. */
export interface AdviceSighting {
  subjectKey: string;
  module: string;
  severity: string;
  title: string;
  impactCzk?: number;
  sample?: boolean;
  snapshot?: { key: string; value: number };
}

/** Score a resolved record's snapshot: what did the signal's OWN number do between
 *  the first sighting and the last? Returns null when there is nothing honest to say
 *  (no snapshot, non-finite values, or a sample-derived baseline).
 *
 *  The reported `deltaPct` always states what the tracked METRIC did — it is never
 *  sign-flipped for an inverse key, because a negative number printed beside the word
 *  "improved" would claim the metric rose. Only the VERDICT inverts. */
export function scoreAdviceRecord(record: AdviceRecord, at: string): AdviceOutcome | null {
  if (record.sample) return null;
  const snap = record.snapshot;
  if (!snap) return null;
  const { firstValue: base, lastValue: current, key } = snap;
  if (!Number.isFinite(base) || !Number.isFinite(current)) return null;
  // Relative delta against the baseline; a zero (or absent) baseline falls back to a
  // sign comparison rather than dividing by zero.
  const delta =
    base !== 0
      ? (current - base) / Math.abs(base)
      : current > 0
        ? 1
        : current < 0
          ? -1
          : 0;
  const good = ADVICE_INVERSE_KEYS.includes(key) ? -delta : delta;
  const status: AdviceOutcomeStatus =
    good >= ADVICE_OUTCOME_DEADBAND ? "improved" : good <= -ADVICE_OUTCOME_DEADBAND ? "worse" : "unchanged";
  return { status, deltaPct: delta, at };
}

function upsert(prev: AdviceRecord | undefined, sighting: AdviceSighting, nowIso: string): AdviceRecord {
  const seen = sighting.snapshot;
  if (!prev) {
    return {
      subjectKey: sighting.subjectKey,
      module: sighting.module,
      severity: sighting.severity,
      title: sighting.title,
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      timesSeen: 1,
      reopenedCount: 0,
      status: "open",
      ...(seen ? { snapshot: { key: seen.key, firstValue: seen.value, lastValue: seen.value } } : {}),
      ...(sighting.impactCzk !== undefined ? { impactCzk: sighting.impactCzk } : {}),
      ...(sighting.sample ? { sample: true } : {}),
    };
  }
  // A subject that comes back after being resolved REOPENS as the same subject: the
  // counters keep running, the baseline is NOT re-taken (the snapshot is captured at
  // first sight only), and the stale outcome is dropped — it described a resolve that
  // did not hold. Kept flat: `reopenedCount` is the whole history we keep.
  const reopening = prev.status === "resolved";
  const next: AdviceRecord = {
    ...prev,
    // Severity and impact are CURRENT facts about the signal and follow it; the title
    // is display in the locale of first sight and deliberately never re-written.
    severity: sighting.severity,
    module: sighting.module,
    lastSeenAt: nowIso,
    timesSeen: prev.timesSeen + 1,
    reopenedCount: prev.reopenedCount + (reopening ? 1 : 0),
    // A dismissed subject stays dismissed while it is still being seen — the operator
    // said "not this"; only the route puts it back to open.
    status: reopening ? "open" : prev.status,
    ...(sighting.impactCzk !== undefined ? { impactCzk: sighting.impactCzk } : {}),
    // STICKY sample — see the header.
    ...(prev.sample || sighting.sample ? { sample: true } : {}),
  };
  if (reopening) {
    delete next.resolvedAt;
    delete next.outcome;
  }
  if (seen) {
    next.snapshot = prev.snapshot
      ? { key: prev.snapshot.key, firstValue: prev.snapshot.firstValue, lastValue: seen.value }
      : // No baseline existed (the producer gained a snapshot after this subject was
        // first tracked) — this sighting becomes the baseline, not a free "improved".
        { key: seen.key, firstValue: seen.value, lastValue: seen.value };
  }
  return next;
}

/** Eviction order: resolved (oldest resolve first), then dismissed, then open. An
 *  open subject is live advice and is never dropped while a settled one could go. */
function evictionRank(r: AdviceRecord): [number, string] {
  if (r.status === "resolved") return [0, r.resolvedAt ?? r.lastSeenAt];
  if (r.status === "dismissed") return [1, r.dismissedAt ?? r.lastSeenAt];
  return [2, r.lastSeenAt];
}

/** THE ledger update. Pure: same inputs → same blob.
 *
 *   1. every sighting upserts (create / bump / reopen);
 *   2. every OPEN record absent from this sighting for ≥ ADVICE_RESOLVE_AFTER_DAYS
 *      resolves, and is scored if — and only if — it has a non-sample snapshot;
 *   3. the blob is trimmed to ADVICE_LEDGER_CAP, settled records first.
 *
 *  `recs` is the CURRENT full rec list for the project. Note what step 2 does NOT do:
 *  it never resolves a `dismissed` record (the operator, not the clock, owns that
 *  state) and it never mints an outcome for a subject it has no baseline for. */
export function updateAdviceLedger(
  ledger: AdviceLedger | null | undefined,
  recs: readonly AdviceSighting[],
  now: Date
): AdviceLedger {
  const nowIso = now.toISOString();
  const byKey = new Map<string, AdviceRecord>();
  for (const r of ledger?.records ?? []) byKey.set(r.subjectKey, r);

  const seenNow = new Set<string>();
  for (const sighting of recs) {
    if (!sighting?.subjectKey) continue;
    seenNow.add(sighting.subjectKey);
    byKey.set(sighting.subjectKey, upsert(byKey.get(sighting.subjectKey), sighting, nowIso));
  }

  const cutoff = now.getTime() - ADVICE_RESOLVE_AFTER_DAYS * DAY_MS;
  for (const [key, record] of byKey) {
    if (record.status !== "open" || seenNow.has(key)) continue;
    const lastSeen = Date.parse(record.lastSeenAt);
    if (!Number.isFinite(lastSeen) || lastSeen > cutoff) continue;
    const resolved: AdviceRecord = { ...record, status: "resolved", resolvedAt: nowIso };
    const outcome = scoreAdviceRecord(resolved, nowIso);
    if (outcome) resolved.outcome = outcome;
    byKey.set(key, resolved);
  }

  let records = [...byKey.values()];
  if (records.length > ADVICE_LEDGER_CAP) {
    const ordered = [...records].sort((a, b) => {
      const [ra, ta] = evictionRank(a);
      const [rb, tb] = evictionRank(b);
      return ra !== rb ? ra - rb : ta < tb ? -1 : ta > tb ? 1 : a.subjectKey < b.subjectKey ? -1 : 1;
    });
    const doomed = new Set(ordered.slice(0, records.length - ADVICE_LEDGER_CAP).map((r) => r.subjectKey));
    records = records.filter((r) => !doomed.has(r.subjectKey));
  }
  return { records, updatedAt: nowIso };
}

/** The records whose outcome the operator should see: RESOLVED, scored, and resolved
 *  within `days`. Newest first, capped by `limit`. Sample records can never appear —
 *  they carry no outcome by construction, but the filter states it too. */
export function recentAdviceOutcomes(
  ledger: AdviceLedger | null | undefined,
  now: Date,
  days = 7,
  limit = 3
): AdviceRecord[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return (ledger?.records ?? [])
    .filter((r) => r.status === "resolved" && r.outcome && !r.sample)
    .filter((r) => {
      const at = Date.parse(r.resolvedAt ?? "");
      return Number.isFinite(at) && at >= cutoff;
    })
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""))
    .slice(0, limit);
}

/** Every scored outcome in the ledger, newest resolve first — the window-free read
 *  the recap grounding uses (a monthly narrative has no 7-day horizon). */
export function scoredAdviceOutcomes(ledger: AdviceLedger | null | undefined): AdviceRecord[] {
  return (ledger?.records ?? [])
    .filter((r) => r.status === "resolved" && r.outcome && !r.sample)
    .sort((a, b) => (b.resolvedAt ?? "").localeCompare(a.resolvedAt ?? ""));
}

/** The subject keys the operator dismissed — the render filter's input. */
export function dismissedSubjectKeys(ledger: AdviceLedger | null | undefined): Set<string> {
  return new Set((ledger?.records ?? []).filter((r) => r.status === "dismissed").map((r) => r.subjectKey));
}

/** Look one subject up (the "sledováno od" title attribute on an open row). */
export function adviceRecordFor(
  ledger: AdviceLedger | null | undefined,
  subjectKey: string
): AdviceRecord | null {
  return (ledger?.records ?? []).find((r) => r.subjectKey === subjectKey) ?? null;
}

// ---------------------------------------------------------------------------
// Read tolerance — a blob written before a field existed must still read.
// ---------------------------------------------------------------------------

function isStatus(v: unknown): v is AdviceStatus {
  return v === "open" || v === "resolved" || v === "dismissed";
}

function posInt(v: unknown, fallback: number): number {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sanitizeOutcome(raw: unknown, at: string): AdviceOutcome | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (o.status !== "improved" && o.status !== "unchanged" && o.status !== "worse") return undefined;
  return {
    status: o.status,
    deltaPct: num(o.deltaPct),
    at: typeof o.at === "string" && o.at ? o.at : at,
  };
}

/** Coerce a stored blob into the ledger shape: unknown/keyless records dropped,
 *  missing counters defaulted, an outcome that cannot be trusted removed. The
 *  project_state version stays 1 — this IS the migration. A blob that is not an
 *  object at all reads as "nothing tracked yet", never as a throw on a page render. */
export function sanitizeAdviceLedger(raw: unknown): AdviceLedger | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { records?: unknown; updatedAt?: unknown };
  if (!Array.isArray(o.records)) return null;
  const updatedAt = typeof o.updatedAt === "string" ? o.updatedAt : "";
  const records: AdviceRecord[] = [];
  const seen = new Set<string>();
  for (const item of o.records) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const subjectKey = typeof r.subjectKey === "string" ? r.subjectKey.trim() : "";
    if (!subjectKey || seen.has(subjectKey)) continue;
    seen.add(subjectKey);
    const lastSeenAt = typeof r.lastSeenAt === "string" && r.lastSeenAt ? r.lastSeenAt : updatedAt;
    const firstSeenAt = typeof r.firstSeenAt === "string" && r.firstSeenAt ? r.firstSeenAt : lastSeenAt;
    const status = isStatus(r.status) ? r.status : "open";
    const rawSnap = r.snapshot as Record<string, unknown> | undefined | null;
    const first = rawSnap ? num(rawSnap.firstValue) : null;
    const last = rawSnap ? num(rawSnap.lastValue) : null;
    const snapKey = rawSnap && typeof rawSnap.key === "string" ? rawSnap.key : "";
    const record: AdviceRecord = {
      subjectKey,
      module: typeof r.module === "string" ? r.module : "",
      severity: typeof r.severity === "string" ? r.severity : "info",
      title: typeof r.title === "string" ? r.title : subjectKey,
      firstSeenAt,
      lastSeenAt,
      timesSeen: posInt(r.timesSeen, 1),
      reopenedCount: posInt(r.reopenedCount, 0),
      status,
      ...(snapKey && first !== null && last !== null
        ? { snapshot: { key: snapKey, firstValue: first, lastValue: last } }
        : {}),
      ...(num(r.impactCzk) !== null ? { impactCzk: num(r.impactCzk)! } : {}),
      ...(r.sample === true ? { sample: true } : {}),
    };
    if (status === "resolved") {
      record.resolvedAt = typeof r.resolvedAt === "string" && r.resolvedAt ? r.resolvedAt : lastSeenAt;
      // An outcome only survives the read on a scorable record: with a snapshot, and
      // never on a sample one. A blob claiming otherwise is a blob to distrust.
      const outcome = sanitizeOutcome(r.outcome, record.resolvedAt);
      if (outcome && record.snapshot && !record.sample) record.outcome = outcome;
    }
    if (status === "dismissed") {
      record.dismissedAt = typeof r.dismissedAt === "string" && r.dismissedAt ? r.dismissedAt : lastSeenAt;
    }
    records.push(record);
  }
  return { records, updatedAt };
}
