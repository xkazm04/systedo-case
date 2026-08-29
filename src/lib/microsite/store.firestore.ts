/** The public microsite registry — FIRESTORE backend. One doc per slug at
 *  `microsites/{slug}` holding the whole MicrositeConfig (a global, slug-keyed
 *  registry, NOT a per-tenant subcollection — see the dispatcher's header).
 *  Server-only (firebase-admin is Node-only); imported lazily by the dispatcher so
 *  the LOCAL_DB path never pulls firebase-admin in. Mirrors the local backend's
 *  interface.
 *
 *  This is the code that used to live inline in `src/lib/microsite.ts`; the queries
 *  are unchanged, so an existing registry keeps working byte-for-byte. */
import { firestore } from "@/lib/firebase";
import type { MicrositeConfig } from "./types";

function registry() {
  return firestore.collection("microsites");
}

export async function getBySlug(slug: string): Promise<MicrositeConfig | null> {
  const snap = await registry().doc(slug).get();
  return snap.exists ? (snap.data() as MicrositeConfig) : null;
}

export async function getByTenant(tenant: string): Promise<MicrositeConfig | null> {
  const snap = await registry().where("tenant", "==", tenant).limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as MicrositeConfig);
}

export async function upsert(cfg: MicrositeConfig): Promise<void> {
  await registry().doc(cfg.slug).set(cfg, { merge: true });
}

export async function clearForTenant(tenant: string): Promise<number> {
  const snap = await registry().where("tenant", "==", tenant).get();
  if (snap.empty) return 0;
  const batch = firestore.batch();
  for (const doc of snap.docs) batch.delete(doc.ref);
  await batch.commit();
  return snap.size;
}

export async function setEnabled(slug: string, enabled: boolean): Promise<void> {
  await registry().doc(slug).set({ enabled }, { merge: true });
}
