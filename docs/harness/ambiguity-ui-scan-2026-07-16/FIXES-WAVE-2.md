# Wave 2 — Tenant isolation, auth & secrets (8 High findings)

Branch: `vibeman/ambiguity-ui-2026-07-16` · Date: 2026-07-16
All 8 targeted High findings fixed. Verification: `npx tsc --noEmit` clean, full
`npm run test:unit` **1557/1557 pass** (baseline 1549, +8 net new tests, 0 regressions).

## Commits

| # | Finding | Commit | Fix |
|---|---------|--------|-----|
| 1 | article-publishing-pipeline #1 | `8450063` fix(microsite) | `enableMicrosite` enforces slug shape (`/^[a-z0-9-]{3,40}$/`, pure `isValidMicrositeSlug`), reserves the demo slug, and refuses to overwrite a doc owned by another tenant (typed `MicrositeSlugError` → route 422/409) |
| 2 | ai-generation-studio-telemetry #1 | `a749cb1` fix(images) | Generation records every candidate `leonardoImageId` in a per-tenant allowlist (`tenants/{tenant}/leoImages`); `/api/images/nobg` now requires sign-in (401), resolves the tenant via the sibling routes' `resolveTenant` seam, and 404s ids the tenant never generated (fail-closed; LOCAL_DB dev unaffected) |
| 3 | auth-byom-entitlements #1 | `a8cfeba` fix(byom) | `BYOM_MATRIX=true` bypass moved into pure `devByomUnlockActive()` hard-gated on `NODE_ENV !== "production"` (LOCAL_DB/DEV_AUTH posture); documented on `requireByomUser` |
| 4 | ai-abuse-guards #1 | `21a4a7f` fix(ai) | `clientIp()` trusts `x-real-ip`/`x-vercel-forwarded-for` only when `VERCEL` is set or the operator sets **new env `TRUSTED_PROXY=true|1`**; otherwise the spoof-resistant right-to-left XFF path decides. Fail-safe default: untrusted |
| 5 | byom-keys-adapters #1 | `0f712f4` fix(byom) | Gemini adapter sends the user's key in the `x-goog-api-key` header instead of the `?key=` URL query param (no other behavior change) |
| 6 | campaign-ops-api #1 | `4e1c918` fix(campaigns) | POST connect verifies the id against `listAccessibleCustomers` when `adsConfigured()` (422 not accessible / 403 no token / 502 check failed), derives the name server-side via `getAccountName`, caps the client fallback name at 80 chars |
| 7 | project-tenant-api #3 | `e17451d` fix(projects) | PATCH rejects (422) non-empty `accentColor` not matching `#hex{3,8}` and non-empty `logoUrl` that is not an absolute http(s) URL — new pure `isSafeAccentColor` / `isSafeHttpUrl` in route-utils; empty string still clears |
| 8 | cron-jobs #3 | `49fe664` fix(cron) | App-wide "AI provoz" telemetry removed from every tenant's digest email and from the tenant alert body's demo-rate hint; it remains in the once-per-run operator webhook + cron-run record |

## Behavior changes / new env vars needing sign-off

- **NEW env var `TRUSTED_PROXY`** (finding 4): off-Vercel deployments now IGNORE
  `x-real-ip` / `x-vercel-forwarded-for` unless `TRUSTED_PROXY=true` (or `1`) is set.
  Set it ONLY when a proxy in front of the app verifiably strips/overwrites those
  headers. Vercel deploys (env `VERCEL` present) are unchanged. Fail-safe default:
  header untrusted → per-IP caps key on the trusted-hops XFF path (or the shared
  "unknown" bucket).
- **`BYOM_MATRIX=true` no longer unlocks BYOM in production** (finding 3): the dev
  flag is dead under `NODE_ENV=production`. Any real deployment that (intentionally)
  relied on it to grant BYOM to all users must instead put users on the byom plan.
  Dev/test behavior unchanged. Fail-safe default: bypass off.
- **`/api/images/nobg` requires sign-in** (finding 2): anonymous callers now get 401
  (previously they got real paid Leonardo ops with only per-IP metering). Signed-in
  users can only nobg images their own tenant generated; ids generated BEFORE this
  deploy are not in the allowlist and will 404 (ids are session-scoped in the UI, so
  impact is a redeploy-window edge only).
- **Project PATCH branding is validated** (finding 7): previously-accepted non-hex
  accents (e.g. `teal`, `rgb(...)`) and non-http(s) logo URLs now 422. Empty string
  still clears a field. The UI already sends hex + http(s) values.
- **Tenant digest emails lost the "AI provoz" section** (finding 8): app-wide AI
  telemetry (and the "AI běží převážně v ukázkovém režimu" hint) is operator-only
  now (webhook + cron-run record).
- **Google Ads connect is verified** (finding 6): with a developer token configured,
  connecting an account the user's Google login cannot access now 422s instead of
  silently flipping the tenant to a phantom account. Without `adsConfigured()` the
  prior behavior is kept (nothing to verify against), with the name capped at 80.
- **Microsite slugs now must match `[a-z0-9-]{3,40}`** (finding 1): a client name
  that slugifies to fewer than 3 chars now 422s ("Z názvu nelze vytvořit URL.") —
  previously it silently published a 1-2 char slug.

## New tests (+8 net)

- `test-unit/byom-entitlement.test.mjs` (new): plan gate + production kill of `BYOM_MATRIX`.
- `test-unit/rate-limit.test.mjs`: trusted-proxy on/off matrix for `clientIp` (forged
  `x-real-ip` ignored by default; honored under `TRUSTED_PROXY`/`VERCEL`).
- `test-unit/microsite-identity.test.mjs`: `isValidMicrositeSlug` accept/reject table.
- `test-unit/route-utils.test.mjs`: `isSafeAccentColor` / `isSafeHttpUrl` incl. the
  CSS-injection and `javascript:`/`data:` shapes from the finding.
- `test-unit/byom-adapters.test.mjs`: Gemini test now pins key-in-header, key-NOT-in-URL.

## Patterns

- Pure, env-as-argument gates (`devByomUnlockActive(env)`) keep firebase-heavy
  modules (`usage.ts`) out of unit tests while making the security predicate testable.
- Typed store-level errors (`MicrositeSlugError`) let the library enforce invariants
  the route pre-check missed (disabled foreign sites), with the route mapping codes
  to its existing client-facing responses.
- Ownership allowlists for opaque provider ids: record at generation, best-effort at
  the write, fail-closed at the check, fail-open only in the explicit LOCAL_DB
  single-operator dev mode (matching the quota layer's posture).
- Fail-safe env flags: both new gates default to the SAFE behavior (bypass off,
  proxy header untrusted).
