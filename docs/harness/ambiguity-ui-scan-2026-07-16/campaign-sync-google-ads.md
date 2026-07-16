# Campaign Sync & Google Ads Connector — ambiguity+ui scan

> Total: 5 findings (0 critical / 2 high / 2 medium / 1 low)

## 1. Invisible Private-Use-Area character is load-bearing in the snapshot id-range query
- **Severity**: High
- **Lens**: ambiguity
- **Category**: invisible-magic-character
- **File**: src/lib/campaigns/store-keys.ts:98-104
- **Scenario**: `snapshotIdRange` builds the `[gte, lt)` window as `` lt: `${prefix}` `` — but the U+E000 code point is embedded as a *literal invisible character* in the source, visible only via the comment above it (which itself renders as blank: "(a Private-Use-Area code point) sorts after…"). Any future edit, editor "strip non-printable characters" setting, linter autofix, copy-paste refactor, or code-mod that normalizes the string silently deletes it.
- **Root cause**: A semantically critical character has no visible representation and no escape sequence; the guardrail is a comment that is itself invisible at the crucial spot.
- **Impact**: If the character is lost, `gte === lt` and the half-open range becomes empty — every period's snapshot read returns nothing, so change diffs, triage badges and alerts silently go dark with zero errors. Reviewers cannot see the regression in a diff.
- **Fix sketch**: Use the escape form: `` lt: `${prefix}` `` written as `prefix + ""` in source, and name it: `const AFTER_ANY_ID = ""; // U+E000 PUA — sorts after every realistic id char`. Add a unit test asserting `snapshotIdRange("7d").lt > snapshotDocId("7d", "2026-…")` so a stripped character fails loudly.

## 2. Unknown Google channel types silently become "search"; REMOVED campaigns render as "Pozastavená"
- **Severity**: High
- **Lens**: ambiguity
- **Category**: silent-enum-coercion
- **File**: src/lib/google/ads.ts:583 (also 474-476, 550-566)
- **Scenario**: A real account contains campaign types outside the 6-entry map — `HOTEL`, `LOCAL`, `SMART`, `MULTI_CHANNEL` (legacy Smart Shopping), `TRAVEL`. `CHANNEL_TYPE[...] ?? "search"` files them all under Search. Separately, the GAQL query has no `campaign.status != 'REMOVED'` filter, and `toStatus` maps *anything* non-ENABLED (including `REMOVED`) to `"paused"`.
- **Root cause**: Two lossy fallbacks chosen for totality, not correctness, with no comment acknowledging the coerced cases; the type map covers only the sample-data universe.
- **Impact**: The by-type breakdown, per-role (performance/prospecting) framing and the AI evaluation misattribute spend — a Smart/Local-heavy account shows inflated "Search" totals judged by the strict performance-role lens. Deleted campaigns with in-window history appear as live "Pozastavená" rows, inflating counts and pacing candidates.
- **Fix sketch**: Add `WHERE campaign.status != 'REMOVED'` (or drop REMOVED rows in the mapper); add an `"other"` CampaignType (label "Ostatní", neutral color/role) for unmapped channel types instead of defaulting to `search`, and log the unseen enum once so new types get mapped deliberately.

## 3. getUserAccessToken returns a known-expired token instead of signalling failure
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: misleading-fallback-return
- **File**: src/lib/google/token.ts:81-84
- **Scenario**: Token is past `expires_at` and either (a) there is no `refresh_token` (user granted no offline access / adapter didn't persist it) or (b) the refresh call fails — the function returns the stale `data.access_token` anyway. Callers (`resolveGoogle`) treat any non-null string as "valid OAuth token exists", build the live provider, and every fetch then 401s, burns the one retry, and degrades to sample data.
- **Root cause**: The doc comment promises "A valid Google access token … null when the user has no connected Google account", but two code paths return a token the function *knows* is expired; the contract between "null = go sample" and "string = usable" is broken silently.
- **Impact**: Users in state (a) get a permanent sample-data experience labeled as a degraded live sync every single sync (`degradedReason: 401 …`), instead of a clear "reconnect Google" outcome. Diagnosing it requires reading Firestore token docs.
- **Fix sketch**: When the cached token is expired and no fresh one can be minted, return null (or a discriminated result `{ token } | { reason: "expired-no-refresh" | "refresh-failed" }`) so `resolveGoogle` can skip the live provider and the UI can prompt re-consent rather than looping degrade-to-sample.

## 4. budgetPacing assumes the campaign ran (and was budgeted) the full period
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: hidden-denominator-assumption
- **File**: src/lib/campaigns/types.ts:308-318
- **Scenario**: `pacing = cost / (CAMPAIGN_PERIOD_DAYS[period] × budgetPerDay)`. A profitable campaign created 6 days into a 30d window — or paused for half of it, or whose daily budget was raised last week — can be spending 100 % of its budget every live day yet compute pacing ≈ 0.2, far below `BUDGET_CAP_PACING_MIN` (0.95).
- **Root cause**: The denominator hard-codes "budget × full period days" while `cost` covers only the days the campaign actually ran at the *current* budget; neither the type docs nor the `capped` docstring state this precondition.
- **Impact**: Exactly the campaigns the flag exists for ("winner starved by its budget", the highest-leverage budget action) are systematically missed when young, recently un-paused, or recently re-budgeted — and users are steered to shift money elsewhere.
- **Fix sketch**: Document the full-period assumption on `BudgetPacing.pacing` as a known under-estimate, and where the per-campaign daily series is available, derive active days (`points.filter(p => p.cost > 0).length`) as the denominator's day count; cap at period days so the metric only tightens, never loosens.

## 5. CAMPAIGN_TYPE_COLORS claims design-token provenance but hard-codes hex literals
- **Severity**: Low
- **Lens**: ui
- **Category**: design-token-drift
- **File**: src/lib/campaigns/types.ts:33-40
- **Scenario**: The comment says the six per-type colours are "drawn from the design tokens, so the by-type breakdown and the table dots always agree" — but they are frozen hex strings (`#14b8b1`, `#fb7141`, …) with no link to the token source. A palette refresh in the Tailwind/theme tokens updates every other surface, and these dots/legend chips silently keep the old brand colours.
- **Root cause**: One-way copy of token values at authoring time, presented as if it were a live reference; nothing enforces the equivalence the comment asserts.
- **Impact**: Visual inconsistency after any theme change — chart series, type dots and badges stop matching buttons/accents built from real tokens; also three of the six values (`#2dd4ce` on light surfaces especially) have no contrast guarantee if backgrounds shift.
- **Fix sketch**: Either import the constants from the single token module (if one exists, e.g. the Tailwind theme/exported palette) or rewrite the comment to state these are snapshot values that must be updated with the palette, and add a small test comparing them to the token source so drift fails CI instead of shipping.
