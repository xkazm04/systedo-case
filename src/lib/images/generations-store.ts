/** Ledger of Leonardo image generations, so the reaper can find and delete the
 *  ones that leaked (every generation makes N candidates; only the winner is saved,
 *  the rest are never cleaned up). Firestore-backed and single-store, mirroring the
 *  sibling creatives library (store.ts): a generation only exists when Leonardo is
 *  configured (Firebase is too), and the daily reaper cron must read a durable,
 *  cross-instance store — an ephemeral per-instance sqlite twin the reaper never
 *  reads on prod would be cosmetic. Server-only. Best-effort: a ledger write must
 *  never fail the generation it observes. */
import "server-only";
import { firestore } from "@/lib/firebase";
import type { GenerationRecord } from "./reaper-core";

const COLL = "leonardo_generations";
const TTL_DAYS = 30; // storage backstop; the reaper deletes far sooner (grace window)

function col() {
  return firestore.collection(COLL);
}

/** Record a generation the moment it is created, so an unsaved (discarded)
 *  generation is still reapable later. Best-effort — never throws to the caller. */
export async function recordGeneration(generationId: string, createdAt: string): Promise<void> {
  if (!generationId) return;
  try {
    await col().doc(generationId).set({
      generationId,
      createdAt,
      expireAt: new Date(Date.now() + TTL_DAYS * 86_400_000),
    });
  } catch (err) {
    console.error(`[generations] record ${generationId} failed (non-fatal):`, err);
  }
}

/** Every tracked generation (the reaper's work list). */
export async function listGenerations(): Promise<GenerationRecord[]> {
  const snap = await col().get();
  return snap.docs.map((d) => {
    const r = d.data();
    return { generationId: (r.generationId as string) ?? d.id, createdAt: (r.createdAt as string) ?? "" };
  });
}

/** Drop a ledger row once its Leonardo generation has been deleted. */
export async function deleteGenerationRecord(generationId: string): Promise<void> {
  try {
    await col().doc(generationId).delete();
  } catch (err) {
    console.error(`[generations] delete record ${generationId} failed:`, err);
  }
}

/** The set of generationIds referenced by a saved winner across ALL tenants — the
 *  reaper's keep-list (a saved winner's generation must survive for nobg). One
 *  collection-group scan of every tenant's creatives; only the id field is read. */
export async function listReferencedGenerationIds(): Promise<Set<string>> {
  const snap = await firestore.collectionGroup("creatives").get();
  const ids = new Set<string>();
  for (const d of snap.docs) {
    const g = d.data().generationId;
    if (typeof g === "string" && g) ids.add(g);
  }
  return ids;
}
