# WP W2-B — Public /sken: no-account website scan → claim into a seeded project
card #21 · L · gate: policy (public paid surface; claim token) · wave 2

## Goal
An anonymous visitor on `/sken` enters a URL, gets an honest scan (business profile + a channel
plan seeded from it — ONE AI call, plan derived deterministically), and can claim it: sign in →
a project is created and seeded exactly as the in-app onboarding apply would (profile,
competitors, keyword list, starter catalog). Acceptance: the public mode refuses nothing an
authed scan would accept but is IP-capped at 5/day (pinned), a claim is idempotent and expires
after 7 days (pinned), the funnel counts view → scan → claim (pinned) — ≥18 assertions.

## Non-goals
- ONE `generateStructured` call per scan — the channel plan comes from
  `baseChannelPlan(type, ctx, seedKey)` (`src/lib/organic-channels/sample.ts:458-479`) seeded
  from the scan result, labelled as curated ("orientační plán"), NOT from `channel-research`.
- No new LLM tool, no golden, no prompt change — `onboarding-scan` is reused verbatim
  (`src/lib/ai/tools/onboarding-scan.ts`, tag :257). Do not touch the tool file.
- **Do not edit `src/app/api/ai/modes.ts` or `dispatch.ts`** — W2-A owns them this wave. Your
  `onboarding-scan-public` mode entry is a SEAM REQUEST (exact insert below); you may apply it
  locally to test, but report it and revert-note it — the Director lands it.
- Do not edit `db.ts`, `sast-allowlist.json`, `context-map.json` — seam requests.
- No e-mail capture, no marketing automation, no locale routing changes (locale is a cookie —
  `src/lib/i18n/locale.ts:13-16`).

## Seams
- Reuse from the authed flow: `fetchSiteText` (`src/lib/onboarding/site-fetch.ts:90`, SSRF-safe
  via `fetchFeed`), `OnboardingScanRequest/Result` (`src/lib/ai-types.ts:1327-1369`),
  `validateOnboardingScanRequest`, `sanitizeScanProfile` (`src/lib/onboarding/types.ts:62-85`).
- Mode precedent: the authed entry `src/app/api/ai/modes.ts:708-730` — the public entry is the
  SAME `prepare` (fetch + inject pageText) with the `guard` replaced: instead of the 401, a
  per-IP daily cap via `durableGuard(clientIp, [RATE_RULES.skenPerDay()])` — new rule in
  `src/lib/ai/rate-limit.ts:96-111` region (`SKEN_PER_DAY` default **5**, env
  `SKEN_RATE_PER_DAY`). `guardPaidGeneration` (`src/lib/ai/paid-guard.ts:97-123`) already runs
  for every `/api/ai` POST — the mode guard ADDS the sken cap, it does not duplicate the rails.
  `ctx` carries the request? — check `DispatchCtx` (`modes.ts:126-134`): it has no Request; the
  guard receives `ctx` only, so the rule needs the IP. If `DispatchCtx` lacks it, the seam
  request includes the one-line ctx extension (`ip: string` populated in `route.ts` from
  `clientIp(request)`) — report exactly what was needed.
- **Extract the apply**: the seeding logic inline in
  `src/app/api/projects/[id]/onboarding/route.ts:51-112` (sanitize → saveOnboarding →
  mergeScanSuggestions/saveCompetitors :65-82 → keyword seed :91-101) moves to NEW
  `src/lib/onboarding/apply.ts` `applyScanToProject(uid, project, profile)`; the existing route
  calls it — behaviour pinned by the existing onboarding tests (extend if thin).
- Claim token: NEW `src/lib/onboarding/claim-token.ts` + store trio
  (`claim-store.ts` + `.local` + `.firestore`) — GLOBAL token-keyed like microsites
  (`src/lib/microsite/store.ts:6-9,30-32` dispatcher shape; token minted
  `randomBytes(16).toString("hex")` as `src/lib/campaigns/shared-report.ts:187`).
  TTL 7 days, expired reads return null (`shared-report.ts:143-144` shape). Stores the
  SANITIZED profile + scannedUrl + suggestedType; never the raw page text.
- Mint route: NEW `src/app/api/sken/claim/route.ts` POST `{ scan, scannedUrl }` → `{ token }`.
  PUBLIC → sast `route-auth` fires (`scripts/sast.mjs:51,120-121,167-184`) — allowlist seam
  request with the reason: "Deliberately anonymous: stores a visitor's own sanitized scan under
  a 128-bit random token so it survives the sign-in redirect. No AI spend, no tenant read;
  durableGuard per-IP daily cap (RATE_RULES.skenPerDay) + 32 KB body cap." Enforce exactly that
  in the route.
- Redeem route: NEW `src/app/api/sken/redeem/route.ts` POST `{ token }` — `currentUserId()`
   401 otherwise (passes GUARD_RE); creates the project like `POST /api/projects`
  (`src/app/api/projects/route.ts:42-58`: `createProject` + `starterCatalog` best-effort +
  `emitProjectActivity`), type = `suggestedType` when valid `isProjectType` else `"content"`,
  name = scan `businessName`, domain = scannedUrl host; then `applyScanToProject`; deletes the
  token (single-use); `recordOnboardingActivation()` NOT here (progress.ts owns it); responds
  `{ projectId }`. Idempotency: a second redeem of a consumed token → 404.
- Page: NEW `src/app/sken/page.tsx` (+ client `src/components/marketing/sken/SkenClient.tsx`
  ≤200 LOC, split further as needed): URL input → `useAiTool<OnboardingScanResult>(
  "onboarding-scan-public")` (`src/components/ai/useAiTool.ts:194`; anonymous use precedent
  `src/components/demo/DemoModule.tsx:159`) → result: profile card + channel plan table via the
  existing marketing pieces (`src/components/marketing/kanaly/SeededPlanTable.tsx`,
  `VisibilityPlanBand.tsx` — reuse, extend props additively only) → "Uložit jako projekt"
  button: POST claim → `signIn` with `callbackUrl: /sken?claim=<token>`
  (`src/components/app/AppSignInGate.tsx:92-96` pattern incl. self-hosted branch) → on return
  with a session, POST redeem → redirect `/app/<projectId>/start`. `T` dicts cs/en per
  component (`src/app/kanaly-zdarma/page.tsx:18-38` shape); marketing chrome comes free
  (`src/components/site/ChromeGate.tsx:12-13`).
- Funnel: `recordPageView("/sken")` in the page (server, `src/lib/analytics/track.ts:31`);
  NEW metrics in `src/lib/analytics/funnel.ts` (`METRIC_SKEN_SCAN = "sken-scan"`,
  `METRIC_SKEN_CLAIM = "sken-claim"` beside :18-24) bumped server-side in the mode prepare
  (seam request notes it) and the redeem route; `skenFunnelRollup()` beside `funnelRollup` :68.
- Test harness: temp-db shape `test-unit/campaigns-local-store.test.mjs:1-30`.

## Data contract
```ts
// src/lib/onboarding/claim-token.ts
export interface ScanClaim {
  token: string;                       // 32-hex, doc id
  profile: OnboardingScanProfile;      // sanitized (types.ts:11-32 shape, scannedUrl inside)
  suggestedType?: string;
  createdAt: string;
}
export const SCAN_CLAIM_TTL_DAYS = 7;
export const SCAN_CLAIM_MAX_BODY = 32 * 1024;
```
Store API: `createScanClaim(profile, suggestedType)`, `getScanClaim(token)` (null when
expired), `consumeScanClaim(token)` (get + delete, atomic enough per backend),
`pruneScanClaims(now)` (called opportunistically on create).

Sqlite (seam request, migration **v28** — W2-A holds v27; append after `db.ts:1032`,
`test-unit/db-migrations.test.mjs:10` LATEST is also a seam request):
```sql
CREATE TABLE IF NOT EXISTS scan_claims (
  token TEXT PRIMARY KEY, data TEXT NOT NULL, created_at TEXT NOT NULL
);
```
Firestore: `scanClaims/{token}`. No cascade entry (global, self-expiring, user-free).

Mode seam request (verbatim insert for the Director, anchor `modes.ts:730` after the
`onboarding-scan` entry):
```ts
    "onboarding-scan-public": defineMode<OnboardingScanRequest>({
      validate: validateOnboardingScanRequest,
      guard: async (ctx) => guardSkenDaily(ctx),   // per-IP RATE_RULES.skenPerDay via durableGuard
      prepare: /* identical to onboarding-scan's prepare, plus recordSkenScan() best-effort */
    }),
```
(exact final text comes from your report; `guardSkenDaily` lives in your write set —
`src/lib/onboarding/sken-guard.ts` — so the modes.ts diff is import + entry only). The mode id
also joins the id union at `src/lib/ai-types.ts:28,44` region — SEAM REQUEST (ai-types.ts is
co-owned by W2-A/W2-C this wave; do not edit it).

## Invariants
- ADR-0003: no new provider call; ADR-0002: the redeem route's writes key off
  `currentUserId()`, never the body; the claim stores no tenant data.
- `usage.consume` stays authed-only (`src/lib/usage.ts:98-102` requires userId) — anonymous
  scans are bounded by `guardPaidGeneration` + the sken cap, exactly like the existing
  anonymous `/api/ai` posture (`src/app/api/ai/route.ts:15-20,36`).
- Privacy: analytics stays aggregated counters (`src/lib/analytics/track.ts:6-9`); the claim
  blob holds the sanitized profile only.
- Honest labels: the plan preview is marked as curated/orientační (it is `baseChannelPlan`,
  not research); the scan result renders `source: "fallback"` disclosure when demo mode.
- Cache Components: no `export const dynamic`; `/sken` stays a normal page (async request
  reads inside Suspense boundaries as the repo does elsewhere).

## Build steps
1. `claim-token.ts` + trio + `test-unit/onboarding-claim.test.mjs` (mint/get/expiry/consume/
   prune; ≥8).
2. `apply.ts` extraction + existing route re-pointed; pin with a fixture test (same writes as
   before — mock stores, assert call args).
3. `sken-guard.ts` + rate rule + mode-entry seam request text finalized; local apply for
   verification (report + include the exact revert).
4. Claim + redeem routes + tests (redeem creates project + seeds; second redeem 404;
   anonymous redeem 401).
5. `/sken` page + client + funnel metrics + rollup test.
6. LF-normalize; gates; report (list every seam request verbatim).

## Gates
`npx tsc --noEmit` · `npx eslint src/app/sken src/app/api/sken src/lib/onboarding
src/lib/analytics src/components/marketing/sken src/components/marketing/kanaly` ·
`npm run test:unit` · `npm run llm:gate:check` (must stay green — no registry change).

## Acceptance
- Public mode fixture: 6th scan from one IP in a day → 429 with retryAfter (pinned).
- Redeem fixture: project row + onboarding row (`scanApplied: true`) + competitor suggestions +
  keyword list `seed: "onboarding-scan"` all present after one call (≥5 assertions); token gone.
- `skenFunnelRollup` over a seeded metrics fixture → exact scan/claim conversion (pinned).
- ≥18 new assertions.

## Hotspot requests (seam requests — verbatim inserts + anchors)
- `modes.ts:730` entry + its import lines; `ai-types.ts` mode-id union addition;
  `dispatch.ts` deps line IF one is needed (reusing `deps.gen.onboardingScan` should make it
  unnecessary — report either way).
- `db.ts` v28 + DDL; `db-migrations.test.mjs` LATEST; table-count comments (`db.ts:612`,
  `:1184`).
- `.github/security/sast-allowlist.json` `route-auth` entry for `src/app/api/sken/claim/route.ts`
  (reason above).
- `context-map.json` (Director).

## Rollback
Revert; `scan_claims` rows expire on their own; unredeemed tokens die with the table; the mode
entry reverts with the seams commit (no golden involved).
