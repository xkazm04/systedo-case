/** BYOM key store — FIRESTORE backend (`byomConfigs/{userId}`). Server-only; the
 *  dispatcher imports it lazily so the LOCAL_DB path never pulls firebase-admin in.
 *  One doc per user (active vendor + per-vendor ENCRYPTED keys); mirrors the local
 *  backend's interface. */
import { firestore } from "@/lib/firebase";
import { BYOM_VENDORS, type ByomVendor, type StoredByomConfig, type StoredByomKey } from "./types";

function byomDoc(userId: string) {
  return firestore.collection("byomConfigs").doc(userId);
}

function toStored(d: FirebaseFirestore.DocumentData): StoredByomConfig {
  const rawKeys = d.keys && typeof d.keys === "object" ? d.keys : {};
  const keys: StoredByomConfig["keys"] = {};
  for (const vendor of BYOM_VENDORS) {
    const k = rawKeys[vendor];
    if (k && typeof k === "object" && typeof k.keyEnc === "string") {
      keys[vendor] = k as StoredByomKey;
    }
  }
  const activeVendor =
    typeof d.activeVendor === "string" && (BYOM_VENDORS as readonly string[]).includes(d.activeVendor)
      ? (d.activeVendor as ByomVendor)
      : undefined;
  return { ...(activeVendor ? { activeVendor } : {}), keys };
}

/** Firestore rejects nested `undefined` — drop undefined fields from each key. */
function clean(cfg: StoredByomConfig): Record<string, unknown> {
  const keys: Record<string, unknown> = {};
  for (const [vendor, k] of Object.entries(cfg.keys)) {
    if (!k) continue;
    keys[vendor] = Object.fromEntries(Object.entries(k).filter(([, v]) => v !== undefined));
  }
  const out: Record<string, unknown> = { keys };
  if (cfg.activeVendor) out.activeVendor = cfg.activeVendor;
  return out;
}

export async function getByomConfig(userId: string): Promise<StoredByomConfig> {
  const doc = await byomDoc(userId).get();
  return doc.exists ? toStored(doc.data()!) : { keys: {} };
}

export async function saveByomConfig(userId: string, cfg: StoredByomConfig): Promise<void> {
  await byomDoc(userId).set(clean(cfg));
}

export async function deleteByomConfig(userId: string): Promise<void> {
  await byomDoc(userId).delete();
}
