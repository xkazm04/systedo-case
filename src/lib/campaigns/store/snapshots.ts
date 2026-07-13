/** The sync-snapshot / change-diff engine (server-only): the rule-based health
 *  timeline over stored sync snapshots and the sync-over-sync change diff. */
import "server-only";
import { tenantDoc, activePeriod } from "./tenant";
import { listCampaigns } from "./campaigns";
import { belongsToPeriod } from "../store-keys";
import { summarizeSnapshotEntries, type SnapshotSummaryPoint } from "../triage";
import { roas } from "@/lib/metrics/ratios";
import type { CampaignChange, CampaignPeriod, ChangesSummary } from "../types";

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
        roasBefore: 0, roasAfter: roas(valueOf(c), c.cost),
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
        roasBefore: roas(valueOf(p), p.cost), roasAfter: roas(valueOf(c), c.cost),
      });
    }
  }
  for (const [id, p] of prevMap) {
    if (curMap.has(id)) continue;
    removed++;
    items.push({
      campaignId: id, name: names.get(id) ?? id, kind: "removed",
      costBefore: p.cost, costAfter: 0, costDelta: -1, valueDelta: -1,
      roasBefore: roas(valueOf(p), p.cost), roasAfter: 0,
    });
  }

  items.sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta) || b.costAfter - a.costAfter);
  return { since, current, added, removed, changed, items: items.slice(0, 6) };
}
