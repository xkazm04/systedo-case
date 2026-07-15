/** The sync-snapshot / change-diff engine (server-only): the rule-based health
 *  timeline over stored sync snapshots and the sync-over-sync change diff. The
 *  pure diff lives in ./snapshot-diff (unit-tested); this file is the thin
 *  Firestore reader that fetches exactly the window each consumer needs. */
import "server-only";
import { FieldPath } from "firebase-admin/firestore";
import { tenantDoc, activePeriod, legacyPeriod, type TenantRoot } from "./tenant";
import { SNAPSHOT_ID_SEP, snapshotIdRange, isLegacySnapshotId } from "../store-keys";
import { summarizeSnapshotEntries, type SnapshotSummaryPoint } from "../triage";
import { diffSnapshots, type SnapshotDoc, type SnapshotEntry } from "./snapshot-diff";
import { CAMPAIGN_PERIODS, type CampaignPeriod, type ChangesSummary } from "../types";

/** Lexicographic floor of every keyed snapshot id (`{period}__…`). Legacy
 *  bare-ISO ids ("2026-…") sort strictly below it (ISO years start "2", the
 *  smallest keyed prefix is "30d__"), so `documentId < FLOOR` selects exactly the
 *  legacy, un-keyed snapshots — a single-field id range needing no composite index. */
const KEYED_SNAPSHOT_ID_FLOOR = [...CAMPAIGN_PERIODS]
  .map((p) => `${p}${SNAPSHOT_ID_SEP}`)
  .sort()[0]!;

/**
 * The newest `want` snapshots of `requested`, newest → oldest.
 *
 * Steady state is ONE id-range query: period-keyed snapshot ids form a contiguous,
 * document-id-ordered range, so `orderBy(__name__ desc).limit(want)` over that range
 * returns exactly what the caller uses — no more over-fetching limit×4 / 20 rows to
 * filter a period out in code, and no composite index (the query is single-field on
 * the document id).
 *
 * Legacy un-keyed snapshots (bare-ISO id, no `period`) predate every keyed one and
 * belong to the PINNED legacyPeriod (not the live active period — see tenant.legacyPeriod,
 * which fixes the timeline-pollution on a period switch). They are topped up ONLY while
 * that period's keyed history is still shallower than `want` AND it IS the legacy period
 * — a bounded, self-extinguishing backward-compat path that vanishes once `want` keyed
 * snapshots exist.
 */
async function readPeriodSnapshots(
  tenant: string,
  requested: CampaignPeriod,
  legacy: CampaignPeriod | null,
  want: number
): Promise<SnapshotDoc[]> {
  const col = tenantDoc(tenant).collection("snapshots");
  const { gte, lt } = snapshotIdRange(requested);
  const keyed = await col
    .orderBy(FieldPath.documentId(), "desc")
    .where(FieldPath.documentId(), ">=", gte)
    .where(FieldPath.documentId(), "<", lt)
    .limit(want)
    .get();
  const docs = keyed.docs.map((d) => d.data() as SnapshotDoc);

  if (docs.length < want && requested === legacy) {
    const legacy = await col
      .orderBy(FieldPath.documentId(), "desc")
      .where(FieldPath.documentId(), "<", KEYED_SNAPSHOT_ID_FLOOR)
      .limit(want - docs.length)
      .get();
    for (const d of legacy.docs) {
      if (isLegacySnapshotId(d.id)) docs.push(d.data() as SnapshotDoc);
    }
  }
  return docs; // newest → oldest
}

/** Rule-based triage over the last `limit` stored sync snapshots, oldest →
 *  newest. Every sync appends a full snapshot but only the newest two were ever
 *  read (the change diff) — this turns the write-only history into a
 *  deterministic portfolio-health timeline: one triaged point per sync, free,
 *  with no AI evaluation required. */
export async function listSnapshotSummaries(
  tenant: string,
  limit = 12,
  period?: CampaignPeriod,
  root?: TenantRoot
): Promise<SnapshotSummaryPoint[]> {
  const active = await activePeriod(tenant, root);
  const requested = period ?? active;
  if (!requested) return [];
  const docs = await readPeriodSnapshots(tenant, requested, await legacyPeriod(tenant, root), limit);
  return docs
    .map((data) => ({
      syncedAt: data.syncedAt,
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
  period?: CampaignPeriod,
  root?: TenantRoot
): Promise<ChangesSummary | null> {
  const active = await activePeriod(tenant, root);
  const requested = period ?? active;
  if (!requested) return null;
  // The two newest snapshots OF THE SAME PERIOD — comparing a 7-day window against a
  // 30-day one would report the window change as campaign movement. Read exactly two.
  const docs = await readPeriodSnapshots(tenant, requested, await legacyPeriod(tenant, root), 2);
  if (docs.length < 2) return null;
  // Pure diff (names ride on the snapshot entries — no second campaign scan).
  return diffSnapshots(docs[1]!, docs[0]!);
}
