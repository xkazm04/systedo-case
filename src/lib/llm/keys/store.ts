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
  type ByomOperationOverride,
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

/** Atomic read-modify-write: `fn` mutates the config synchronously inside a backend
 *  transaction, so concurrent BYOM mutations can't lost-update the shared doc. Every
 *  mutating op below routes through this instead of get()→mutate→save(). */
async function mutate(
  userId: string,
  fn: (cfg: StoredByomConfig) => StoredByomConfig
): Promise<StoredByomConfig> {
  return (await backend()).mutateByomConfig(userId, fn);
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
  // Encrypt OUTSIDE the transaction: the mutator may run more than once on write
  // contention, and encryption uses a random IV (a fresh blob each call).
  const keyEnc = encryptByomKey(plaintextKey);
  await mutate(userId, (cfg) => {
    const existing = cfg.keys[vendor];
    cfg.keys[vendor] = {
      keyEnc,
      ...(existing?.model ? { model: existing.model } : {}),
      ...(existing?.fastModel ? { fastModel: existing.fastModel } : {}),
      addedAt: existing?.addedAt ?? new Date().toISOString(),
    };
    if (!cfg.activeVendor) cfg.activeVendor = vendor;
    return cfg;
  });
}

/** Update a vendor's chosen model tags without re-entering the key. */
export async function setByomKeyModels(
  userId: string,
  vendor: ByomVendor,
  models: { model?: string | null; fastModel?: string | null }
): Promise<void> {
  await mutate(userId, (cfg) => {
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
    return cfg;
  });
}

/** Switch the active vendor. `null` disables BYOM (generation uses the app's own
 *  providers). A non-null vendor must already have a stored key. */
export async function setActiveByomVendor(userId: string, vendor: ByomVendor | null): Promise<void> {
  await mutate(userId, (cfg) => {
    if (vendor === null) {
      delete cfg.activeVendor;
    } else {
      if (!cfg.keys[vendor]) throw new Error(`No BYOM key stored for vendor "${vendor}".`);
      cfg.activeVendor = vendor;
    }
    return cfg;
  });
}

/** Remove a vendor's key. If it was the active vendor, active falls back to any
 *  remaining configured vendor (else BYOM is disabled). Also prunes any operation-
 *  matrix entries pointing at the removed vendor, so a stale override can't silently
 *  reroute a tool (or revive when the vendor is re-added). */
export async function deleteByomKey(userId: string, vendor: ByomVendor): Promise<void> {
  await mutate(userId, (cfg) => {
    if (!cfg.keys[vendor]) return cfg;
    delete cfg.keys[vendor];
    if (cfg.activeVendor === vendor) {
      const remaining = Object.keys(cfg.keys)[0] as ByomVendor | undefined;
      if (remaining) cfg.activeVendor = remaining;
      else delete cfg.activeVendor;
    }
    if (cfg.operations) {
      const next = Object.fromEntries(
        Object.entries(cfg.operations).filter(([, op]) => op.vendor !== vendor)
      );
      if (Object.keys(next).length) cfg.operations = next;
      else delete cfg.operations;
    }
    return cfg;
  });
}

/** Record the outcome of a "test connection" for a vendor's key. */
export async function markByomValidation(
  userId: string,
  vendor: ByomVendor,
  result: { ok: boolean; error?: string }
): Promise<void> {
  await mutate(userId, (cfg) => {
    const k = cfg.keys[vendor];
    if (!k) return cfg;
    const now = new Date().toISOString();
    if (result.ok) {
      k.lastValidatedAt = now;
      delete k.lastError;
      delete k.lastErrorAt;
    } else {
      k.lastError = result.error ?? "Validace se nezdařila.";
      k.lastErrorAt = now;
    }
    return cfg;
  });
}

/** A stored key whose LATEST validation attempt failed (a probe error newer than the
 *  last success, or a key that was never validated-ok but carries an error). The
 *  generation resolve paths skip such keys so an auto-activated first key that fails
 *  its test falls back to the app's providers instead of routing every call through a
 *  key known to be broken. The "test connection" path (resolveByomKey) does NOT use
 *  this — it must decrypt the key precisely to re-test it. */
function latestValidationFailed(k: StoredByomConfig["keys"][ByomVendor]): boolean {
  if (!k?.lastError) return false;
  return !k.lastValidatedAt || (k.lastErrorAt ?? "") > k.lastValidatedAt;
}

/** Decrypt one vendor's key from an already-loaded config. The only place
 *  plaintext is produced — server-only, never serialized to a client. */
function resolveFromConfig(cfg: StoredByomConfig, vendor: ByomVendor): ResolvedByomKey | null {
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

/** Decrypt the ACTIVE vendor's key for a generation. Returns null when BYOM isn't
 *  set up (no active vendor / no key) or the blob can't be decrypted (missing or
 *  rotated secret). Callers gate this on the user's plan entitlement. */
export async function resolveActiveByomKey(userId: string): Promise<ResolvedByomKey | null> {
  const cfg = await get(userId);
  if (!cfg.activeVendor) return null;
  // Skip a key whose latest validation failed → generation falls back to the app's
  // own providers rather than dispatching through a key known to be broken.
  if (latestValidationFailed(cfg.keys[cfg.activeVendor])) return null;
  return resolveFromConfig(cfg, cfg.activeVendor);
}

/** Decrypt a SPECIFIC vendor's key regardless of which is active — the "test
 *  connection" flow re-validates a vendor that may not be the active one. */
export async function resolveByomKey(userId: string, vendor: ByomVendor): Promise<ResolvedByomKey | null> {
  return resolveFromConfig(await get(userId), vendor);
}

/** Resolve the effective BYOM key for one OPERATION: the matrix override for that
 *  toolId (its vendor + model + reasoning) when set and its vendor has a key, else
 *  the global active vendor (with default reasoning). Null when BYOM isn't set up. */
export async function resolveByomForOperation(userId: string, toolId: string): Promise<ResolvedByomKey | null> {
  const cfg = await get(userId);
  const op = cfg.operations?.[toolId];
  if (op) {
    const k = cfg.keys[op.vendor];
    if (k && !latestValidationFailed(k)) {
      const apiKey = decryptByomKey(k.keyEnc);
      if (apiKey) {
        return {
          vendor: op.vendor,
          apiKey,
          ...(op.model ? { model: op.model } : {}),
          reasoning: op.reasoning,
        };
      }
    }
  }
  if (!cfg.activeVendor) return null;
  if (latestValidationFailed(cfg.keys[cfg.activeVendor])) return null;
  return resolveFromConfig(cfg, cfg.activeVendor);
}

/** Assign an operation to a vendor + model + reasoning in the matrix. The vendor
 *  must already have a stored key. */
export async function setByomOperation(
  userId: string,
  toolId: string,
  override: ByomOperationOverride
): Promise<void> {
  await mutate(userId, (cfg) => {
    if (!cfg.keys[override.vendor]) throw new Error(`No BYOM key stored for vendor "${override.vendor}".`);
    cfg.operations = { ...(cfg.operations ?? {}), [toolId]: override };
    return cfg;
  });
}

/** Remove an operation's matrix override (it falls back to the global active vendor). */
export async function clearByomOperation(userId: string, toolId: string): Promise<void> {
  await mutate(userId, (cfg) => {
    if (!cfg.operations?.[toolId]) return cfg;
    const next = { ...cfg.operations };
    delete next[toolId];
    cfg.operations = next;
    return cfg;
  });
}
