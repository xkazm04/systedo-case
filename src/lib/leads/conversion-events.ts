/** WP W3-C — the CONVERSION LEDGER's pure model: what a conversion row is, when a
 *  stage move produces one, and how a set of rows rolls up.
 *
 *  WHY A LEDGER AT ALL. Google Ads and Sklik can only optimise toward outcomes they
 *  are told about, and the outcome a lead-gen advertiser actually cares about
 *  (qualified / won) happens in the CRM days or weeks after the click. The stage
 *  board already knows the moment it happens; nothing was writing it down. This
 *  module is that write-down — an append-only, PII-free record of "this contact
 *  crossed into qualified / won at this instant, attributed to this source, carrying
 *  this click id" — which is exactly the shape an offline-conversion upload needs.
 *
 *  NO PII, BY CONSTRUCTION. A row carries a `contactId`, an attribution triple, a
 *  gclid and an optional value. It never carries a name, an e-mail or a phone
 *  number. That is the same prohibition the CRM namespace already lives under
 *  (`/api/projects/[id]/crm/contacts/route.ts` — lead text must never reach the LLM
 *  chokepoint), extended to this store because its rows leave the product as
 *  downloadable files and its aggregate counts are the only thing allowed to cross
 *  into a prompt.
 *
 *  GDPR interaction. `eraseContact` (mutate.ts) tombstones a person: every PII field
 *  is hard-cleared and the timeline is deleted, leaving the anonymous funnel
 *  skeleton. Ledger rows hold no PII, so they SURVIVE an erasure untouched — they
 *  are the attribution record, which is the whole point of a ledger, and Art. 17
 *  does not require destroying anonymous statistics.
 *
 *  Framework-free and pure: no store, no clock read, no React. Every instant is
 *  passed in, so the detectors are unit-testable without a database. */
import { PIPELINE_RANK, type Attribution, type Contact, type PipelineStage } from "./types";
import { sourceLabel } from "./aggregate";

/* ── the row ─────────────────────────────────────────────────────────────────── */

export const CONVERSION_KINDS = ["qualified", "won"] as const;
export type ConversionKind = (typeof CONVERSION_KINDS)[number];

export function isConversionKind(v: unknown): v is ConversionKind {
  return typeof v === "string" && (CONVERSION_KINDS as readonly string[]).includes(v);
}

/** One durable conversion fact. */
export interface ConversionEvent {
  /** `${contactId}_${kind}` — the row is UPSERTED under this id, so a contact that
   *  regresses out of qualified and re-qualifies later updates its one row instead
   *  of minting a second (which would double-count on upload). */
  id: string;
  contactId: string;
  kind: ConversionKind;
  /** ISO, the stage-ENTRY moment (not the moment the ledger noticed) */
  at: string;
  /** the display label lead-quality groups by — the join key for per-source rollups
   *  and for the diagnosis grounding. Derived from the attribution via
   *  `aggregate.ts#sourceLabel`, stored here because the ledger outlives the contact. */
  sourceLabel: string;
  /** the minimum attribution an upload needs. NEVER identity. */
  attribution: { source: string; campaign?: string; gclid?: string };
  /** CZK. `null` = unknown — deliberately NOT 0: a conversion of unknown worth and a
   *  conversion worth nothing are different facts, and only one of them may be
   *  uploaded as a value. */
  value: number | null;
  /** which connector produced the contact, when known */
  connectorId?: string;
  /** WP S3 — THE DOUBLE-UPLOAD MARKER. Present iff this row has been accepted by a
   *  third-party processor, written in the SAME pass the acceptance was read. It is
   *  the whole of the "a row uploads at most once" guarantee: the drain's query
   *  excludes marked rows, and the upsert-by-id (`appendConversionEvents`) means a
   *  re-mark cannot mint a second row. Rides the event's `data` JSON — no migration,
   *  and an older reader simply ignores a field it does not know. */
  uploaded?: { platform: "google-ads"; at: string; batchId: string; action: string };
  /** WP S3 — a REJECTION, which is a different fact from an upload and must never be
   *  confused with one. `attempts` is the count of failed tries; past
   *  DRAIN_MAX_ATTEMPTS the drain stops re-offering the row and the card says how
   *  many are stuck. A failure NEVER writes `uploaded`. */
  uploadError?: { at: string; message: string; attempts: number };
}

/** Max rows kept per project before the oldest are evicted on append. */
export const CONVERSION_EVENT_CAP = 5000;
/** Rows older than this are pruned by the `conversion-rollup` ledger step. */
export const CONVERSION_RETENTION_DAYS = 180;
/** The rolling window every headline number on the strip is measured over. */
export const CONVERSION_WINDOW_30 = 30;

const DAY_MS = 86_400_000;

/** The upsert id. Pure and stable — the whole idempotency of the ledger rests on it. */
export function conversionEventId(contactId: string, kind: ConversionKind): string {
  return `${contactId}_${kind}`;
}

/** A monetary value that may be uploaded: finite and strictly positive, else null.
 *  A 0 (an empty CSV cell parsed as a number, a placeholder) is NOT a value. */
export function conversionValue(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** The attribution triple a ledger row carries, stripped of everything else the
 *  contact's `Attribution` holds (medium/term/content/landingPath/referrerHost are
 *  campaign-analytics fields an upload has no use for). */
function ledgerAttribution(a: Attribution | undefined): ConversionEvent["attribution"] {
  const source = (a?.source ?? "").trim() || "unknown";
  const campaign = a?.campaign?.trim();
  const gclid = a?.gclid?.trim();
  return {
    source,
    ...(campaign ? { campaign } : {}),
    ...(gclid ? { gclid } : {}),
  };
}

export interface ConversionExtras {
  /** deal value in CZK, when the producing row carried one */
  value?: number | null;
  /** override the connector id (the applier knows the event's, the contact may not) */
  connectorId?: string;
}

/** THE shared rule, expressed once: which kinds a rank transition mints.
 *
 *  `qualified` on the FIRST crossing of rank 0 → ≥1, `won` on the first crossing to
 *  rank 3. A direct working → won jump mints BOTH (the advertiser needs the
 *  qualification signal too, and the funnel really did pass through it). A rank
 *  REGRESSION mints nothing: retracting an already-uploaded conversion is a live-API
 *  problem (WP S3), and silently emitting a negative row here would be a lie the
 *  file format cannot express. */
function kindsForRankChange(prevRank: number, nextRank: number): ConversionKind[] {
  if (nextRank < 1) return [];
  const out: ConversionKind[] = [];
  if (prevRank < 1) out.push("qualified");
  if (nextRank >= 3 && prevRank < 3) out.push("won");
  return out;
}

function buildEvents(
  kinds: readonly ConversionKind[],
  contact: Contact,
  now: Date,
  extra: ConversionExtras = {}
): ConversionEvent[] {
  if (kinds.length === 0) return [];
  const attribution = ledgerAttribution(contact.attribution);
  const at = contact.stageEnteredAt || now.toISOString();
  const connectorId = extra.connectorId ?? contact.attribution?.connectorId;
  return kinds.map((kind) => ({
    id: conversionEventId(contact.id, kind),
    contactId: contact.id,
    kind,
    at,
    sourceLabel: sourceLabel(contact.attribution),
    attribution,
    value: extra.value ?? null,
    ...(connectorId ? { connectorId } : {}),
  }));
}

/** APPEND SITE 1 — a stage move. `contact` must be the POST-move record (its
 *  `stageEnteredAt` is the conversion instant). Returns [] for a no-op move, a
 *  regression, or a move that stays below rank 1. */
export function conversionFromStageChange(
  prev: PipelineStage,
  next: PipelineStage,
  contact: Contact,
  now: Date,
  extra: ConversionExtras = {}
): ConversionEvent[] {
  if (prev === next) return [];
  return buildEvents(kindsForRankChange(PIPELINE_RANK[prev], PIPELINE_RANK[next]), contact, now, extra);
}

/** APPEND SITE 2 — a contact created (or auto-merged) by `applyLeadEvent`. That path
 *  sets the initial stage directly and never calls `changeStage`, so an import of an
 *  already-`won` row would otherwise leave no ledger trace at all. Treated as a
 *  transition from rank 0, and the id rule makes the two sites safe to overlap. */
export function conversionFromApply(
  contact: Contact,
  now: Date,
  extra: ConversionExtras = {}
): ConversionEvent[] {
  return buildEvents(kindsForRankChange(0, PIPELINE_RANK[contact.stage]), contact, now, extra);
}

/* ── coverage + rollup ───────────────────────────────────────────────────────── */

export interface GclidCoverage {
  total: number;
  withGclid: number;
  /** share of rows carrying a click id, rounded to 2 decimals; 0 when there are none */
  pct: number;
}

/** How much of a row set can actually be uploaded to Google. This is the number the
 *  strip is honest with: a qualified lead without a gclid is exportable to Sklik's
 *  hand sheet and to NOTHING else, and pretending otherwise would send the operator
 *  to a file that silently drops most of their conversions. */
export function gclidCoverage(events: readonly ConversionEvent[]): GclidCoverage {
  const total = events.length;
  const withGclid = events.filter((e) => !!e.attribution.gclid).length;
  return { total, withGclid, pct: total > 0 ? round2(withGclid / total) : 0 };
}

export interface ConversionSourceRow {
  sourceLabel: string;
  qualified30d: number;
  won30d: number;
  gclidPct: number;
}

export interface ConversionSummary {
  qualified30d: number;
  won30d: number;
  bySource: ConversionSourceRow[];
  gclidPct: number;
  updatedAt: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** The day (YYYY-MM-DD) `days` before `now` — the lower bound of a rolling window.
 *  A day string compares correctly against a full ISO `at` by prefix. */
export function windowStartDay(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

/** The retention cutoff: rows strictly older than this day are prunable. */
export function retentionCutoffDay(now: Date): string {
  return windowStartDay(now, CONVERSION_RETENTION_DAYS);
}

/** Recompute the per-project summary from the retained rows.
 *
 *  RECOMPUTED, NEVER ACCUMULATED — the same reasoning as the organic-channels
 *  rollup: a rolling 30-day count cannot be incremented, because yesterday's
 *  conversions leave the window without anything happening. Only a recomputed
 *  number can go DOWN, which is what makes it honest. */
export function summarizeConversions(
  events: readonly ConversionEvent[],
  now: Date
): ConversionSummary {
  const since = windowStartDay(now, CONVERSION_WINDOW_30);
  const recent = events.filter((e) => e.at >= since);
  const bySource = new Map<string, { qualified: number; won: number; rows: ConversionEvent[] }>();
  for (const e of recent) {
    const label = e.sourceLabel || "unknown";
    let acc = bySource.get(label);
    if (!acc) {
      acc = { qualified: 0, won: 0, rows: [] };
      bySource.set(label, acc);
    }
    acc.rows.push(e);
    if (e.kind === "qualified") acc.qualified += 1;
    else acc.won += 1;
  }
  return {
    qualified30d: recent.filter((e) => e.kind === "qualified").length,
    won30d: recent.filter((e) => e.kind === "won").length,
    bySource: [...bySource.entries()]
      .map(([label, acc]) => ({
        sourceLabel: label,
        qualified30d: acc.qualified,
        won30d: acc.won,
        gclidPct: gclidCoverage(acc.rows).pct,
      }))
      .sort((a, b) => b.won30d - a.won30d || b.qualified30d - a.qualified30d || a.sourceLabel.localeCompare(b.sourceLabel)),
    gclidPct: gclidCoverage(recent).pct,
    updatedAt: now.toISOString(),
  };
}
