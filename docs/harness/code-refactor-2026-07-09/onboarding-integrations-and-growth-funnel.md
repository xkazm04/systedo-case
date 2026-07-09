# Onboarding, Integrations & Growth Funnel

> Context #51 - code_refactor scan, 2026-07-09
> Total: 5 (Critical: 1, High: 1, Medium: 2, Low: 1)
> Files read: 21

## 1. Onboarding checklist's "Ads connected" check ignores the same user-level Ads connection Integrations already trusts

- **Severity**: Critical
- **Category**: duplication
- **File**: `src/lib/onboarding/progress.ts:51`
- **Scenario**: `resolveOnboardingProgress` (rendered on `/app/[projectId]/start` and in `OnboardingProgressCard.tsx`) computes `const adsDone = !!project.adsCustomerId;` — it only looks at the project's own linked customer id. But connecting a Google Ads account (`POST /api/campaigns/accounts` → `addAccount`) writes to the *user-level* `adsConnections/{userId}` doc and never touches `project.adsCustomerId` — that's a separate manual step via `PATCH /api/projects/[id]`. Two other places in the same codebase treat "the user's active connected account" as sufficient on its own: `src/lib/integrations/status.ts:37-45` (`probeAdsLinked`: `project.adsCustomerId` OR `getAdsConnection(userId)?.customerId`) and `src/lib/report-metrics/sync.ts:28-37` (`resolveCustomerId`: same fallback, and it's what the report sync actually runs against). Net effect: a user connects their Ads account, the Integrations page (`/app/[projectId]/integrace`) shows "Google Ads: Connected", report sync is already pulling live data — yet the onboarding checklist on the start page keeps telling them to "Připojit Google Ads" forever, because it's the one place that never checks `getAdsConnection`.
- **Root cause**: `adsDone` was written as a quick project-field check and never updated to match the `project.adsCustomerId` OR `getAdsConnection(userId)` pattern that both `integrations/status.ts` and `report-metrics/sync.ts` independently established as the correct "is Ads actually usable" signal.
- **Impact**: A self-completing checklist (the whole point per the file's own header comment: "self-completes as the user connects data") that structurally cannot self-complete for the most common connection path (agency/user-level MCC connection without a per-project link). Users see a permanently-stuck onboarding step contradicting the Integrations page one click away — an active correctness landmine, not just cosmetic drift.
- **Fix sketch**: In `resolveOnboardingProgress`, replace the bare `!!project.adsCustomerId` with the same two-step check already factored out in `report-metrics/sync.ts`'s `resolveCustomerId` (or extract that function to a shared, framework-free helper both `progress.ts` and `sync.ts` import — `resolveCustomerId` doesn't touch Google APIs, only Firestore via `getAdsConnection`, so it's a legitimate common dependency). Needs `userId`, which `resolveOnboardingProgress` already receives.

## 2. `sanitizeScanProfile`'s known-project-types allow-list is a hand-copied literal, not derived from the canonical `ProjectType` union

- **Severity**: High
- **Category**: duplication
- **File**: `src/lib/onboarding/types.ts:35`
- **Scenario**: `const KNOWN_TYPES = new Set(["eshop", "app", "leadgen", "content", "local"]);` re-lists the five `ProjectType` values by hand to gate `sanitizeScanProfile`'s `suggestedType` field (lines 73-74). The canonical list already exists as `PROJECT_TYPES` (exported from `src/lib/projects/types.ts`, alongside `type ProjectType = "eshop" | "app" | "leadgen" | "content" | "local"`), and the sibling validator `src/lib/ai/validation.ts:787` does this correctly: `const PROJECT_TYPE_SET = new Set<string>(PROJECT_TYPES);`.
- **Root cause**: `onboarding/types.ts` was written independently of `ai/validation.ts` and re-typed the literal instead of importing `PROJECT_TYPES`.
- **Impact**: Today the two lists happen to agree (5/5 values match), so there's no live bug — but this is exactly the kind of duplicate enumeration that silently rots: the day a `ProjectType` variant is added or renamed, `sanitizeScanProfile` keeps compiling (it's just a `Set<string>`, no type-level link to `ProjectType`) while silently dropping every `suggestedType` for the new type — the onboarding-scan AI result comes back with a type suggestion that gets thrown away with no error, anywhere.
- **Fix sketch**: In `src/lib/onboarding/types.ts`, replace the literal with `import { PROJECT_TYPES } from "@/lib/projects/types";` and `const KNOWN_TYPES = new Set<string>(PROJECT_TYPES);`, mirroring `ai/validation.ts:787`.

## 3. `normalizeSiteUrl`'s bare-domain-to-URL logic is a byte-for-byte copy of `ai/validation.ts`'s inline check — and runs redundantly on an already-normalized URL

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/onboarding/site-fetch.ts:19-23`
- **Scenario**: `normalizeSiteUrl` does `return /^https?:\/\//i.test(t) ? t : \`https://${t}\`;`. The one and only caller of `fetchSiteText` (which calls `normalizeSiteUrl` internally) is `src/app/api/ai/route.ts:428`, and the `url` it passes in has already gone through `validateOnboardingScanRequest` in `src/lib/ai/validation.ts:845`, which does the identical check — `const candidate = /^https?:\/\//i.test(raw) ? raw : \`https://${raw}\`;` — then further hardens it through `new URL(candidate)` and returns `url.toString()`. So by the time `normalizeSiteUrl` runs, the "prepend a scheme" branch is unreachable in production: the string it receives already has a scheme.
- **Root cause**: Two independent implementations of the same one-line guard, one in the request validator (which also does the real work — parseable-URL + protocol check) and one duplicated defensively inside the fetch helper.
- **Impact**: Low today (redundant regex test, no behavior difference), but it's exact duplicate logic in an SSRF-adjacent path — the two must be kept in sync by hand, and any future direct caller of `fetchSiteText`/`normalizeSiteUrl` that skips `validateOnboardingScanRequest` would rely on `normalizeSiteUrl`'s weaker guard (no protocol/parseability check) rather than the validator's stronger one, silently reintroducing the gap the validator exists to close.
- **Fix sketch**: Keep `normalizeSiteUrl` exported (it's the right home for it, and `fetchSiteText` should stay defensive against being called directly) but delete the duplicate inline regex in `ai/validation.ts:845` and import `normalizeSiteUrl` from `@/lib/onboarding/site-fetch` instead, so there is exactly one implementation of "add a scheme to a bare domain."

## 4. `decodeEntities` is reimplemented in `onboarding/site-fetch.ts`, diverging from the near-identical helper in `catalog/feed.ts`

- **Severity**: Medium
- **Category**: duplication
- **File**: `src/lib/onboarding/site-fetch.ts:27-39`
- **Scenario**: `site-fetch.ts` defines a local `decodeEntities` (nbsp, amp, lt, gt, quot, apos-or-`&#39;`, then generic `&#NNN;`) to clean the scanned-homepage text. `src/lib/catalog/feed.ts:48-58` defines a second, differently-ordered `decodeEntities` (strips CDATA, lt/gt/quot/apos, `&#NNN;`, hex `&#xHH;`, amp *last*) for feed XML. Same purpose (decode the entities that survive tag-stripping), same name, different entity coverage and — critically — different processing order (site-fetch decodes `&amp;` first, feed.ts decodes it last, which matters for strings like `&amp;lt;`).
- **Root cause**: Two authors solving the same "decode leftover entities" problem for two different input shapes (HTML page body vs. product-feed XML) without a shared home for it.
- **Impact**: Minor today since each is scoped to its own format and neither is broken, but it's the same class of text-cleanup logic maintained twice with silently different behavior — a future entity-handling fix (e.g. adding `&#x...;` support, which only `feed.ts` has) applied to one and not the other leaves the other still broken on that class of input.
- **Fix sketch**: Extract a single shared entity-decoder (superset of both: nbsp + CDATA-strip toggle + decimal and hex numeric entities + amp-last ordering, since amp-last is the only order that's correct for chained entities like `&amp;lt;`) into a small `src/lib/text/` (or similar shared-util) module; have both `site-fetch.ts` and `feed.ts` import it. Both call sites are pure string functions with no node built-ins, so this carries no client/server boundary risk.

## 5. `periodAlerts` recomputes `trendBySource` that its only caller already computed

- **Severity**: Low
- **Category**: duplication
- **File**: `src/lib/lead-quality/compute.ts:283-285`
- **Scenario**: `export function periodAlerts(sources: LeadSource[], opts: AlertOptions = {}) { return trendBySource(sources).flatMap((t) => sourceAlerts(t, opts)); }` takes raw `sources` and recomputes trends internally. Its only caller, `src/components/app/modules/LeadQualityModule.tsx:153-154`, does `const trends = trendBySource(sources); const alerts = periodAlerts(sources);` — i.e. `trendBySource(sources)` runs twice over the same input on every render of the lead-quality module.
- **Root cause**: `periodAlerts` was designed as a sources-in/alerts-out convenience wrapper without anticipating that a caller would also need the intermediate `SourceTrend[]` for its own display (the period-over-period trend table).
- **Impact**: Negligible at today's scale (a handful of lead sources per project), but it's needless duplicated work baked into the API shape, and the pattern (compute X, then call a helper that recomputes X) is easy to copy into a new caller.
- **Fix sketch**: Change `periodAlerts` to take the already-computed trends: `export function periodAlerts(trends: SourceTrend[], opts: AlertOptions = {}): LeadQualityAlert[] { return trends.flatMap((t) => sourceAlerts(t, opts)); }`, and update the one caller to `periodAlerts(trends)` instead of `periodAlerts(sources)`. `trendBySource` stays exported as-is for callers that only need trends.
