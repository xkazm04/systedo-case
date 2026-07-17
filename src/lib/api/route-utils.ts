/** Route-scaffolding kit for the project & workspace API handlers
 *  (`src/app/api/projects/**`). Small, dependency-light helpers that used to be
 *  copy-pasted per route: a safe JSON-body parse, wire-value → string coercion, and
 *  the bare `{ error }` 4xx response builders. Pure and framework-agnostic (no
 *  session/db reads), so it is safe to import from unit tests as well as handlers.
 *
 *  ── New-route recipe ──────────────────────────────────────────────────────────
 *    export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
 *      const { id } = await params;
 *      const g = await requireOwnedProject(id);        // ownership (see api-guard.ts)
 *      if ("error" in g) return g.error;
 *      const { uid } = g;
 *
 *      const body = await readJson<{ name?: unknown }>(req);   // null on malformed JSON
 *      const name = trimmedString(body?.name);                // "" when absent/non-string
 *      if (!name) return badRequest("Zadejte název.");        // 400 → malformed/absent input
 *      // …validate the shape; a well-formed body that fails semantic validation →
 *      //   return unprocessable("…");                        // 422 → body-validation failure
 *      …
 *    }
 *
 *  ── Status convention (see also api-guard.ts) ─────────────────────────────────
 *    400  malformed / missing / unparseable input (bad JSON, missing required id/name)
 *    422  a well-formed body that fails semantic validation (a sanitiser rejects it)
 *    401 / 404  authentication / ownership — produced by requireOwnedProject
 *
 *  ── Envelope note ─────────────────────────────────────────────────────────────
 *    These builders emit the bare `{ error }` envelope used by the projects-root,
 *    catalog, duplicate, warehouse and state routes. Routes that answer with the
 *    `{ ok: false, error }` envelope keep their inline literals for now — unifying
 *    the two envelopes is a separate, later direction, so do NOT force this builder
 *    onto an `{ ok }` route (it would change the response body). Both envelopes may
 *    now ALSO carry a stable machine `code` (see the code catalog below).
 *
 *  ── Machine `code` catalog (Direction: "errors clients can act on") ────────────
 *    Every projects sub-resource error now carries a stable, locale-independent
 *    `code` ALONGSIDE the human `error` string. The `code` is the contract a client
 *    branches on; `error` is a human-readable fallback the client MAY show but should
 *    NOT parse. This is the pattern onboarding pioneered (POST returns
 *    `{ ok:false, code, error }`) and the campaigns client mirrors (CampaignError =
 *    `{ key } | { text }`): the CLIENT maps the `code` to its OWN localized copy, so
 *    the surface is bilingual WITHOUT server-side i18n. THIS is the precedent for new
 *    routes — emit a code, never rely on the server string for control flow.
 *
 *    Convention: kebab-case, matching the already-shipped guard codes
 *    ("unauthorized" / "not-found") and onboarding's "invalid-scan" (NOT snake_case).
 *    Adding `code` is ADDITIVE — the `error` field and every existing shape are kept,
 *    so a client that ignores `code` is unaffected.
 *
 *    Provider passthroughs (a raw upstream error string leaking to the client) are
 *    replaced by a coded CATEGORY + a generic localized message; the raw text is
 *    server-logged only (see {@link providerError}). Never hand a provider's raw
 *    error string to a client — it is not localized, may leak internals, and is not
 *    a stable contract. */
import { PROJECT_TYPES, type ProjectType } from "@/lib/projects/types";
import { rateLimit, tooManyRequests, type RateRule } from "@/lib/ai/rate-limit";
import { envInt } from "@/lib/env";

/** The stable machine `code` values a projects sub-resource error may carry. Grouped
 *  by origin; kebab-case; every value MUST be unique (a unit test pins that). Extend
 *  here — a route should not invent an ad-hoc code string inline. */
export const API_ERROR_CODES = [
  // --- auth / ownership (emitted by requireOwnedProject) ---------------------
  "unauthorized", // 401 — not signed in
  "not-found", // 404 — not the caller's project / resource absent
  // --- generic request-shape failures (the 4xx builders' defaults) -----------
  "bad-request", // 400 — malformed / missing / unparseable input
  "unprocessable", // 422 — well-formed body that fails semantic validation
  "conflict", // 409 — a state precondition is not met
  "rate-limited", // 429 — per-user rate cap hit
  // --- input-validation specifics --------------------------------------------
  "missing-field", // a required field is absent/empty
  "invalid-type", // an enum/type field is not one of the allowed values
  "invalid-date", // an unparseable date/time
  "invalid-scan", // onboarding: the scan profile failed sanitisation
  "empty-content", // content below the minimum length
  "content-too-long", // content over the platform/field limit
  "not-approved", // an action requires an approved precondition (twin send)
  // --- provider / upstream categories (raw message server-logged only) -------
  "provider-error", // upstream returned an error (502)
  "provider-auth", // upstream rejected the credentials (502)
  "provider-timeout", // upstream did not answer in time (504)
  "provider-unavailable", // provider recognised but not yet implemented (501)
  "provider-unknown", // provider id is not recognised (400)
  "provider-no-token", // provider requires a token that is absent (400)
  "token-undecryptable", // a token IS stored but can't be decrypted (server secret changed) (422)
  "provider-no-config", // provider requires endpoint/mapping config that is absent (400)
  "provider-empty", // provider answered but returned nothing usable (422)
  "server-misconfigured", // a required server secret/config is missing (501)
] as const;

/** A stable machine error code — see {@link API_ERROR_CODES}. */
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Parse a JSON request body, returning `null` on any malformed/absent/unparseable
 *  body. Replaces the `await req.json().catch(() => null)` idiom repeated per route. */
export async function readJson<T = unknown>(req: Request): Promise<T | null> {
  return (await req.json().catch(() => null)) as T | null;
}

/** Coerce an unknown wire value to a string: the value when it is a string, else `""`.
 *  (No trimming — mirrors `typeof v === "string" ? v : ""`.) */
export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Like {@link asString} but trims (mirrors `typeof v === "string" ? v.trim() : ""`). */
export function trimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Type guard: is `v` one of the known {@link ProjectType} values? Deduped from the
 *  copies that lived in both the projects-root and `[id]` route handlers. */
export function isProjectType(v: unknown): v is ProjectType {
  return typeof v === "string" && (PROJECT_TYPES as readonly string[]).includes(v);
}

// --- branding-input validators -------------------------------------------------
// Project accentColor/logoUrl flow into PUBLIC client-facing surfaces (the
// tokenized share report bakes them into its payload), so they are validated at
// the write boundary like every other project payload — a downstream renderer is
// then safe by construction against CSS injection ("red;} body{display:none") and
// javascript:/data: logo URLs.

/** A safe CSS accent: a #hex color (3-8 hex digits — #rgb…#rrggbbaa). */
export function isSafeAccentColor(v: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(v);
}

/** A safe, embeddable asset URL: parses as an absolute http(s) URL — everything
 *  else (javascript:, data:, relative, garbage) is rejected. */
export function isSafeHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Build a coded error Response for either envelope. Codes are ADDITIVE: when `code`
 *  is omitted the body is the historical `{ error }` / `{ ok:false, error }`, so
 *  callers that never pass a code are byte-for-byte unchanged. */
export function apiError(
  status: number,
  error: string,
  code?: ApiErrorCode,
  opts: { envelope?: "bare" | "ok" } = {}
): Response {
  const ok = opts.envelope === "ok";
  const body = ok
    ? code
      ? { ok: false, code, error }
      : { ok: false, error }
    : code
      ? { error, code }
      : { error };
  return Response.json(body, { status });
}

/** 400 Bad Request — bare `{ error }` (+ optional machine `code`). Malformed /
 *  missing / unparseable input. */
export function badRequest(error: string, code?: ApiErrorCode): Response {
  return apiError(400, error, code);
}

/** 404 Not Found — bare `{ error }` (+ optional machine `code`). */
export function notFound(error: string, code?: ApiErrorCode): Response {
  return apiError(404, error, code);
}

/** 422 Unprocessable Entity — bare `{ error }` (+ optional machine `code`). A
 *  well-formed body that fails semantic validation. */
export function unprocessable(error: string, code?: ApiErrorCode): Response {
  return apiError(422, error, code);
}

/** 409 Conflict — a state precondition is not met (+ optional machine `code`). */
export function conflict(error: string, code: ApiErrorCode = "conflict", opts: { envelope?: "bare" | "ok" } = {}): Response {
  return apiError(409, error, code, opts);
}

/** A provider / upstream failure, mapped to a coded CATEGORY with a GENERIC localized
 *  public message — never the provider's raw error string. The raw text (when given)
 *  is server-logged only, so operators keep the detail while clients get a stable,
 *  localized, non-leaky contract.
 *
 *    provider-error   → 502   upstream returned an error
 *    provider-auth    → 502   upstream rejected the credentials
 *    provider-timeout → 504   upstream did not answer in time
 *
 *  `message` MUST already be localized (the route owns its language convention). */
export function providerError(opts: {
  category: "provider-error" | "provider-auth" | "provider-timeout";
  message: string;
  /** Raw upstream detail — server-logged only, NEVER sent to the client. */
  raw?: unknown;
  /** A short log context tag, e.g. `catalog-sync baselinker`. */
  context: string;
  /** Override the category's default status. */
  status?: number;
  envelope?: "bare" | "ok";
}): Response {
  if (opts.raw !== undefined) {
    const detail = opts.raw instanceof Error ? opts.raw.message : opts.raw;
    console.error(`[provider] ${opts.context}:`, detail);
  }
  const status = opts.status ?? (opts.category === "provider-timeout" ? 504 : 502);
  return apiError(status, opts.message, opts.category, { envelope: opts.envelope });
}

// --- per-user rate limiting for the expensive workspace write routes ----------
//
// Mirrors catalog/rate-limit's enforceCatalogRate posture (a per-user fixed window
// over the shared sqlite limiter) but for the workspace routes that live OUTSIDE the
// catalog module and each make an outbound / paid / loopable call: the leads +
// local-signals feed imports (outbound fetchFeed), the metrics sync (live Google Ads
// API), and the twin send (external channel connector). Keyed by user id — these are
// authed, so a per-IP key would be both wrong (one office IP → shared budget) and
// weaker (a signed-in user is already identified).

const RATE_WINDOW_MS = 60_000;

/** Per-user, per-minute caps, built lazily so env overrides are read at call time.
 *  Defaults mirror the catalog limiter's shape: an import/parse is tightest, a pure
 *  connector send is loosest, a provider round-trip sits between. */
export const WORKSPACE_RATE = {
  /** Lead-export import — outbound fetchFeed of a hosted CSV + a full parse. */
  leadsImport: (): RateRule => ({ bucket: "leads:import", limit: envInt("LEADS_IMPORT_PER_MIN", 8), windowMs: RATE_WINDOW_MS }),
  /** Local-signals import — same outbound-fetch + parse shape (ranks/reviews/gbp). */
  localSignalsImport: (): RateRule => ({ bucket: "local-signals:import", limit: envInt("LOCAL_SIGNALS_IMPORT_PER_MIN", 8), windowMs: RATE_WINDOW_MS }),
  /** Metrics sync — a live Google Ads API round-trip, loopable straight from the UI. */
  metricsSync: (): RateRule => ({ bucket: "metrics:sync", limit: envInt("METRICS_SYNC_PER_MIN", 12), windowMs: RATE_WINDOW_MS }),
  /** Twin send — an external channel-connector delivery (cheaper, so loosest). */
  twinSend: (): RateRule => ({ bucket: "twin:send", limit: envInt("TWIN_SEND_PER_MIN", 20), windowMs: RATE_WINDOW_MS }),
};

/** Enforce a per-user rate rule (keyed by user id — same posture as catalog's
 *  enforceCatalogRate, generalised for the routes outside the catalog module).
 *  Returns a ready 429 (with `Retry-After`, matching the app-wide 429 pattern) when
 *  over the limit, else null so the caller proceeds. */
export function enforceUserRate(userId: string, rule: RateRule, message: string): Response | null {
  const result = rateLimit(`user:${userId}`, [rule]);
  if (!result.ok) return tooManyRequests(result.retryAfter, message);
  return null;
}
