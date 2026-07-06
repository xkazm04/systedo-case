/** Per-user BYOM key store — backend dispatcher (local node:sqlite when LOCAL_DB,
 *  else Firestore) plus the high-level operations the settings API and the LLM
 *  wrapper use. Persists which provider keys a user has connected (ENCRYPTED) and
 *  which vendor is active, so switching provider needs no re-entry of the key. The
 *  decrypted key never leaves the server except through `resolveActiveByomKey`
 *  (the call-time seam). Server-only. */
import { LOCAL_DB } from "@/lib/local-mode";
import { decryptByomKey, encryptByomKey, hasByomCrypto } from "./crypto";
import {
  publicByomConfig,
  type ByomVendor,
  type PublicByomConfig,
  type ResolvedByomKey,
  type StoredByomConfig,
} from "./types";

export * from "./types";
export { hasByomCrypto } from "./crypto";

function backend() {
  return LOCAL_DB ? import("./store.local") : import("./store.firestore");
}

async function get(userId: string): Promise<StoredByomConfig> {
  return (await backend()).getByomConfig(userId);
}

async function save(userId: string, cfg: StoredByomConfig): Promise<void> {
  return (await backend()).saveByomConfig(userId, cfg);
}

/** The client-safe view of a user's BYOM config (no key bytes). */
export async function getPublicByomConfig(userId: string): Promise<PublicByomConfig> {
  return publicByomConfig(await get(userId));
}

/** Store (or replace) a vendor's key. Encrypts at rest; throws when encryption
 *  isn't configured (fail-safe — never a plaintext key). Adding the first key
 *  makes that vendor active by default. Preserves the vendor's chosen models on
 *  a re-key, and clears any stale validation error (the key just changed). */
export async function putByomKey(userId: string, vendor: ByomVendor, plaintextKey: string): Promise<void> {
  if (!hasByomCrypto()) {
    throw new Error("BYOM key encryption is not configured (set BYOM_KEY_SECRET or AUTH_SECRET).");
  }
  const cfg = await get(userId);
  const existing = cfg.keys[vendor];
  cfg.keys[vendor] = {
    keyEnc: encryptByomKey(plaintextKey),
    ...(existing?.model ? { model: existing.model } : {}),
    ...(existing?.fastModel ? { fastModel: existing.fastModel } : {}),
    addedAt: existing?.addedAt ?? new Date().toISOString(),
  };
  if (!cfg.activeVendor) cfg.activeVendor = vendor;
  await save(userId, cfg);
}

/** Update a vendor's chosen model tags without re-entering the key. */
export async function setByomKeyModels(
  userId: string,
  vendor: ByomVendor,
  models: { model?: string | null; fastModel?: string | null }
): Promise<void> {
  const cfg = await get(userId);
  const k = cfg.keys[vendor];
  if (!k) throw new Error(`No BYOM key stored for vendor "${vendor}".`);
  if (models.model !== undefined) {
    if (models.model) k.model = models.model;
    else delete k.model;
  }
  if (models.fastModel !== undefined) {
    if (models.fastModel) k.fastModel = models.fastModel;
    else delete k.fastModel;
  }
  await save(userId, cfg);
}

/** Switch the active vendor. `null` disables BYOM (generation uses the app's own
 *  providers). A non-null vendor must already have a stored key. */
export async function setActiveByomVendor(userId: string, vendor: ByomVendor | null): Promise<void> {
  const cfg = await get(userId);
  if (vendor === null) {
    delete cfg.activeVendor;
  } else {
    if (!cfg.keys[vendor]) throw new Error(`No BYOM key stored for vendor "${vendor}".`);
    cfg.activeVendor = vendor;
  }
  await save(userId, cfg);
}

/** Remove a vendor's key. If it was the active vendor, active falls back to any
 *  remaining configured vendor (else BYOM is disabled). */
export async function deleteByomKey(userId: string, vendor: ByomVendor): Promise<void> {
  const cfg = await get(userId);
  if (!cfg.keys[vendor]) return;
  delete cfg.keys[vendor];
  if (cfg.activeVendor === vendor) {
    const remaining = Object.keys(cfg.keys)[0] as ByomVendor | undefined;
    if (remaining) cfg.activeVendor = remaining;
    else delete cfg.activeVendor;
  }
  await save(userId, cfg);
}

/** Record the outcome of a "test connection" for a vendor's key. */
export async function markByomValidation(
  userId: string,
  vendor: ByomVendor,
  result: { ok: boolean; error?: string }
): Promise<void> {
  const cfg = await get(userId);
  const k = cfg.keys[vendor];
  if (!k) return;
  const now = new Date().toISOString();
  if (result.ok) {
    k.lastValidatedAt = now;
    delete k.lastError;
    delete k.lastErrorAt;
  } else {
    k.lastError = result.error ?? "Validace se nezdařila.";
    k.lastErrorAt = now;
  }
  await save(userId, cfg);
}

/** Decrypt the active vendor's key for a call. Returns null when BYOM isn't set
 *  up (no active vendor / no key) or the blob can't be decrypted (missing or
 *  rotated secret). The ONLY path plaintext leaves the store — server-only, never
 *  serialized to a client. Callers gate this on the user's plan entitlement. */
export async function resolveActiveByomKey(userId: string): Promise<ResolvedByomKey | null> {
  const cfg = await get(userId);
  const vendor = cfg.activeVendor;
  if (!vendor) return null;
  const k = cfg.keys[vendor];
  if (!k) return null;
  const apiKey = decryptByomKey(k.keyEnc);
  if (!apiKey) return null;
  return {
    vendor,
    apiKey,
    ...(k.model ? { model: k.model } : {}),
    ...(k.fastModel ? { fastModel: k.fastModel } : {}),
  };
}
