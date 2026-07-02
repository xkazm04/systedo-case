/** Per-tenant campaign store on Firestore (server-only). Each tenant
 *  (`tenants/{tenant}`) holds its own synced campaigns, AI reports and snapshots,
 *  so the multi-user cloud isolates every user's data and runs on a persistence
 *  layer that works on serverless / multi-instance. `tenant` is resolved per
 *  request (see connector.resolveTenant): a per-user+account id for live data,
 *  `u_{userId}` for a signed-in user's sample copy, or `sample` for anonymous.
 *
 *  Per-tenant collections are small, so reads fetch the whole collection and
 *  filter in code — this keeps queries single-field (auto-indexed), with no
 *  composite indexes to provision. */
import "server-only";
import { createHash } from "node:crypto";
import { firestore } from "@/lib/firebase";
import { recordActivity } from "./activity";
import { recordAlert } from "./alerts";
import {
  belongsToPeriod,
  campaignDocId,
  campaignSeriesDocId,
  seriesDocId,
} from "./store-keys";
import { summarizeSnapshotEntries, type SnapshotSummaryPoint } from "./triage";
import type {
  AiResponse,
  CampaignReport,
  CampaignReportResult,
  EvalScope,
  ReportHistoryPoint,
} from "../ai-types";
import type {
  Campaign,
  CampaignChange,
  CampaignPeriod,
  ChangesSummary,
  DailyPoint,
} from "./types";

export interface SyncMeta {
  source: string;
  /** the ACTIVE period — what the page and the analyze route currently show */
  period: CampaignPeriod;
  syncedAt: string;
  /** true when a live sync silently fell back to sample data (campaigns and/or
   *  series), so the UI can say so instead of labeling demo numbers "živá data" */
  degraded?: boolean;
  /** error summary of the live failure behind the fallback, when degraded */
  degradedReason?: string | null;
  /** when each period was last actually synced — the "is this period's stored
   *  state warm?" map behind the instant, quota-free period toggle */
  syncedByPeriod?: Record<string, string>;
}

function tenantDoc(tenant: string) {
  return firestore.collection("tenants").doc(tenant);
}

/** The tenant's active period (root meta), or null before the first sync —
 *  the attribution anchor for docs written before per-period keying. */
async function activePeriod(tenant: string): Promise<CampaignPeriod | null> {
  const doc = await tenantDoc(tenant).get();
  return (doc.data()?.period as CampaignPeriod | undefined) ?? null;
}

// --- campaigns --------------------------------------------------------------

/** Replace the tenant's campaign set *for one period* with a freshly-synced
 *  one, append a snapshot of it, and record the sync metadata — all in one
 *  atomic batch. Other periods' stored campaigns are left untouched, so
 *  flipping the period selector serves warm data instead of re-fetching. */
export async function upsertCampaigns(
  tenant: string,
  campaigns: Campaign[],
  meta: {
    source: string;
    period: CampaignPeriod;
    /** live sync fell back to sample data (see connector.SyncDegradation) */
    degraded?: boolean;
    degradedReason?: string | null;
  }
): Promise<void> {
  const t = tenantDoc(tenant);
  const syncedAt = new Date().toISOString();
  const batch = firestore.batch();

  // Clear this period's campaigns (plus any legacy un-keyed docs — once the
  // active period moves they could no longer be attributed reliably; the old
  // store wiped everything on every sync, so this deletes strictly less),
  // then write the new set with a stable position under period-prefixed ids.
  const existing = await t.collection("campaigns").get();
  existing.forEach((d) => {
    const p = d.data().period as string | undefined;
    if (p === meta.period || p == null) batch.delete(d.ref);
  });
  campaigns.forEach((c, i) =>
    batch.set(t.collection("campaigns").doc(campaignDocId(meta.period, c.id)), {
      ...c,
      position: i,
      period: meta.period,
    })
  );

  // Append-only snapshot of this sync (one doc per sync) for change diffing,
  // tagged with its period so diffs and the health timeline never compare a
  // 7-day window against a 90-day one.
  batch.set(t.collection("snapshots").doc(syncedAt), {
    syncedAt,
    period: meta.period,
    campaigns: campaigns.map((c) => ({
      campaignId: c.id,
      status: c.status,
      cost: c.cost,
      conversions: c.conversions,
      conversionValue: c.conversionValue,
    })),
  });

  // Sync metadata on the tenant root doc. Firestore rejects `undefined`, so the
  // optional degradation fields are normalised (and cleared on a healthy sync).
  // set+merge deep-merges maps, so syncedByPeriod keeps the other periods.
  batch.set(
    t,
    {
      source: meta.source,
      period: meta.period,
      syncedAt,
      degraded: meta.degraded ?? false,
      degradedReason: meta.degradedReason ?? null,
      syncedByPeriod: { [meta.period]: syncedAt },
    },
    { merge: true }
  );

  await batch.commit();
}

function toCampaign(r: FirebaseFirestore.DocumentData): Campaign {
  return {
    id: r.id,
    name: r.name,
    type: r.type as Campaign["type"],
    status: r.status as Campaign["status"],
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    cost: Number(r.cost),
    conversions: Number(r.conversions),
    conversionValue: Number(r.conversionValue),
    // Optional — docs synced before the budget field existed simply omit it.
    ...(typeof r.budgetPerDay === "number" && r.budgetPerDay > 0
      ? { budgetPerDay: Number(r.budgetPerDay) }
      : {}),
  };
}

/** The tenant's campaigns for `period` (defaults to the active period, so every
 *  legacy caller — the analyze route included — keeps reading exactly what the
 *  page shows). Un-keyed legacy docs count as the active period's data. */
export async function listCampaigns(tenant: string, period?: CampaignPeriod): Promise<Campaign[]> {
  const active = await activePeriod(tenant);
  const requested = period ?? active;
  const snap = await tenantDoc(tenant).collection("campaigns").orderBy("position", "asc").get();
  const docs = snap.docs.map((d) => d.data());
  if (!requested) return docs.map(toCampaign); // pre-first-sync (empty store)
  return docs
    .filter((d) => belongsToPeriod(d.period as string | undefined, active, requested))
    .map(toCampaign);
}

export async function getCampaign(
  tenant: string,
  id: string,
  period?: CampaignPeriod
): Promise<Campaign | null> {
  const active = await activePeriod(tenant);
  const requested = period ?? active;
  if (requested) {
    const keyed = await tenantDoc(tenant)
      .collection("campaigns")
      .doc(campaignDocId(requested, id))
      .get();
    if (keyed.exists) return toCampaign(keyed.data()!);
  }
  // Legacy un-keyed doc — only valid as the active period's data.
  const doc = await tenantDoc(tenant).collection("campaigns").doc(id).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (requested && !belongsToPeriod(data.period as string | undefined, active, requested)) {
    return null;
  }
  return toCampaign(data);
}

export async function getSyncMeta(tenant: string): Promise<SyncMeta | null> {
  const doc = await tenantDoc(tenant).get();
  const r = doc.data();
  if (!r?.syncedAt) return null;
  return {
    source: r.source,
    period: r.period as CampaignPeriod,
    syncedAt: r.syncedAt,
    degraded: Boolean(r.degraded),
    degradedReason: r.degradedReason ?? null,
    ...(r.syncedByPeriod && typeof r.syncedByPeriod === "object"
      ? { syncedByPeriod: r.syncedByPeriod as Record<string, string> }
      : {}),
  };
}

/** Flip the tenant's ACTIVE period to `period` — the cheap half of a period
 *  switch, valid only when that period's stored state is warm (it has a
 *  `syncedByPeriod` entry). Returns the updated meta, or null when there is no
 *  stored sync for the period (caller falls back to a real connector sync).
 *  `syncedAt` is set to the period's own last sync so "synchronizováno před…"
 *  reflects the age of the data actually on screen. The active pointer is what
 *  the gate-locked analyze route reads, so evaluations follow the page. */
export async function setActivePeriod(
  tenant: string,
  period: CampaignPeriod
): Promise<SyncMeta | null> {
  const meta = await getSyncMeta(tenant);
  const syncedAt = meta?.syncedByPeriod?.[period];
  if (!meta || !syncedAt) return null;
  if (meta.period !== period || meta.syncedAt !== syncedAt) {
    await tenantDoc(tenant).set({ period, syncedAt }, { merge: true });
  }
  return { ...meta, period, syncedAt };
}

// --- daily series (trend chart) ---------------------------------------------

/** Replace the tenant's stored daily series *for one period* — one small doc
 *  per period (`series/{period}`; the legacy single doc was `series/latest`). */
export async function saveSeries(
  tenant: string,
  series: DailyPoint[],
  meta: { period: CampaignPeriod }
): Promise<void> {
  await tenantDoc(tenant)
    .collection("series")
    .doc(seriesDocId(meta.period))
    .set({ period: meta.period, series, syncedAt: new Date().toISOString() });
}

/** The tenant's daily series for `period` (defaults to the active period),
 *  oldest → newest, or []. Falls back to the legacy `latest` doc when it holds
 *  exactly the requested period (it always recorded its period). */
export async function getSeries(tenant: string, period?: CampaignPeriod): Promise<DailyPoint[]> {
  const col = tenantDoc(tenant).collection("series");
  const requested = period ?? (await activePeriod(tenant));
  if (requested) {
    const keyed = await col.doc(seriesDocId(requested)).get();
    const data = keyed.data();
    if (Array.isArray(data?.series)) return data!.series as DailyPoint[];
  }
  const legacy = await col.doc("latest").get();
  const data = legacy.data();
  if (!Array.isArray(data?.series)) return [];
  return !requested || data!.period === requested ? (data!.series as DailyPoint[]) : [];
}

/** Replace the tenant's stored per-campaign daily series (campaign id → points).
 *  One doc (`series/campaigns`): even 90 days × a handful of campaigns is a few
 *  tens of KB, far under the document limit. Overwritten only on a successful
 *  fetch — the sync pipeline applies the same only-overwrite-on-success rule as
 *  the portfolio series, so a transient hiccup can't blank the sparklines. */
export async function saveCampaignSeries(
  tenant: string,
  byId: Record<string, DailyPoint[]>,
  meta: { period: CampaignPeriod }
): Promise<void> {
  await tenantDoc(tenant)
    .collection("series")
    .doc(campaignSeriesDocId(meta.period))
    .set({ period: meta.period, byId, syncedAt: new Date().toISOString() });
}

/** The stored per-campaign daily series for `period` (defaults to the active
 *  period), or {}. Falls back to the legacy un-keyed `campaigns` doc when it
 *  holds exactly the requested period. */
export async function getCampaignSeries(
  tenant: string,
  period?: CampaignPeriod
): Promise<Record<string, DailyPoint[]>> {
  const col = tenantDoc(tenant).collection("series");
  const requested = period ?? (await activePeriod(tenant));
  if (requested) {
    const keyed = await col.doc(campaignSeriesDocId(requested)).get();
    const byId = keyed.data()?.byId;
    if (byId && typeof byId === "object") return byId as Record<string, DailyPoint[]>;
  }
  const legacy = await col.doc("campaigns").get();
  const data = legacy.data();
  const byId = data?.byId;
  if (!byId || typeof byId !== "object") return {};
  return !requested || data!.period === requested ? (byId as Record<string, DailyPoint[]>) : {};
}

// --- reports ----------------------------------------------------------------

interface ReportDoc {
  scope: string;
  campaign_id: string | null;
  period: string;
  model: string;
  demo: boolean;
  payload: CampaignReportResult;
  prompt: string;
  took_ms: number;
  created_at: string;
  input_hash?: string | null;
}

function toReport(r: ReportDoc): CampaignReport {
  return {
    scope: r.scope as EvalScope,
    campaignId: r.campaign_id,
    period: r.period,
    result: r.payload,
    meta: { model: r.model, demo: Boolean(r.demo), prompt: r.prompt, tookMs: Number(r.took_ms) },
    createdAt: r.created_at,
  };
}

function toHistoryPoint(r: ReportDoc): ReportHistoryPoint {
  return {
    score: r.payload.score,
    verdict: r.payload.verdict,
    period: r.period,
    demo: Boolean(r.demo),
    createdAt: r.created_at,
  };
}

/** All of a tenant's reports, oldest → newest. */
async function allReports(tenant: string): Promise<ReportDoc[]> {
  const snap = await tenantDoc(tenant).collection("reports").orderBy("created_at", "asc").get();
  return snap.docs.map((d) => d.data() as ReportDoc);
}

const reportKey = (r: ReportDoc): string =>
  r.scope === "overall" ? "overall" : r.campaign_id ?? "overall";

/** A score falling by at least this many points between two consecutive stored
 *  evaluations of the same scope raises a critical inbox alert — the report
 *  history stops being write-only and becomes proactive monitoring. */
export const SCORE_DROP_ALERT_POINTS = 15;

export async function saveReport(
  tenant: string,
  args: {
    scope: EvalScope;
    campaignId: string | null;
    period: CampaignPeriod;
    response: AiResponse<CampaignReportResult>;
    inputHash?: string;
  }
): Promise<CampaignReport> {
  const { scope, campaignId, period, response, inputHash } = args;
  const createdAt = new Date().toISOString();
  const doc: ReportDoc = {
    scope,
    campaign_id: campaignId,
    period,
    model: response.meta.model,
    demo: response.meta.demo,
    payload: response.result,
    prompt: response.meta.prompt,
    took_ms: response.meta.tookMs,
    created_at: createdAt,
    input_hash: inputHash ?? null,
  };

  // Previous point of this scope's history (same filter getReportHistory uses),
  // read before the new report lands so the regression check has its baseline.
  // Best-effort: a failed read only skips the alert, never the save.
  let previous: ReportDoc | null = null;
  try {
    const history = (await allReports(tenant)).filter(
      (r) => r.scope === scope && (r.campaign_id ?? "") === (campaignId ?? "")
    );
    previous = history[history.length - 1] ?? null;
  } catch {
    previous = null;
  }

  await tenantDoc(tenant).collection("reports").add(doc);

  // Proactive monitoring on the write seam (the gate-locked analyze route needs
  // no edit): a timeline entry per evaluation — AI spend becomes auditable —
  // plus a critical inbox alert on a significant score collapse. Demo-mode
  // reports carry canned scores, so a demo report neither raises nor baselines
  // the regression alert. Both wrapped so logging can never fail the evaluation.
  try {
    const scopeLabel = scope === "overall" ? "celé portfolio" : `kampaň ${campaignId}`;
    await recordActivity(tenant, {
      kind: "report",
      title: `AI vyhodnocení · skóre ${response.result.score}`,
      detail: `${scopeLabel} · období ${period} · ${response.result.verdict}`,
    });

    const drop = previous ? previous.payload.score - response.result.score : 0;
    if (previous && !previous.demo && !response.meta.demo && drop >= SCORE_DROP_ALERT_POINTS) {
      await recordAlert(tenant, {
        type: "critical",
        title: `AI skóre kleslo o ${drop} bodů (${previous.payload.score} → ${response.result.score})`,
        body: `${scopeLabel} · ${response.result.verdict}`,
        items: [
          {
            campaignId: campaignId ?? "overall",
            name: scopeLabel,
            reason: `Skóre kleslo z ${previous.payload.score} na ${response.result.score} mezi dvěma vyhodnoceními (práh ${SCORE_DROP_ALERT_POINTS} b.).`,
          },
        ],
      });
    }
  } catch (err) {
    console.error(`[campaigns] report activity/alert failed for ${tenant} (non-fatal):`, err);
  }

  return { scope, campaignId, period, result: response.result, meta: response.meta, createdAt };
}

/** Latest report per (scope, campaign) for a period. */
export async function getReportsForPeriod(
  tenant: string,
  period: CampaignPeriod
): Promise<Record<string, CampaignReport>> {
  return (await getReportsForPeriodWithHashes(tenant, period)).reports;
}

/** Latest report per key for a period PLUS each report's stored input hash, so
 *  the GET state can compare it against the current `hashEvalInputs` and flag
 *  reports whose underlying data changed after they were generated (`toReport`
 *  deliberately drops the hash from the client payload). Reports saved before
 *  input hashing existed carry `null`. */
export async function getReportsForPeriodWithHashes(
  tenant: string,
  period: CampaignPeriod
): Promise<{ reports: Record<string, CampaignReport>; inputHashes: Record<string, string | null> }> {
  const reports: Record<string, CampaignReport> = {};
  const inputHashes: Record<string, string | null> = {};
  // asc order → last write for a key wins = the latest report.
  for (const r of await allReports(tenant)) {
    if (r.period !== period) continue;
    const key = reportKey(r);
    reports[key] = toReport(r);
    inputHashes[key] = r.input_hash ?? null;
  }
  return { reports, inputHashes };
}

/** Deterministic fingerprint of the exact inputs an evaluation depends on.
 *  `changesCurrent` (ChangesSummary.current — the diff's sync marker) is folded
 *  in when supplied: the prompts now embed the sync-over-sync diff, so a cached
 *  report must be invalidated when the diff moves even if the campaign tuples
 *  happen to match. Omitted/null keeps the legacy hash byte-identical. */
export function hashEvalInputs(
  scope: EvalScope,
  campaignId: string | null,
  period: CampaignPeriod,
  campaigns: Campaign[],
  changesCurrent?: string | null
): string {
  const inScope =
    scope === "campaign"
      ? campaigns.filter((c) => c.id === campaignId)
      : [...campaigns].sort((a, b) => a.id.localeCompare(b.id));
  const tuples = inScope.map(
    (c) =>
      `${c.id}:${c.status}:${c.impressions}:${c.clicks}:${c.cost}:${c.conversions}:${c.conversionValue}`
  );
  const changesPart = changesCurrent ? `|chg:${changesCurrent}` : "";
  return createHash("sha1")
    .update(`${scope}|${campaignId ?? ""}|${period}|${tuples.join(";")}${changesPart}`)
    .digest("hex");
}

/** The newest stored report matching the input fingerprint, or null. */
export async function findCachedReport(
  tenant: string,
  scope: EvalScope,
  campaignId: string | null,
  period: CampaignPeriod,
  inputHash: string
): Promise<CampaignReport | null> {
  const matches = (await allReports(tenant)).filter(
    (r) =>
      r.scope === scope &&
      (r.campaign_id ?? "") === (campaignId ?? "") &&
      r.period === period &&
      r.input_hash === inputHash
  );
  return matches.length ? toReport(matches[matches.length - 1]!) : null;
}

export async function getReportHistory(
  tenant: string,
  scope: EvalScope,
  campaignId: string | null
): Promise<ReportHistoryPoint[]> {
  return (await allReports(tenant))
    .filter((r) => r.scope === scope && (r.campaign_id ?? "") === (campaignId ?? ""))
    .map(toHistoryPoint);
}

export async function getReportHistories(
  tenant: string
): Promise<Record<string, ReportHistoryPoint[]>> {
  const out: Record<string, ReportHistoryPoint[]> = {};
  for (const r of await allReports(tenant)) {
    (out[reportKey(r)] ??= []).push(toHistoryPoint(r));
  }
  return out;
}

// --- sync-over-sync change diff ---------------------------------------------

interface SnapshotEntry {
  campaignId: string;
  status: string;
  cost: number;
  conversions: number;
  conversion_value?: number;
  conversionValue?: number;
}

/** Rule-based triage over the last `limit` stored sync snapshots, oldest →
 *  newest. Every sync appends a full snapshot but only the newest two were ever
 *  read (the change diff) — this turns the write-only history into a
 *  deterministic portfolio-health timeline: one triaged point per sync, free,
 *  with no AI evaluation required. */
export async function listSnapshotSummaries(
  tenant: string,
  limit = 12,
  period?: CampaignPeriod
): Promise<SnapshotSummaryPoint[]> {
  const active = await activePeriod(tenant);
  const requested = period ?? active;
  // Over-fetch, then filter to the requested period: with per-period storage
  // snapshots of different windows interleave, and a health timeline must not
  // read a 7-day column next to a 90-day one as a "recovery".
  const snap = await tenantDoc(tenant)
    .collection("snapshots")
    .orderBy("syncedAt", "desc")
    .limit(limit * 4)
    .get();
  return snap.docs
    .map((d) => d.data())
    .filter(
      (data) =>
        !requested || belongsToPeriod(data.period as string | undefined, active, requested)
    )
    .slice(0, limit)
    .map((data) => ({
      syncedAt: data.syncedAt as string,
      summary: summarizeSnapshotEntries(
        ((data.campaigns ?? []) as SnapshotEntry[]).map((e) => ({
          status: e.status,
          cost: Number(e.cost) || 0,
          conversions: Number(e.conversions) || 0,
          // Legacy snapshots stored snake_case conversion_value.
          conversionValue: Number(e.conversionValue ?? e.conversion_value ?? 0),
        }))
      ),
    }))
    .reverse();
}

export async function getLatestChanges(
  tenant: string,
  period?: CampaignPeriod
): Promise<ChangesSummary | null> {
  const active = await activePeriod(tenant);
  const requested = period ?? active;
  // Diff the two newest snapshots OF THE SAME PERIOD — comparing a 7-day
  // window against a 30-day one would report the window change as campaign
  // movement. Over-fetch and filter (legacy un-keyed snapshots count as the
  // active period's).
  const snap = await tenantDoc(tenant)
    .collection("snapshots")
    .orderBy("syncedAt", "desc")
    .limit(20)
    .get();
  const docs = snap.docs
    .map((d) => d.data())
    .filter(
      (data) =>
        !requested || belongsToPeriod(data.period as string | undefined, active, requested)
    )
    .slice(0, 2);
  if (docs.length < 2) return null;

  const current = docs[0]!.syncedAt as string;
  const since = docs[1]!.syncedAt as string;

  const toMap = (entries: SnapshotEntry[]) =>
    new Map(entries.map((e) => [e.campaignId, e]));
  const curMap = toMap((docs[0]!.campaigns ?? []) as SnapshotEntry[]);
  const prevMap = toMap((docs[1]!.campaigns ?? []) as SnapshotEntry[]);
  const names = new Map((await listCampaigns(tenant, requested ?? undefined)).map((c) => [c.id, c.name]));

  const valueOf = (e: SnapshotEntry) => e.conversionValue ?? e.conversion_value ?? 0;
  const roas = (cost: number, value: number) => (cost > 0 ? value / cost : 0);
  const rel = (a: number, b: number) => (b > 0 ? (a - b) / b : a > 0 ? 1 : 0);

  let added = 0;
  let removed = 0;
  let changed = 0;
  const items: CampaignChange[] = [];

  for (const [id, c] of curMap) {
    const p = prevMap.get(id);
    const name = names.get(id) ?? id;
    if (!p) {
      added++;
      items.push({
        campaignId: id, name, kind: "added",
        costBefore: 0, costAfter: c.cost, costDelta: 1, valueDelta: 1,
        roasBefore: 0, roasAfter: roas(c.cost, valueOf(c)),
      });
      continue;
    }
    const costDelta = rel(c.cost, p.cost);
    const valueDelta = rel(valueOf(c), valueOf(p));
    if (Math.abs(costDelta) >= 0.05 || Math.abs(valueDelta) >= 0.05 || c.status !== p.status) {
      changed++;
      items.push({
        campaignId: id, name, kind: "changed",
        costBefore: p.cost, costAfter: c.cost, costDelta, valueDelta,
        roasBefore: roas(p.cost, valueOf(p)), roasAfter: roas(c.cost, valueOf(c)),
      });
    }
  }
  for (const [id, p] of prevMap) {
    if (curMap.has(id)) continue;
    removed++;
    items.push({
      campaignId: id, name: names.get(id) ?? id, kind: "removed",
      costBefore: p.cost, costAfter: 0, costDelta: -1, valueDelta: -1,
      roasBefore: roas(p.cost, valueOf(p)), roasAfter: 0,
    });
  }

  items.sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta) || b.costAfter - a.costAfter);
  return { since, current, added, removed, changed, items: items.slice(0, 6) };
}
