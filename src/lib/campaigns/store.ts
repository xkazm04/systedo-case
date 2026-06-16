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
import { createHash } from "node:crypto";
import { firestore } from "@/lib/firebase";
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
} from "./types";

export interface SyncMeta {
  source: string;
  period: CampaignPeriod;
  syncedAt: string;
}

function tenantDoc(tenant: string) {
  return firestore.collection("tenants").doc(tenant);
}

// --- campaigns --------------------------------------------------------------

/** Replace the tenant's campaign set with a freshly-synced one, append a snapshot
 *  of it, and record the sync metadata — all in one atomic batch. */
export async function upsertCampaigns(
  tenant: string,
  campaigns: Campaign[],
  meta: { source: string; period: CampaignPeriod }
): Promise<void> {
  const t = tenantDoc(tenant);
  const syncedAt = new Date().toISOString();
  const batch = firestore.batch();

  // Clear current campaigns, then write the new set with a stable position.
  const existing = await t.collection("campaigns").get();
  existing.forEach((d) => batch.delete(d.ref));
  campaigns.forEach((c, i) => batch.set(t.collection("campaigns").doc(c.id), { ...c, position: i }));

  // Append-only snapshot of this sync (one doc per sync) for change diffing.
  batch.set(t.collection("snapshots").doc(syncedAt), {
    syncedAt,
    campaigns: campaigns.map((c) => ({
      campaignId: c.id,
      status: c.status,
      cost: c.cost,
      conversions: c.conversions,
      conversionValue: c.conversionValue,
    })),
  });

  // Sync metadata on the tenant root doc.
  batch.set(t, { source: meta.source, period: meta.period, syncedAt }, { merge: true });

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
  };
}

export async function listCampaigns(tenant: string): Promise<Campaign[]> {
  const snap = await tenantDoc(tenant).collection("campaigns").orderBy("position", "asc").get();
  return snap.docs.map((d) => toCampaign(d.data()));
}

export async function getCampaign(tenant: string, id: string): Promise<Campaign | null> {
  const doc = await tenantDoc(tenant).collection("campaigns").doc(id).get();
  return doc.exists ? toCampaign(doc.data()!) : null;
}

export async function getSyncMeta(tenant: string): Promise<SyncMeta | null> {
  const doc = await tenantDoc(tenant).get();
  const r = doc.data();
  if (!r?.syncedAt) return null;
  return { source: r.source, period: r.period as CampaignPeriod, syncedAt: r.syncedAt };
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
  await tenantDoc(tenant).collection("reports").add(doc);
  return { scope, campaignId, period, result: response.result, meta: response.meta, createdAt };
}

/** Latest report per (scope, campaign) for a period. */
export async function getReportsForPeriod(
  tenant: string,
  period: CampaignPeriod
): Promise<Record<string, CampaignReport>> {
  const out: Record<string, CampaignReport> = {};
  // asc order → last write for a key wins = the latest report.
  for (const r of await allReports(tenant)) {
    if (r.period === period) out[reportKey(r)] = toReport(r);
  }
  return out;
}

/** Deterministic fingerprint of the exact inputs an evaluation depends on. */
export function hashEvalInputs(
  scope: EvalScope,
  campaignId: string | null,
  period: CampaignPeriod,
  campaigns: Campaign[]
): string {
  const inScope =
    scope === "campaign"
      ? campaigns.filter((c) => c.id === campaignId)
      : [...campaigns].sort((a, b) => a.id.localeCompare(b.id));
  const tuples = inScope.map(
    (c) =>
      `${c.id}:${c.status}:${c.impressions}:${c.clicks}:${c.cost}:${c.conversions}:${c.conversionValue}`
  );
  return createHash("sha1")
    .update(`${scope}|${campaignId ?? ""}|${period}|${tuples.join(";")}`)
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

export async function getLatestChanges(tenant: string): Promise<ChangesSummary | null> {
  const snap = await tenantDoc(tenant)
    .collection("snapshots")
    .orderBy("syncedAt", "desc")
    .limit(2)
    .get();
  if (snap.size < 2) return null;

  const docs = snap.docs.map((d) => d.data());
  const current = docs[0]!.syncedAt as string;
  const since = docs[1]!.syncedAt as string;

  const toMap = (entries: SnapshotEntry[]) =>
    new Map(entries.map((e) => [e.campaignId, e]));
  const curMap = toMap((docs[0]!.campaigns ?? []) as SnapshotEntry[]);
  const prevMap = toMap((docs[1]!.campaigns ?? []) as SnapshotEntry[]);
  const names = new Map((await listCampaigns(tenant)).map((c) => [c.id, c.name]));

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
