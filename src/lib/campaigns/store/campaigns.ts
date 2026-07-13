/** Campaign CRUD for the per-tenant Firestore store (server-only). Owns the
 *  synced campaign set per period, sync metadata on the tenant root doc, and the
 *  active-period pointer. */
import "server-only";
import { firestore } from "@/lib/firebase";
import { tenantDoc, activePeriod } from "./tenant";
import { belongsToPeriod, campaignDocId } from "../store-keys";
import type { Campaign, CampaignPeriod } from "../types";

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
    /** append this sync to the change-diff snapshot history. Default true; pass
     *  false for a degraded (sample-fallback) sync so getLatestChanges never
     *  diffs sample campaigns against the prior live snapshot (which would show
     *  every real campaign as removed + every sample one as added). */
    appendSnapshot?: boolean;
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
  // 7-day window against a 90-day one. Skipped for a degraded sample-fallback
  // sync so the diff history stays live-only.
  if (meta.appendSnapshot !== false) {
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
  }

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
