# Wave 13 — Campaigns backend (Google Ads sync/connector, ops API, triage/control-plane)

Module-clustered tail wave over `lib/campaigns/*`, `lib/google/*`, `app/api/campaigns/*`.
Branch `vibeman/ambiguity-ui-2026-07-16`. All 9 targeted findings fixed (2 High, 6 Medium,
1 Low). tsc clean throughout; `npm run test:unit` **1687/1687** (baseline 1678 + 9 new cases),
0 regressions.

## Commits

| # | Commit | Finding | Sev |
|---|--------|---------|-----|
| 1 | `309050b` | sync #1 — invisible PUA sentinel in snapshot id-range | High |
| 2 | `0b6f3d4` | sync #2 — unmapped channel types → "other"; drop REMOVED | High |
| 3 | `59647c5` | sync #3 — getUserAccessToken returns known-expired token | Med |
| 4 | `13f16ce` | sync #4 — budgetPacing full-period denominator assumption | Med |
| 5 | `b15abcd` | sync #5 — CAMPAIGN_TYPE_COLORS false token provenance | Low |
| 6 | `1e2e0ea` | ops #4 — blank report-config resurrects Mionelo demo | Med |
| 7 | `85b9221` | ops #5 — accounts GET 403 drops connected/active | Med |
| 8 | `5105c6f` | triage #4 — Czech plural forms in alert titles | Med |
| 9 | `9f3fbc8` | triage #5 — anomaly pseudo-id dead-ends change-set flow | Med |

## Narratives

1. **Invisible sentinel (sync #1).** `snapshotIdRange` bounded its half-open `[gte, lt)`
   with a *literal* U+F8FF PUA character embedded in source (byte `ef a3 bf`, not the
   U+E000 the report guessed). Any "strip non-printables" / linter autofix / paste
   refactor would delete it → `gte === lt` → every snapshot read empty, silently.
   Extracted a named `AFTER_ANY_ID = ""` written as a visible escape, plus a unit
   test asserting `lt` sorts strictly above a maximal real id (fails loudly if stripped).

2. **Silent enum coercion (sync #2).** `CHANNEL_TYPE[...] ?? "search"` filed HOTEL/LOCAL/
   SMART/TRAVEL/MULTI_CHANNEL under Search; no `status != REMOVED` filter meant deleted
   campaigns rendered as live "Pozastavená". Added an explicit `"other"` CampaignType
   (label "Ostatní", neutral slate colour, new `"neutral"` role) + a `toCampaignType`
   mapper that logs each unseen enum once, and `AND campaign.status != 'REMOVED'` on both
   date-windowed GAQL queries. New `CampaignTypeRole` value `"neutral"` ripples only into
   the two label maps (informational; no triage threshold moves).

3. **Known-expired token (sync #3).** Returned the stale `access_token` when expired with
   no/failed refresh; callers built a live provider that 401s and degrades every sync.
   Now returns the cached token only while genuinely valid, else null — honoring the
   "null = go sample / re-consent" contract. Preserves the forceRefresh-after-401 replay.

4. **Pacing denominator (sync #4).** `cost / (fullPeriodDays × budget)` made young /
   recently-unpaused / re-budgeted winners pace ~0.2 while spending 100%/day. Added
   `activeBudgetDays` (days with cost>0, clamped `[1, periodDays]`) + an optional
   `activeDays` override on `budgetPacing`, wired from the CampaignTable per-campaign
   series. Only tightens, never loosens; full-period assumption now documented.

5. **Token provenance (sync #5, Low).** Comment claimed the hex colours were "drawn from
   the design tokens"; they are frozen literals and this client-shared module *cannot*
   import the server-only token reader (node:fs). Rewrote the comment to state they are
   snapshot values (noting which map to a ramp step, which are bespoke) — no false claim.

6. **Demo-identity leak (ops #4).** `parseClientProfile` back-filled empty name/domain/
   business-line and out-of-range pnoGoal with the seeded Mionelo demo. Every PUT is a
   real signed-in tenant (never `"sample"`), so a mid-rebrand clear shipped a client's
   branded report for the wrong company. Now returns 422 on any blank required field /
   bad pnoGoal (discriminated `{profile}|{error}`), mirroring the accentColor check.

7. **Empty switcher (ops #5).** The accounts GET 403 (expired Google token) returned a
   bare `{error}`, unlike its two sibling degraded branches. Now passes
   `configured/accounts/connected/active` through so the switcher stays usable (PATCH/
   DELETE need no token) with a re-login prompt.

8. **Czech plurals (triage #4).** Alert titles used the genitive-plural form for every
   count ("1 nových kritických kampaní"). Added `czPlural(n, one, few, many)` to
   `@/lib/format` (1 → singular, 2–4 → paucal, else many) and applied it to both the
   critical and anomaly titles.

9. **Anomaly pseudo-id (triage #5).** Anomaly items reuse `AlertItem` with
   `campaignId: "anomaly:<key>"`; `alertCampaignIds` treated it as real → the alert→
   change-set flow scoped donors to unmatched ids and dead-ended. Added optional
   `kind: "campaign" | "anomaly"` + shared `ANOMALY_CAMPAIGN_ID_PREFIX`, set kind on
   anomaly items, and made `alertCampaignIds` skip anomaly items (by kind, or legacy
   prefix). A pure-anomaly alert now scopes to `[]` → the route's clear 422; and
   `isAlertActionable` returns false for it.

## Verification
- `npx tsc --noEmit`: clean before every commit (also enforced by lint-staged).
- `npm run test:unit`: **1687 pass / 0 fail** (1678 baseline + 9 new cases). LLM contract
  eval: all 20 tools match golden snapshots (no LLM code touched).
- New tests: store-keys sentinel bound (+1), ads channel-type mapping (+2), activeBudgetDays
  + partial-window pacing (+2), czPlural (+3), anomaly-item skip in alertCampaignIds (+1).

## Behavior changes needing sign-off
- **REMOVED campaigns now excluded** from both sync queries — historical spend of deleted
  campaigns disappears from by-type totals and the daily series (intended; they were live
  "Pozastavená" rows before). Snapshots already stored are unchanged.
- **New `"other"` CampaignType + `"neutral"` role** surface in the type-filter dropdown and
  the report-input group rollup ("Ostatní" / "nezařazené") when a real account has unmapped
  channel types. No effect on the six sample types.
- **getUserAccessToken null on expiry** — users with an expired Google token and no refresh
  token now get a clean sample / re-consent state instead of a degraded-live loop. UI copy
  for the re-consent prompt not touched here.
- **report-config PUT now 422s** on blank client name/domain/business-line or out-of-range
  pnoGoal (was: silent demo substitution). Front-end already surfaces `json.error`.
- **Anomaly alerts are no longer actionable** as change-set sources (they never produced a
  valid one — now they fail fast with a message rather than silently).

## Patterns
- Invisible load-bearing chars: verify the actual code point with `od -An -tx1` before
  "fixing" per a report's guess (report said U+E000, source was U+F8FF); Edit's exact-match
  can't target lines containing the invisible char — script the replacement with Python and
  inject the literal backslash via `chr(92)` so the source ends up with a *visible* escape.
- Adding an enum member to a `Record<T, …>` universe: let tsc drive completeness (label/
  colour/role maps all errored until filled), and update the one exhaustiveness test that
  hard-codes the old member set.
- Route-handler findings without a pure seam: validate by reading the client caller (the
  form always sends the full profile → a blank field is a deliberate clear → 422 is safe).
