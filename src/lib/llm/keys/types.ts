/** BYOM (bring-your-own-model) key types — the shared contract between the
 *  encrypted key store, the settings API and the client UI. Framework-free and
 *  secret-free at the type level: the `Stored*` shapes hold the encrypted key
 *  blob (server-only), the `Public*` shapes are what ever reaches the client
 *  (a `hasKey` boolean + metadata, never a byte of the key). */

/** The text-LLM vendors a user can bring a key for. "anthropic" is the Claude
 *  HTTP API (distinct from the local Claude Code CLI provider, which needs no
 *  key). More may be resolved later. */
export const BYOM_VENDORS = ["openai", "anthropic", "gemini"] as const;
export type ByomVendor = (typeof BYOM_VENDORS)[number];

export function isByomVendor(v: unknown): v is ByomVendor {
  return typeof v === "string" && (BYOM_VENDORS as readonly string[]).includes(v);
}

/** Czech vendor labels for the settings UI (kept here so the client and server
 *  agree on the display name without importing each other's runtime). */
export const BYOM_VENDOR_LABELS: Record<ByomVendor, string> = {
  openai: "OpenAI",
  anthropic: "Claude (Anthropic)",
  gemini: "Google Gemini",
};

/** One vendor's stored key. `keyEnc` is the AES-GCM blob from ./crypto — never
 *  the plaintext. `model`/`fastModel` are the user's chosen model tags (the
 *  vendor default is used when absent). Validation health mirrors the warehouse
 *  connection store so the UI can show "last checked OK" / "last error". */
export interface StoredByomKey {
  keyEnc: string;
  /** chosen model for the quality tier (vendor default when absent) */
  model?: string;
  /** optional fast-tier model override */
  fastModel?: string;
  addedAt: string;
  /** last successful "test connection" (a failure leaves this untouched) */
  lastValidatedAt?: string;
  /** last validation failure message; cleared on the next success */
  lastError?: string;
  lastErrorAt?: string;
}

/** A user's full BYOM configuration (server-only — holds the encrypted keys).
 *  `activeVendor` is the vendor generation uses right now; it must have a key. */
export interface StoredByomConfig {
  activeVendor?: ByomVendor;
  keys: Partial<Record<ByomVendor, StoredByomKey>>;
}

/** Client-safe view of one vendor's key — no secret bytes. */
export interface PublicByomKey {
  vendor: ByomVendor;
  hasKey: true;
  model?: string;
  fastModel?: string;
  addedAt: string;
  lastValidatedAt?: string;
  lastError?: string;
}

export interface PublicByomConfig {
  /** the vendor currently selected for generation (only when it has a key) */
  activeVendor?: ByomVendor;
  /** one entry per configured vendor */
  keys: PublicByomKey[];
}

/** Strip every secret from a stored config for the client. `activeVendor` is only
 *  surfaced when it still resolves to a stored key. */
export function publicByomConfig(c: StoredByomConfig): PublicByomConfig {
  const keys: PublicByomKey[] = [];
  for (const vendor of BYOM_VENDORS) {
    const k = c.keys[vendor];
    if (!k) continue;
    keys.push({
      vendor,
      hasKey: true,
      ...(k.model ? { model: k.model } : {}),
      ...(k.fastModel ? { fastModel: k.fastModel } : {}),
      addedAt: k.addedAt,
      ...(k.lastValidatedAt ? { lastValidatedAt: k.lastValidatedAt } : {}),
      ...(k.lastError ? { lastError: k.lastError } : {}),
    });
  }
  const activeVendor = c.activeVendor && c.keys[c.activeVendor] ? c.activeVendor : undefined;
  return { ...(activeVendor ? { activeVendor } : {}), keys };
}

/** A decrypted, ready-to-use key — server-only, never serialized to a client. */
export interface ResolvedByomKey {
  vendor: ByomVendor;
  apiKey: string;
  model?: string;
  fastModel?: string;
}
