/** SQLite-backed store for the campaigns feature (server-only). Persists the
 *  synced Google Ads campaigns and the AI evaluation reports so they survive a
 *  page reload / server restart — the point of running in local-dev mode.
 *
 *  Raw metrics only are stored; ratios are always re-derived in `types.ts`. */
import { getDb } from "../db";
import type { AiResponse } from "../ai-types";
import type {
  CampaignReport,
  CampaignReportResult,
  EvalScope,
  ReportHistoryPoint,
} from "../ai-types";
import type { Campaign, CampaignPeriod } from "./types";

export interface SyncMeta {
  source: string;
  period: CampaignPeriod;
  syncedAt: string;
}

// --- row shapes returned by node:sqlite (column → value) --------------------

interface CampaignRowDb {
  id: string;
  name: string;
  type: string;
  status: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  conversion_value: number;
}

interface ReportRowDb {
  scope: string;
  campaign_id: string | null;
  period: string;
  model: string;
  demo: number;
  payload: string;
  prompt: string;
  took_ms: number;
  created_at: string;
}

// --- campaigns --------------------------------------------------------------

/** Replace the whole campaign set with a freshly-synced one and record the sync
 *  metadata, in a single transaction. Campaign ids are stable across periods, so
 *  any saved reports keyed by campaign id stay valid. */
export function upsertCampaigns(
  campaigns: Campaign[],
  meta: { source: string; period: CampaignPeriod }
): void {
  const db = getDb();
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM campaigns");
    const insert = db.prepare(
      `INSERT INTO campaigns
         (id, name, type, status, impressions, clicks, cost, conversions, conversion_value, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    campaigns.forEach((c, i) =>
      insert.run(
        c.id,
        c.name,
        c.type,
        c.status,
        c.impressions,
        c.clicks,
        c.cost,
        c.conversions,
        c.conversionValue,
        i
      )
    );
    db.prepare(
      `INSERT INTO sync_meta (id, source, period, synced_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source = excluded.source,
         period = excluded.period,
         synced_at = excluded.synced_at`
    ).run(meta.source, meta.period, new Date().toISOString());
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function listCampaigns(): Campaign[] {
  const rows = getDb()
    .prepare("SELECT * FROM campaigns ORDER BY position ASC")
    .all() as unknown as CampaignRowDb[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type as Campaign["type"],
    status: r.status as Campaign["status"],
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    cost: Number(r.cost),
    conversions: Number(r.conversions),
    conversionValue: Number(r.conversion_value),
  }));
}

export function getCampaign(id: string): Campaign | null {
  const row = getDb()
    .prepare("SELECT * FROM campaigns WHERE id = ?")
    .get(id) as unknown as CampaignRowDb | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type as Campaign["type"],
    status: row.status as Campaign["status"],
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    cost: Number(row.cost),
    conversions: Number(row.conversions),
    conversionValue: Number(row.conversion_value),
  };
}

export function getSyncMeta(): SyncMeta | null {
  const row = getDb()
    .prepare("SELECT source, period, synced_at FROM sync_meta WHERE id = 1")
    .get() as unknown as { source: string; period: string; synced_at: string } | undefined;
  if (!row) return null;
  return { source: row.source, period: row.period as CampaignPeriod, syncedAt: row.synced_at };
}

// --- reports ----------------------------------------------------------------

function toReport(r: ReportRowDb): CampaignReport {
  return {
    scope: r.scope as EvalScope,
    campaignId: r.campaign_id,
    period: r.period,
    result: JSON.parse(r.payload) as CampaignReportResult,
    meta: {
      model: r.model,
      demo: Boolean(r.demo),
      prompt: r.prompt,
      tookMs: Number(r.took_ms),
    },
    createdAt: r.created_at,
  };
}

/** Persist an evaluation and return it in the wire shape the client expects. */
export function saveReport(args: {
  scope: EvalScope;
  campaignId: string | null;
  period: CampaignPeriod;
  response: AiResponse<CampaignReportResult>;
}): CampaignReport {
  const { scope, campaignId, period, response } = args;
  const createdAt = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO reports
         (scope, campaign_id, period, model, demo, payload, prompt, took_ms, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      scope,
      campaignId,
      period,
      response.meta.model,
      response.meta.demo ? 1 : 0,
      JSON.stringify(response.result),
      response.meta.prompt,
      response.meta.tookMs,
      createdAt
    );
  return {
    scope,
    campaignId,
    period,
    result: response.result,
    meta: response.meta,
    createdAt,
  };
}

/** Latest report per (scope, campaign) for a period, keyed by campaign id —
 *  or "overall" for the portfolio report. */
export function getReportsForPeriod(period: CampaignPeriod): Record<string, CampaignReport> {
  const rows = getDb()
    .prepare(
      `SELECT * FROM reports
       WHERE id IN (
         SELECT MAX(id) FROM reports
         WHERE period = ?
         GROUP BY scope, IFNULL(campaign_id, '')
       )`
    )
    .all(period) as unknown as ReportRowDb[];

  const out: Record<string, CampaignReport> = {};
  for (const r of rows) {
    const report = toReport(r);
    out[report.scope === "overall" ? "overall" : report.campaignId ?? "overall"] = report;
  }
  return out;
}

// --- report history (score-over-time timeline) ------------------------------

interface HistoryRowDb {
  period: string;
  demo: number;
  payload: string;
  created_at: string;
}

function toHistoryPoint(r: HistoryRowDb): ReportHistoryPoint {
  const result = JSON.parse(r.payload) as CampaignReportResult;
  return {
    score: result.score,
    verdict: result.verdict,
    period: r.period,
    demo: Boolean(r.demo),
    createdAt: r.created_at,
  };
}

/** Full chronological score history for one scope+campaign (oldest → newest),
 *  spanning every period — the data behind a report's trend sparkline. Unlike
 *  getReportsForPeriod this keeps every evaluation, not just the latest. */
export function getReportHistory(
  scope: EvalScope,
  campaignId: string | null
): ReportHistoryPoint[] {
  const rows = getDb()
    .prepare(
      `SELECT period, demo, payload, created_at FROM reports
       WHERE scope = ? AND IFNULL(campaign_id, '') = ?
       ORDER BY id ASC`
    )
    .all(scope, campaignId ?? "") as unknown as HistoryRowDb[];
  return rows.map(toHistoryPoint);
}

/** Every score history in a single pass, keyed like getReportsForPeriod
 *  ("overall" or a campaign id) so the page can render a trend next to each
 *  report without an N+1 of per-key queries. */
export function getReportHistories(): Record<string, ReportHistoryPoint[]> {
  const rows = getDb()
    .prepare(
      `SELECT scope, campaign_id, period, demo, payload, created_at FROM reports
       ORDER BY id ASC`
    )
    .all() as unknown as (HistoryRowDb & { scope: string; campaign_id: string | null })[];

  const out: Record<string, ReportHistoryPoint[]> = {};
  for (const r of rows) {
    const key = r.scope === "overall" ? "overall" : r.campaign_id ?? "overall";
    if (!out[key]) out[key] = [];
    out[key].push(toHistoryPoint(r));
  }
  return out;
}
