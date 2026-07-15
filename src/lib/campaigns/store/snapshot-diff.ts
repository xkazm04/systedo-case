/** Pure sync-over-sync change diff over two stored snapshots — framework-free so
 *  the exact diff semantics are unit-testable without Firestore. Extracted from
 *  store/snapshots.getLatestChanges unchanged (byte-identical outputs), with ONE
 *  deliberate seam: campaign names now ride ON the snapshot entries (written at
 *  sync time) instead of a second full listCampaigns scan — the caller no longer
 *  re-reads the whole campaign collection just to label the diff. Legacy snapshots
 *  that predate the embedded name fall back to the campaign id, exactly as the old
 *  `names.get(id) ?? id` did when a name was missing. */
import { roas, ctr, cpc } from "@/lib/metrics/ratios";
import type { CampaignChange, ChangesSummary } from "../types";

/** One campaign's row inside a stored sync snapshot. */
export interface SnapshotEntry {
  campaignId: string;
  /** the campaign name at sync time — rides on the snapshot so the diff needs no
   *  second campaign read. Optional: legacy snapshots omit it (→ id fallback). */
  name?: string;
  status: string;
  cost: number;
  conversions: number;
  conversion_value?: number;
  conversionValue?: number;
  /** widened spine (optional — legacy snapshots omit these) */
  clicks?: number;
  impressions?: number;
  budgetPerDay?: number;
}

/** A stored snapshot document: when it was taken + its per-campaign entries. */
export interface SnapshotDoc {
  syncedAt: string;
  campaigns?: SnapshotEntry[];
}

/**
 * Diff two snapshots (older `prev` → newer `cur`) into the client-safe
 * ChangesSummary. Pure: given the same two docs it returns the same summary, so
 * the change-diff semantics are pinned by unit tests without touching Firestore.
 *
 * Names are read off the entries themselves (cur first, then prev, then the id) —
 * the one behavioural refinement vs the old code, which re-read every campaign to
 * label the diff. Everything else (thresholds, ordering, the ≤6 cap, the optional
 * CTR/CPC spine) is carried over exactly.
 */
export function diffSnapshots(prev: SnapshotDoc, cur: SnapshotDoc): ChangesSummary {
  const current = cur.syncedAt;
  const since = prev.syncedAt;

  const toMap = (entries: SnapshotEntry[]) => new Map(entries.map((e) => [e.campaignId, e]));
  const curMap = toMap((cur.campaigns ?? []) as SnapshotEntry[]);
  const prevMap = toMap((prev.campaigns ?? []) as SnapshotEntry[]);
  // Name for a campaign id — the sync-time name off whichever side has it, then id.
  const nameOf = (id: string) => curMap.get(id)?.name ?? prevMap.get(id)?.name ?? id;

  const valueOf = (e: SnapshotEntry) => e.conversionValue ?? e.conversion_value ?? 0;
  const rel = (a: number, b: number) => (b > 0 ? (a - b) / b : a > 0 ? 1 : 0);

  const hasSpine = (e: SnapshotEntry) =>
    typeof e.clicks === "number" && typeof e.impressions === "number";
  const ctrOf = (e: SnapshotEntry): number | null =>
    hasSpine(e) && e.impressions! > 0 ? ctr(e.clicks!, e.impressions!) : null;
  const cpcOf = (e: SnapshotEntry): number | null =>
    typeof e.clicks === "number" && e.clicks > 0 ? cpc(e.cost, e.clicks) : null;
  const ratioFields = (
    prevE: SnapshotEntry | null,
    curE: SnapshotEntry | null
  ): Pick<CampaignChange, "ctrBefore" | "ctrAfter" | "cpcBefore" | "cpcAfter"> | undefined => {
    if (!(prevE && hasSpine(prevE)) && !(curE && hasSpine(curE))) return undefined;
    return {
      ctrBefore: prevE ? ctrOf(prevE) : null,
      ctrAfter: curE ? ctrOf(curE) : null,
      cpcBefore: prevE ? cpcOf(prevE) : null,
      cpcAfter: curE ? cpcOf(curE) : null,
    };
  };

  let added = 0;
  let removed = 0;
  let changed = 0;
  const items: CampaignChange[] = [];

  for (const [id, c] of curMap) {
    const p = prevMap.get(id);
    const name = nameOf(id);
    if (!p) {
      added++;
      items.push({
        campaignId: id, name, kind: "added",
        costBefore: 0, costAfter: c.cost, costDelta: 1, valueDelta: 1,
        roasBefore: 0, roasAfter: roas(valueOf(c), c.cost),
        ...ratioFields(null, c),
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
        ...ratioFields(p, c),
      });
    }
  }
  for (const [id, p] of prevMap) {
    if (curMap.has(id)) continue;
    removed++;
    items.push({
      campaignId: id, name: nameOf(id), kind: "removed",
      costBefore: p.cost, costAfter: 0, costDelta: -1, valueDelta: -1,
      roasBefore: roas(valueOf(p), p.cost), roasAfter: 0,
      ...ratioFields(p, null),
    });
  }

  items.sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta) || b.costAfter - a.costAfter);
  return { since, current, added, removed, changed, items: items.slice(0, 6) };
}
