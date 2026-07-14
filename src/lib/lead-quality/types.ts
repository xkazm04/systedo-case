/** Direction 2 — the lead funnel gets real. A leadgen tenant's funnel view is
 *  otherwise synthetic (sample.ts); the "CRM webhook" was a stated unwired seam.
 *  This is the import-first counterpart: a business brings its own lead rows
 *  (source, stage, date, value?, closeDate?) from any CRM export, persisted per
 *  project through the store trio (Firestore + LOCAL_DB sqlite twin) and aggregated
 *  into the same `LeadSource[]` shape the pure funnel/velocity/alert math reads.
 *  Framework-free — the model + bounds live here so they are I/O-free testable,
 *  mirroring local-signals/types + lp-exp/types. */

/** The four CRM funnel stages, ordered lead → qualified → opportunity → won. A row
 *  carries the lead's CURRENT stage; a lead at a later stage is counted as having
 *  passed every earlier one (leads ≥ qualified ≥ opportunities ≥ won). */
export type LeadStage = "lead" | "qualified" | "opportunity" | "won";

/** Stage rank for the cumulative funnel roll-up (won implies it passed opportunity,
 *  qualified, lead). */
export const STAGE_RANK: Record<LeadStage, number> = {
  lead: 0,
  qualified: 1,
  opportunity: 2,
  won: 3,
};

/** One imported CRM lead — the live counterpart of the seeded sample sources. */
export interface ImportedLead {
  /** the source/channel the lead came in on (grouped into a LeadSource on read) */
  source: string;
  /** the lead's current funnel stage */
  stage: LeadStage;
  /** ISO date (YYYY-MM-DD) the lead entered — a row without one is dropped */
  at: string;
  /** deal value (CZK), when the export carries it; realized on won */
  value?: number;
  /** ISO date (YYYY-MM-DD) the lead closed (won), when known — powers velocity */
  closedAt?: string;
}

/** The persisted per-project blob: the imported leads + provenance + a save stamp.
 *  Mirrors the other single-blob stores ({items, updatedAt}). */
export interface ImportedLeadsState {
  items: ImportedLead[];
  /** how the rows arrived: a pasted CSV ("import") or a fetched hosted CSV ("url") */
  source: "import" | "url";
  /** ISO timestamp of the import that produced these rows */
  syncedAt: string;
  /** for source "url": the hosted CSV the rows were fetched from (enables refresh) */
  sourceUrl?: string;
  /** ISO timestamp of the last save */
  updatedAt: string;
}

// --- honest bounds ------------------------------------------------------------

/** Max imported leads per project — a working funnel sample, not an unbounded
 *  archive. Parsing past the cap keeps the FIRST rows (input order). */
export const LEAD_ROW_CAP = 5000;
/** Max source-label length (a fat-fingered paste can't store a novel). */
export const SOURCE_MAX = 80;
/** Clamp a deal value to a sane ceiling (still far above any real single deal). */
export const VALUE_MAX = 1_000_000_000;
