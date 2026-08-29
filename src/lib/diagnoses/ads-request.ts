/** Shared, server-usable builder for the ads-performance-diagnosis request. The
 *  SAME real-numbers-only projection is read by the Výkon panel (on click, through
 *  the server resolver) and by the weekly-digest cron, rather than duplicated —
 *  mirroring `lead-source-request.ts`. Framework-free + pure (it imports only the
 *  client-safe campaign model + triage rules), so every selection rule below is
 *  unit-testable without a store.
 *
 *  Three integrity rules are structural here, not prose:
 *   1. Every number is one the campaign spine already computed. Nothing is invented,
 *      and nothing is derived from a figure the caller did not supply.
 *   2. ADR-0010 — no cross-currency sums. When the project's networks disagree on
 *      currency, `totals` (and the worst/best picks ranked by money) cover the
 *      PRIMARY platform ALONE; `platforms[]` still names every network, each in its
 *      own currency, and the prompt is told never to add them.
 *   3. "Worst" means WASTED SPEND, not merely bad ROAS: spend on a campaign with no
 *      conversions at all, plus — for a converting campaign over target — the part of
 *      its spend the target PNO does not justify. That is the money an action can
 *      actually recover. */
import type {
  AdsDiagnosisCampaign,
  AdsDiagnosisPlatform,
  AdsDiagnosisRequest,
  AdsDiagnosisPlatformSplit,
} from "../ai-types";
import {
  aggregate,
  TARGET_PNO,
  type AdsSource,
  type CampaignChange,
  type CampaignRow,
} from "../campaigns/types";
import { triage, type TriageGoals } from "../campaigns/triage";
import type { DailyPoint } from "../types";

/** At most this many wasteful campaigns ride the prompt (biggest waste first). */
export const ADS_WORST_MAX = 6;
/** At most this many healthy campaigns ride the prompt, as a budget destination. */
export const ADS_BEST_MAX = 3;

/** Which network a row came from. A row synced before the ADR-0010 stamp, or one
 *  from the illustrative spine, reads as "sample" — never guessed into a network. */
export function platformOf(source: AdsSource | undefined): AdsDiagnosisPlatform {
  return source === "google-ads" || source === "sklik" ? source : "sample";
}

/** Precedence when a primary platform has to be chosen without one being supplied. */
const PLATFORM_ORDER: AdsDiagnosisPlatform[] = ["google-ads", "sklik", "sample"];

/** Is there anything for a portfolio diagnosis to act on? Spend is the signal: a
 *  synced-but-idle account has no waste to recover, so the digest skips it honestly. */
export function hasAdsSignal(rows: Pick<CampaignRow, "cost">[]): boolean {
  return rows.some((r) => r.cost > 0);
}

/** Does the portfolio rest on genuinely synced network data? False when every row is
 *  the illustrative sample (or predates the source stamp) — the honest `sample` flag. */
export function hasLivePlatform(rows: Pick<CampaignRow, "source">[]): boolean {
  return rows.some((r) => platformOf(r.source) !== "sample");
}

/** The spend a campaign did NOT justify, at the target cost share of revenue: all of
 *  it when nothing converted, else the part above what the target allows (0 when the
 *  campaign is at or under target). This is what "worst" ranks by. */
export function wastedSpend(
  row: Pick<CampaignRow, "cost" | "conversions" | "conversionValue">,
  targetPno: number
): number {
  if (row.cost <= 0) return 0;
  if (row.conversions <= 0 || row.conversionValue <= 0) return row.cost;
  return Math.max(0, row.cost - row.conversionValue * targetPno);
}

function toCampaign(
  row: CampaignRow,
  change: CampaignChange | undefined,
  goals: TriageGoals | undefined
): AdsDiagnosisCampaign {
  const c: AdsDiagnosisCampaign = {
    id: row.id,
    name: row.name,
    platform: platformOf(row.source),
    type: row.type,
    cost: row.cost,
    conversions: row.conversions,
    conversionValue: row.conversionValue,
    roas: row.roas,
    pno: row.pno,
    ctr: row.ctr,
    severity: triage(row, change, goals).severity,
  };
  if (row.budgetPerDay != null && row.budgetPerDay > 0) c.budgetPerDay = row.budgetPerDay;
  if (change) {
    c.deltaCostPct = change.costDelta;
    c.deltaValuePct = change.valueDelta;
  }
  return c;
}

/** One row per network actually present, in precedence order — each with its OWN
 *  cost (never summed across currencies) and its currency-free ROAS. */
function platformSplits(rows: CampaignRow[]): AdsDiagnosisPlatformSplit[] {
  const byPlatform = new Map<AdsDiagnosisPlatform, CampaignRow[]>();
  for (const r of rows) {
    const p = platformOf(r.source);
    const list = byPlatform.get(p);
    if (list) list.push(r);
    else byPlatform.set(p, [r]);
  }
  return PLATFORM_ORDER.filter((p) => byPlatform.has(p)).map((platform) => {
    const group = byPlatform.get(platform)!;
    const total = aggregate(group);
    return { platform, cost: total.cost, roas: total.roas, campaigns: group.length };
  });
}

export interface AdsDiagnosisInputs {
  /** the project's campaigns for the window, metrics derived (`withMetrics`) */
  rows: CampaignRow[];
  /** the sync-over-sync diff indexed by campaign id (`indexChanges`), when one exists */
  changesById?: Record<string, CampaignChange>;
  /** ISO-4217 code the money figures are in (the primary account's captured currency) */
  currency: string;
  /** ADR-0010: the project's platforms disagree on currency */
  mixedCurrency?: boolean;
  /** which platform `totals` cover when the currencies disagree; defaults to the
   *  highest-precedence network actually present */
  primaryPlatform?: AdsDiagnosisPlatform;
  /** the tenant's agreed target cost share of revenue; defaults to the paid-portfolio
   *  constant so the waste ranking always has a yardstick */
  targetPno?: number;
  /** the previous window's totals from the daily series, when it reaches back far enough */
  prior?: { cost: number; conversions: number; conversionValue: number };
  /** the tenant's goals, so per-row severity matches the table badges exactly */
  goals?: TriageGoals;
}

/** Build the diagnosis request from the resolved portfolio. Returns null when there
 *  is nothing to diagnose (no campaigns at all). */
export function buildAdsDiagnosisRequest(input: AdsDiagnosisInputs): AdsDiagnosisRequest | null {
  const { rows, changesById, goals } = input;
  if (rows.length === 0) return null;

  const platforms = platformSplits(rows);
  const primary =
    input.primaryPlatform ?? platforms[0]?.platform ?? "sample";
  // ADR-0010: with disagreeing currencies, every money-ranked figure covers the
  // PRIMARY network alone — a mixed total (or a mixed "worst") would be fabricated.
  const scoped = input.mixedCurrency ? rows.filter((r) => platformOf(r.source) === primary) : rows;
  const totals = aggregate(scoped);
  const targetPno = input.targetPno != null && input.targetPno > 0 ? input.targetPno : TARGET_PNO;

  const ranked = scoped
    .map((row) => ({ row, waste: wastedSpend(row, targetPno) }))
    .sort((a, b) => b.waste - a.waste || b.row.cost - a.row.cost);
  const wasteful = ranked.filter((r) => r.waste > 0).slice(0, ADS_WORST_MAX);
  // Nothing wasteful → still offer the single least efficient spender, so the
  // diagnosis always has a concrete subject (the `underperformingRows` idiom).
  const worstRows =
    wasteful.length > 0
      ? wasteful.map((r) => r.row)
      : scoped
          .filter((r) => r.cost > 0)
          .sort((a, b) => b.pno - a.pno || b.cost - a.cost)
          .slice(0, 1);

  const worstIds = new Set(worstRows.map((r) => r.id));
  const best = scoped
    .filter((r) => r.cost > 0 && r.conversions > 0 && !worstIds.has(r.id))
    .sort((a, b) => b.roas - a.roas || b.conversionValue - a.conversionValue)
    .slice(0, ADS_BEST_MAX);

  const request: AdsDiagnosisRequest = {
    period: "30d",
    currency: input.currency,
    totals: {
      cost: totals.cost,
      conversions: totals.conversions,
      conversionValue: totals.conversionValue,
      roas: totals.roas,
      pno: totals.pno,
    },
    platforms,
    worst: worstRows.map((r) => toCampaign(r, changesById?.[r.id], goals)),
    best: best.map((r) => toCampaign(r, changesById?.[r.id], goals)),
    targetPno,
  };
  if (input.mixedCurrency) request.mixedCurrency = true;
  if (input.prior) request.prior = input.prior;
  return request;
}

/** The stored diagnosis's one-line subject: the costliest problem campaign, or the
 *  portfolio itself when nothing stands out. Deterministic (it reads the already-
 *  ordered request), so a re-run of unchanged data reuses the same subject. */
export const ADS_PORTFOLIO_SUBJECT = "Portfolio kampaní";

export function adsDiagnosisSubject(req: AdsDiagnosisRequest): string {
  return req.worst[0]?.name ?? ADS_PORTFOLIO_SUBJECT;
}

/** The PREVIOUS window's totals from a daily series — the honest baseline for
 *  "is this getting worse". Returns null when the series does not reach back a full
 *  second window: a partial prior would understate the comparison, and a fabricated
 *  zero would read as a collapse. Pure; the series is the report dataset's own
 *  (`revenue` is its name for conversion value). */
export function priorWindowTotals(
  daily: readonly DailyPoint[] | undefined,
  days: number
): { cost: number; conversions: number; conversionValue: number } | null {
  if (!daily || days <= 0 || daily.length < days * 2) return null;
  const end = daily.length - days;
  const window = daily.slice(end - days, end);
  return window.reduce(
    (a, p) => ({
      cost: a.cost + p.cost,
      conversions: a.conversions + p.conversions,
      conversionValue: a.conversionValue + p.revenue,
    }),
    { cost: 0, conversions: 0, conversionValue: 0 }
  );
}
