/** BYOM (bring-your-own-model) key types — the shared contract between the
 *  encrypted key store, the settings API and the client UI. Framework-free and
 *  secret-free at the type level: the `Stored*` shapes hold the encrypted key
 *  blob (server-only), the `Public*` shapes are what ever reaches the client
 *  (a `hasKey` boolean + metadata, never a byte of the key). */
import type { SupportedLocale } from "@/lib/format";

/** The text-LLM vendors a user can bring a key for. "anthropic" is the Claude
 *  HTTP API (distinct from the local Claude Code CLI provider, which needs no
 *  key). "qwen" is Qwen Cloud (DashScope-intl compatible mode — Qwen family +
 *  hosted third-party models by slug). "ollama" is a local/on-box Ollama server;
 *  a stock install authenticates nothing, so its "key" is a placeholder (any
 *  non-empty value) and the endpoint comes from OLLAMA_BASE_URL. */
export const BYOM_VENDORS = ["openai", "anthropic", "gemini", "openrouter", "qwen", "ollama"] as const;
export type ByomVendor = (typeof BYOM_VENDORS)[number];

export function isByomVendor(v: unknown): v is ByomVendor {
  return typeof v === "string" && (BYOM_VENDORS as readonly string[]).includes(v);
}

/** Vendor labels for the settings UI (kept here so the client and server agree on
 *  the display name without importing each other's runtime). The vendor NAMES are
 *  do-not-translate product names — only the parenthetical qualifier on `ollama`
 *  (a local/on-box server, not a hosted API) is copy, so the two columns are
 *  identical apart from that one word. */
export const BYOM_VENDOR_LABELS: Record<SupportedLocale, Record<ByomVendor, string>> = {
  cs: {
    openai: "OpenAI",
    anthropic: "Claude (Anthropic)",
    gemini: "Google Gemini",
    openrouter: "OpenRouter",
    qwen: "Qwen Cloud",
    ollama: "Ollama (lokální)",
  },
  en: {
    openai: "OpenAI",
    anthropic: "Claude (Anthropic)",
    gemini: "Google Gemini",
    openrouter: "OpenRouter",
    qwen: "Qwen Cloud",
    ollama: "Ollama (local)",
  },
};

/** The vendor display name for the reader's locale. */
export function byomVendorLabel(v: ByomVendor, locale: SupportedLocale): string {
  return (BYOM_VENDOR_LABELS[locale] ?? BYOM_VENDOR_LABELS.en)[v];
}

// ── Reasoning + model catalog (the BYOM matrix) ──────────────────────────────

/** Reasoning depth exposed in the matrix. Mapped to each provider's own
 *  mechanism server-side (see llm/byom/reasoning.ts): "default" omits the param
 *  (model default), "off" disables/minimizes, low/medium/high set the effort. */
export const REASONING_LEVELS = ["default", "off", "low", "medium", "high"] as const;
export type ReasoningLevel = (typeof REASONING_LEVELS)[number];

export function isReasoningLevel(v: unknown): v is ReasoningLevel {
  return typeof v === "string" && (REASONING_LEVELS as readonly string[]).includes(v);
}

export const REASONING_LABELS: Record<SupportedLocale, Record<ReasoningLevel, string>> = {
  cs: {
    default: "Výchozí",
    off: "Vypnuto",
    low: "Nízké",
    medium: "Střední",
    high: "Vysoké",
  },
  en: {
    default: "Default",
    off: "Off",
    low: "Low",
    medium: "Medium",
    high: "High",
  },
};

/** The reasoning-depth label for the reader's locale — the matrix's reasoning
 *  column. The KEY is the persisted `ReasoningLevel`; only the label is copy. */
export function reasoningLabel(r: ReasoningLevel, locale: SupportedLocale): string {
  return (REASONING_LABELS[locale] ?? REASONING_LABELS.en)[r];
}

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
  // Qwen Cloud (DashScope-intl compatible mode): the Qwen family plus hosted
  // third-party models under one key. The adapter sends no reasoning params
  // (compatible mode rejects OpenAI's reasoning_effort), so the knob is off.
  qwen: {
    default: "qwen3.8-max",
    models: [
      { id: "qwen3.8-max", noReasoning: true },
      { id: "glm-5.2", noReasoning: true },
      { id: "deepseek-v4-flash-0731", noReasoning: true },
    ],
  },
  // Local Ollama tags. Endpoint via OLLAMA_BASE_URL (default localhost:11434);
  // extendable one line per pulled model.
  ollama: {
    default: "lfm2.5:8b",
    models: [
      { id: "lfm2.5:8b", noReasoning: true },
      { id: "qwen2.5:14b-instruct", noReasoning: true },
    ],
  },
};

/** THE model validator — the single source of truth for "is this a model this
 *  vendor actually offers?". Both the per-operation matrix (POST /api/byom/matrix)
 *  and the vendor-wide model fields (PATCH /api/byom) call this one function, so a
 *  model id can never be accepted by one surface and rejected by the other.
 *
 *  There is deliberately NO free-text escape hatch: an unverifiable model id is
 *  exactly the failure this guards (a typo'd or retired id saves cleanly, the key
 *  keeps its "Verified" pill, and the break only surfaces at the next real
 *  generation). Clearing the field always works and falls back to the vendor
 *  default, so no user is ever blocked from generating; shipping a newly released
 *  model is a one-line addition to BYOM_MODEL_CATALOG above. A value already
 *  persisted before this validation existed is grandfathered by the route (you may
 *  keep what you have, you may not introduce a new unknown). */
export function isByomCatalogModel(vendor: ByomVendor, model: unknown): model is string {
  return typeof model === "string" && BYOM_MODEL_CATALOG[vendor].models.some((m) => m.id === model);
}

/** One per-operation assignment in the matrix. */
export interface ByomOperationOverride {
  vendor: ByomVendor;
  model: string;
  reasoning: ReasoningLevel;
}

/** An LLM operation (wrapper call site) the matrix can assign — one per
 *  `// llm-tool:` id. `label` is Czech (the source-of-truth language), `labelEn`
 *  its English counterpart; the matrix UI picks one through the i18n pipeline
 *  (see BYOM_OPERATION_LABELS). */
export interface ByomOperation {
  id: string;
  label: string;
  labelEn: string;
}

/** Every operation the matrix can assign. This list MUST equal the set of
 *  `// llm-tool:` ids in src (= the LLM gate registry), modulo the documented
 *  exclusions in test-llm/callsites.mjs (BYOM_OPERATION_EXCLUSIONS — empty today).
 *  The LLM gate enforces it, so a new tool cannot ship without a matrix row: an
 *  operation missing here cannot be pinned at all and silently rides the global
 *  activeVendor fallback. Keep the `{ id: "…" }` shape on one line — the gate
 *  reads these ids statically. */
export const BYOM_OPERATIONS: ByomOperation[] = [
  { id: "ads", label: "PPC inzeráty", labelEn: "Search ads" },
  { id: "brief", label: "SEO brief", labelEn: "SEO brief" },
  { id: "analysis", label: "Výkonnostní analýza", labelEn: "Performance analysis" },
  { id: "chat", label: "Report chat", labelEn: "Report chat" },
  { id: "campaign-eval", label: "Vyhodnocení kampaní", labelEn: "Campaign evaluation" },
  { id: "social", label: "Sociální příspěvky", labelEn: "Social posts" },
  { id: "twin-reply", label: "Odpověď twinu", labelEn: "Twin reply" },
  { id: "twin-style", label: "Trénink hlasu (twin)", labelEn: "Voice training (twin)" },
  { id: "repurpose", label: "Distribuce obsahu", labelEn: "Content repurposing" },
  { id: "local-review-reply", label: "Odpověď na recenzi", labelEn: "Review reply" },
  { id: "article-draft", label: "Koncept článku", labelEn: "Article draft" },
  { id: "cohort-diagnosis", label: "Diagnóza kohort (LTV)", labelEn: "Cohort diagnosis (LTV)" },
  { id: "keyword-clusters", label: "Klastry klíčových slov", labelEn: "Keyword clusters" },
  { id: "comparison-outline", label: "Srovnávací stránka", labelEn: "Comparison page outline" },
  { id: "lp-variant-ideas", label: "Nápady na LP varianty", labelEn: "Landing page variant ideas" },
  { id: "lead-source-diagnosis", label: "Diagnóza zdroje leadů", labelEn: "Lead source diagnosis" },
  { id: "local-diagnosis", label: "Lokální diagnóza", labelEn: "Local visibility diagnosis" },
  { id: "ads-diagnosis", label: "Diagnóza výkonu reklam", labelEn: "Ads performance diagnosis" },
  { id: "monthly-recap", label: "Měsíční rekapitulace", labelEn: "Monthly recap" },
  { id: "channel-research", label: "Výzkum bezplatných kanálů", labelEn: "Organic channel research" },
  { id: "onboarding-scan", label: "Úvodní sken webu", labelEn: "Onboarding website scan" },
  { id: "local-page", label: "Lokální stránka", labelEn: "Local landing page" },
  { id: "lp-variant-draft", label: "Návrh LP variant", labelEn: "Landing page variant copy" },
];

/** The operation labels as a colocated {cs, en} translation table, so the matrix
 *  rows go through the same `useT()` pipeline as the rest of the settings UI
 *  instead of hardcoding the Czech label. Derived from BYOM_OPERATIONS, so adding
 *  an operation above is the only edit a new tool needs. */
export const BYOM_OPERATION_LABELS: Record<SupportedLocale, Record<string, string>> = {
  cs: Object.fromEntries(BYOM_OPERATIONS.map((o) => [o.id, o.label])),
  en: Object.fromEntries(BYOM_OPERATIONS.map((o) => [o.id, o.labelEn])),
};

// ── Key health observed during REAL generations ──────────────────────────────

/** One failure of a user's key observed during a real generation (not a manual
 *  probe). Recorded from the signals the BYOM dispatch already produces — no extra
 *  provider call is ever made to learn this.
 *
 *  `definitive` is the load-bearing bit and mirrors `classifyProbeError`'s split:
 *  true only for a `ByomUserError` (bad/expired key, no permission, exhausted
 *  account, a model the vendor won't serve) — the user's to fix, and the only kind
 *  that may stick to the key. Everything else (provider 5xx, throttle, timeout,
 *  transport, unusable output) is INCONCLUSIVE: it is logged so the user can see
 *  which operations fell back to the app's provider and why, but it must never
 *  render as "your key is broken". */
export interface ByomKeyIncident {
  /** ISO timestamp of the failed generation */
  at: string;
  /** the `// llm-tool:` operation id (a BYOM_OPERATIONS entry) */
  toolId: string;
  /** ByomUserErrorCode when `definitive`, else the LlmCallError code ("unknown"
   *  for an unclassified throw). The UI localizes from this, not from `message`. */
  code: string;
  /** APP-AUTHORED copy only — never a provider's raw error text. See
   *  `byomIncidentFor` (keys/health.ts) for how this is chosen: a definitive
   *  incident carries the `ByomUserError` message (built by `classifyByomHttp` from
   *  app constants), a transient one carries this module's own
   *  BYOM_INCIDENT_REASONS copy for the code. It is the fallback the UI renders for
   *  a code with no localized string; `code` is the primary. */
  message: string;
  /** true ⇒ a user fault that also stamps `lastError`; false ⇒ transient/inconclusive */
  definitive: boolean;
  /** OPERATOR-ONLY crumb from the underlying error: the ONE field that can derive
   *  from provider-controlled text, so it is sanitized on the way in (key-shaped
   *  runs redacted, hard-capped at BYOM_INCIDENT_DETAIL_CHARS) and STRIPPED by
   *  `publicByomConfig` — it never crosses the wire and nothing user-visible
   *  depends on it. Absent when the error carried nothing beyond its code. */
  detail?: string;
}

/** The client-safe view of an incident: everything except the operator-only
 *  `detail`. Splitting the shape (rather than trusting a sanitizer) is what makes
 *  "no provider-controlled text reaches the client" a type-level guarantee. */
export type PublicByomIncident = Omit<ByomKeyIncident, "detail">;

/** How many incidents we keep per vendor key. A short ring: enough to show a
 *  pattern ("three operations failed with `auth` in the last hour") without
 *  turning the config doc into an unbounded log. */
export const BYOM_INCIDENT_LIMIT = 5;

/** Hard cap on an incident's operator-only `detail`. Deliberately tiny: the
 *  adapters build their transient messages as
 *  `Poskytovatel X selhal (HTTP 500). ${body.slice(0, 200)}` — 200 characters of
 *  RAW, provider-controlled response body. That must not be persisted verbatim, so
 *  the crumb we do keep is capped to roughly "enough to recognise the failure in a
 *  support thread" and nothing more. */
export const BYOM_INCIDENT_DETAIL_CHARS = 60;

/** Localized copy for an incident `code`, as a colocated {cs, en} table so the
 *  settings UI renders it through the same `useT()` pipeline as everything else
 *  (the stored `message` is the provider's own Czech display copy — a fallback for
 *  a code with no entry here, never the primary text). Covers both halves of the
 *  split: the ByomUserErrorCode values (definitive) and the LlmErrorCode values
 *  plus "unknown" (transient). */
export const BYOM_INCIDENT_REASONS: Record<SupportedLocale, Record<string, string>> = {
  cs: {
    // definitive — ByomUserErrorCode
    auth: "Klíč je neplatný nebo byl odvolán.",
    permission: "Klíč nemá oprávnění k tomuto modelu.",
    quota: "Účet u poskytovatele nemá kredit nebo vyčerpal limit.",
    model: "Zvolený model není u poskytovatele dostupný.",
    invalid: "Poskytovatel požadavek odmítl.",
    // transient — LlmErrorCode
    timeout: "Poskytovatel neodpověděl včas.",
    empty: "Poskytovatel vrátil prázdnou odpověď.",
    malformed_json: "Odpověď poskytovatele se nepodařilo zpracovat.",
    rate_limited: "Poskytovatel dočasně omezil počet požadavků.",
    server: "Dočasná chyba na straně poskytovatele.",
    network: "Spojení s poskytovatelem selhalo.",
    safety_blocked: "Poskytovatel odpověď zablokoval z bezpečnostních důvodů.",
    aborted: "Požadavek byl přerušen.",
    unknown: "Volání poskytovatele selhalo.",
  },
  en: {
    auth: "The key is invalid or has been revoked.",
    permission: "The key doesn't have permission for this model.",
    quota: "The provider account is out of credit or over its limit.",
    model: "The selected model isn't available from this provider.",
    invalid: "The provider rejected the request.",
    timeout: "The provider did not answer in time.",
    empty: "The provider returned an empty response.",
    malformed_json: "The provider's response could not be parsed.",
    rate_limited: "The provider throttled the request.",
    server: "A temporary provider-side error.",
    network: "The connection to the provider failed.",
    safety_blocked: "The provider blocked the response on safety grounds.",
    aborted: "The request was aborted.",
    unknown: "The provider call failed.",
  },
};

/** One vendor's stored key. `keyEnc` is the AES-GCM blob from ./crypto — never
 *  the plaintext. `model`/`fastModel` are the user's chosen model tags (the
 *  vendor default is used when absent). Validation health mirrors the warehouse
 *  connection store so the UI can show "last checked OK" / "last error". */
export interface StoredByomKey {
  keyEnc: string;
  /** Display fingerprint (last 4 characters), computed at ENCRYPT time by
   *  `byomKeyFingerprint` and stored next to the blob. Absent on keys stored before
   *  fingerprinting shipped — such a key stays unidentified until it is replaced;
   *  it is NEVER backfilled by decrypting on read. */
  keyLast4?: string;
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
  /** newest-first ring of failures seen during REAL generations, capped at
   *  BYOM_INCIDENT_LIMIT. Absent until the key first misbehaves. */
  incidents?: ByomKeyIncident[];
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
  /** The last 4 characters of the stored key, so the user can tell WHICH key is
   *  connected without re-pasting it. The ONLY key-derived value that ever crosses
   *  the wire; absent for keys stored before fingerprinting (the UI says so). */
  keyLast4?: string;
  model?: string;
  fastModel?: string;
  addedAt: string;
  lastValidatedAt?: string;
  lastError?: string;
  /** failures seen during real generations (newest first), minus the operator-only
   *  `detail` — a tool id, a code and app-authored copy, so the settings UI can
   *  explain WHICH operations failed and why without the user pressing "test". */
  incidents?: PublicByomIncident[];
}

export interface PublicByomConfig {
  /** the vendor currently selected for generation (only when it has a key) */
  activeVendor?: ByomVendor;
  /** one entry per configured vendor */
  keys: PublicByomKey[];
  /** the per-operation matrix (toolId → assignment) — no secrets, safe to expose */
  operations?: Record<string, ByomOperationOverride>;
}

/** Drop an incident's operator-only `detail` — the only field that can derive from
 *  provider-controlled text. Explicit field-by-field construction (not a spread +
 *  delete) so a field added to the stored shape has to be opted IN to the wire. */
function publicByomIncident(i: ByomKeyIncident): PublicByomIncident {
  return { at: i.at, toolId: i.toolId, code: i.code, message: i.message, definitive: i.definitive };
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
      // The stored fingerprint is passed through verbatim; it is never derived here
      // (deriving it would mean decrypting the key on every settings read).
      ...(k.keyLast4 ? { keyLast4: k.keyLast4 } : {}),
      ...(k.model ? { model: k.model } : {}),
      ...(k.fastModel ? { fastModel: k.fastModel } : {}),
      addedAt: k.addedAt,
      ...(k.lastValidatedAt ? { lastValidatedAt: k.lastValidatedAt } : {}),
      ...(k.lastError ? { lastError: k.lastError } : {}),
      // Incidents are NOT passed through verbatim. `at`/`toolId`/`code`/`message`
      // are app-authored by construction (see ByomKeyIncident), but `detail` is the
      // one field derived from provider-controlled response text — so it is dropped
      // here, exactly like keyEnc. This is the wire boundary: what the client sees
      // is app copy plus a code, never a third party's bytes.
      ...(k.incidents?.length ? { incidents: k.incidents.map(publicByomIncident) } : {}),
    });
  }
  const activeVendor = c.activeVendor && c.keys[c.activeVendor] ? c.activeVendor : undefined;
  return {
    ...(activeVendor ? { activeVendor } : {}),
    keys,
    ...(c.operations && Object.keys(c.operations).length ? { operations: c.operations } : {}),
  };
}

/** How old a successful validation may be before the UI stops presenting it as a
 *  live "Verified" claim. A BYOM key is revocable at the provider at any time and
 *  `markByomValidation`'s transient guard deliberately preserves an old verdict
 *  through provider blips, so a stamp of unbounded age is evidence of nothing. */
export const BYOM_VALIDATION_STALE_DAYS = 30;

/** Whether a validation stamp is too old to still be shown as a live verdict.
 *  Pure (injectable `now`) so it is testable and identical on both sides. */
export function isByomValidationStale(lastValidatedAt: string | undefined, now: Date = new Date()): boolean {
  if (!lastValidatedAt) return false; // "never validated" is a different state, not stale
  const at = Date.parse(lastValidatedAt);
  if (!Number.isFinite(at)) return true; // unparseable stamp proves nothing
  return now.getTime() - at > BYOM_VALIDATION_STALE_DAYS * 86_400_000;
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
  /** Who this key was resolved FOR, when it was resolved for a real generation
   *  (`enterByomForOperation`). Present only on that path — the "test connection"
   *  probe resolves a bare key with no owner, so the health write-back below stays
   *  off the probe path (which already records its own verdict via
   *  `markByomValidation`). Server-only, like `apiKey`: never serialized. */
  owner?: { userId: string; toolId: string };
}
