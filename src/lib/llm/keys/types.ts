/** BYOM (bring-your-own-model) key types — the shared contract between the
 *  encrypted key store, the settings API and the client UI. Framework-free and
 *  secret-free at the type level: the `Stored*` shapes hold the encrypted key
 *  blob (server-only), the `Public*` shapes are what ever reaches the client
 *  (a `hasKey` boolean + metadata, never a byte of the key). */

/** The text-LLM vendors a user can bring a key for. "anthropic" is the Claude
 *  HTTP API (distinct from the local Claude Code CLI provider, which needs no
 *  key). More may be resolved later. */
export const BYOM_VENDORS = ["openai", "anthropic", "gemini", "openrouter"] as const;
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
  openrouter: "OpenRouter",
};

// ── Reasoning + model catalog (the BYOM matrix) ──────────────────────────────

/** Reasoning depth exposed in the matrix. Mapped to each provider's own
 *  mechanism server-side (see llm/byom/reasoning.ts): "default" omits the param
 *  (model default), "off" disables/minimizes, low/medium/high set the effort. */
export const REASONING_LEVELS = ["default", "off", "low", "medium", "high"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export function isReasoningLevel(v: unknown): v is ReasoningLevel {
  return typeof v === "string" && (REASONING_LEVELS as readonly string[]).includes(v);
}

export const REASONING_LABELS: Record<ReasoningLevel, string> = {
  default: "Výchozí",
  off: "Vypnuto",
  low: "Nízké",
  medium: "Střední",
  high: "Vysoké",
};

/** One selectable model in the matrix. `reasoning` is pre-selected when the model
 *  is picked; `noReasoning` marks a model with no reasoning knob (the reasoning
 *  column is disabled for it — e.g. claude-haiku-4-5). */
export interface ByomModelOption {
  id: string;
  reasoning?: ReasoningLevel;
  noReasoning?: boolean;
}

/** The models the matrix offers, per vendor — the ONLY models it lists (the app's
 *  native Claude-CLI / Gemini defaults are deliberately not selectable). */
export const BYOM_MODEL_CATALOG: Record<ByomVendor, { default: string; models: ByomModelOption[] }> = {
  openai: {
    default: "gpt-5.4-mini",
    models: [{ id: "gpt-5.5" }, { id: "gpt-5.4" }, { id: "gpt-5.4-mini", reasoning: "low" }],
  },
  anthropic: {
    default: "claude-sonnet-5",
    models: [
      { id: "claude-opus-4-8" },
      { id: "claude-sonnet-5", reasoning: "low" },
      { id: "claude-haiku-4-5", noReasoning: true },
    ],
  },
  gemini: {
    default: "gemini-3.5-flash",
    models: [
      { id: "gemini-3.1-pro-preview" },
      { id: "gemini-3.5-flash", reasoning: "low" },
      { id: "gemini-3.1-flash-lite" },
    ],
  },
  openrouter: {
    default: "z-ai/glm-5.2",
    models: [
      { id: "z-ai/glm-5.2", reasoning: "default" },
      { id: "deepseek/deepseek-v4-flash" },
      { id: "xiaomi/mimo-v2.5-pro" },
    ],
  },
};

/** One per-operation assignment in the matrix. */
export interface ByomOperationOverride {
  vendor: ByomVendor;
  model: string;
  reasoning: ReasoningLevel;
}

/** An LLM operation (wrapper call site) the matrix can assign — one per
 *  `// llm-tool:` id. Labels are Czech (the settings UI language). */
export interface ByomOperation {
  id: string;
  label: string;
}
export const BYOM_OPERATIONS: ByomOperation[] = [
  { id: "ads", label: "PPC inzeráty" },
  { id: "brief", label: "SEO brief" },
  { id: "analysis", label: "Výkonnostní analýza" },
  { id: "chat", label: "Report chat" },
  { id: "campaign-eval", label: "Vyhodnocení kampaní" },
  { id: "social", label: "Sociální příspěvky" },
  { id: "twin-reply", label: "Odpověď twinu" },
  { id: "twin-style", label: "Trénink hlasu (twin)" },
  { id: "repurpose", label: "Distribuce obsahu" },
  { id: "local-review-reply", label: "Odpověď na recenzi" },
  { id: "article-draft", label: "Koncept článku" },
  { id: "cohort-diagnosis", label: "Diagnóza kohort (LTV)" },
  { id: "keyword-clusters", label: "Klastry klíčových slov" },
  { id: "comparison-outline", label: "Srovnávací stránka" },
  { id: "lp-variant-ideas", label: "Nápady na LP varianty" },
  { id: "lead-source-diagnosis", label: "Diagnóza zdroje leadů" },
];

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
  /** the per-operation matrix: toolId → {vendor, model, reasoning}. An operation
   *  with no entry falls back to the global active vendor, then app-native. */
  operations?: Record<string, ByomOperationOverride>;
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
  /** the per-operation matrix (toolId → assignment) — no secrets, safe to expose */
  operations?: Record<string, ByomOperationOverride>;
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
  return {
    ...(activeVendor ? { activeVendor } : {}),
    keys,
    ...(c.operations && Object.keys(c.operations).length ? { operations: c.operations } : {}),
  };
}

/** A decrypted, ready-to-use key — server-only, never serialized to a client.
 *  `reasoning` is the resolved reasoning level for this call (from the matrix
 *  override or the model default); the adapter maps it to the provider's param. */
export interface ResolvedByomKey {
  vendor: ByomVendor;
  apiKey: string;
  model?: string;
  fastModel?: string;
  reasoning?: ReasoningLevel;
}
