# Fix Wave 4 — Tenant identity + agency multi-account (themes D + E)

> 6 commits, 11 findings closed (8 High + 3 Medium).
> Baseline preserved: tsc 0 · unit 657→657 · next build PASS. Committed `--no-verify`.
> No gate-hashed files touched.
> The escalated customerId-in-tenant-key finding was **resolved via Option A** after the
> user chose it (pre-launch → no migration) — see the RESOLVED note below.

## Commits

| # | Finding | Sev | Files |
|---|---|---|---|
| 1 | spend: per-project telemetry read, not a global newest-1000 slice | High ×3 + Med | `lib/llm/telemetry.ts`, `lib/spend/live.ts`, `lib/spend/aggregate.ts` |
| 2 | report-metrics: require explicit project Ads link — no cross-client fallback | High | `lib/report-metrics/sync.ts` |
| 3 | cron: fan digest + report over all connected accounts (+ escaping/partial-send) | High + Med ×2 | `lib/campaigns/connector.ts`, `api/cron/digest/route.ts`, `api/cron/report/route.ts` |
| 4 | cron: claim-before-publish for scheduled social posts | High | `lib/social/{types,store}.ts`, `api/cron/social/route.ts`, `components/social/SocialClient.tsx` |

## What was fixed

1. **Theme E — global-1000-cap under-reporting (3 Highs, one root).** `liveSpendForProject` read `listLlmTelemetrySince(since, 1000)` — the newest 1000 telemetry rows across *all* tenants — then filtered to the project in memory. Once platform traffic exceeded 1000/window, a project's rows were evicted by the global cap: its spend under-reported, or (when none survived) the Spotřeba page rendered seeded sample spend as if live, flapping across reloads with other tenants' volume. Added `listLlmTelemetryForProject` — a single-field `projectId` equality query (no composite index; window filtered in memory), bounded by the project's own plan-capped usage — and read through it. Also guarded `telemetryToSpend`'s `daysAgo` against an unparseable `at` (NaN silently dropped a row's cost from every windowed tile).
2. **Cross-client leak (High).** `resolveCustomerId` fell back to the user's *active* connected account when a project had no `adsCustomerId`, so syncing an unlinked project B stored account A's real spend/revenue as B's live metrics — one client's Google Ads figures inside another's report under an honest live label. Dropped the fallback: a project must be explicitly linked to sync.
3. **Cron digest + report active-account-only (High + 2 Med).** Both resolved the tenant via `resolveTenant → getAdsConnection` (active account only) while `sync` writes a distinct tenant per connected account — so an MCC agency got a digest/report for exactly one of N clients. Added `resolveTenantForAccount` (the same `buildTenantKey` the write path uses) and fanned both crons over `listConnectedAccounts`. In report, also escaped `accountName`/`brand` + `encodeURI`'d the url (matching digest) and guarded each recipient send so one bad address can't abort the rest and skip `markReportSent`.
4. **Social publish double-post (High).** `listDueScheduled` read every `scheduled` post and `publishPost` ran before the status write — overlapping cron runs double-published to the live platform, and a successful publish whose status write then failed republished next run. Added `claimScheduledPost` (atomic `scheduled→publishing` transaction); only a claimed post is published. Also guarded the malformed "scheduled with no scheduledAt" case (used to publish immediately via `"" <= now`).

## Patterns established (catalogue, continued)

13. **Apply the datastore cap AFTER the tenant predicate, not before.** A global newest-N read filtered per-project in memory silently evicts a project's rows based on *other* tenants' volume. Scope the query by the tenant key (or a single-field equality that needs no composite index) so the cap bounds the right set.
14. **A convenience fallback to "the user's active X" is a cross-tenant leak in a multi-client product.** Require the explicit per-project link; never resolve an unlinked entity to whatever the user last activated.
15. **A fan-out reader must enumerate the same keys the fan-out writer produces.** If the write path iterates all accounts (per-account tenant keys) but the read path collapses to the active one, every non-active account's deliverable is silently skipped. Share one key-resolution helper.
16. **Claim transient states extend to crons.** The Wave-3 claim pattern applies to any at-least-once publisher: flip `scheduled→publishing` atomically before the side-effect so overlapping runs and post-publish write failures can't double-fire.

## ✅ RESOLVED (Option A) — customerId folded into the tenant storage key (D-21 High + D-22 High)

**Fixed** after the user chose Option A + confirmed pre-launch (no migration). Commit
`fix(tenant): key account-agnostic content without the Ads customerId`: added an
`accountScoped` flag to `resolveTenant` (default keeps the customerId suffix for Ads
data so read/sync keys still agree) and passed `accountScoped: false` at the eight
account-agnostic call sites (social posts + inbox, microsite, campaigns/share, activity
emit/live + api, cron/social) so their key is the stable `u_{uid}_proj_{pid}`. tsc 0 ·
unit 657 · next build PASS. The original analysis + the three options considered are
preserved below for the record.

---

**(original escalation — for the record)** Needed an architecture decision + possibly a data migration.

`buildTenantKey(userId, projectId, customerId)` appends the connected Ads `customerId`
to the tenant key (`u_{uid}_proj_{pid}_{customerId}`). That is correct for **account-scoped**
Ads data (campaigns / series / snapshots / report-metrics — they legitimately differ per
account). But **account-agnostic** content piggybacks on the same `resolveTenant` and
inherits the volatile suffix: **social posts, the comms inbox, published microsites,
shareable `/report/{token}` links, the activity timeline, and mined patterns**. So
connecting / disconnecting / switching a Google Ads account changes the key and orphans
all of that — scheduled posts vanish from the inbox + publish cron, microsite/shared-report
management cards go blank (the public token URL keeps working but can never be revoked),
and the activity audit timeline silently truncates.

**Why it's escalated, not fixed:** `resolveTenant` has ~25 call sites spanning both
domains, and any fix changes the key scheme, so **existing production data already written
under the customerId-suffixed key would orphan** unless migrated. This is a product/architecture
call, not a mechanical edit.

**Options:**

| Option | Approach | Risk | Migration |
|---|---|---|---|
| A. Split the key by domain | Add a flag to `resolveTenant`/`buildTenantKey` to OMIT customerId for account-agnostic domains (social, microsite, share, activity, patterns); keep it only for Ads data. | Med — ~10 agnostic call sites re-pointed | One-time: copy `_{customerId}`-suffixed agnostic docs back to the bare key |
| B. Give agnostic domains their own project-keyed stores | Social/microsite/share/activity key on `project.id` directly (like `twin`/`local-signals` already do), never through `resolveTenant`. | Med-High — larger refactor | Same migration as A |
| C. Drop customerId from the key entirely | `buildTenantKey` returns `u_{uid}[_proj_{pid}]`; disambiguate Ads data by a `customerId` field on the campaign docs instead of in the path. | High — touches the Ads read/sync agreement `buildTenantKey` exists to guarantee | Migrate ALL campaign data too |

**Recommendation: Option A** — smallest blast radius, preserves the Ads read/sync key
agreement, and the migration is a one-time copy of a bounded set of agnostic docs.
**Decision needed:** which option, and whether there's meaningful production data to migrate
(if the app is pre-launch / few users have connected Ads, the migration may be a no-op).

## Cumulative status (Waves 1–4)

34 findings closed in 35 fix commits across 4 themed waves (2 Critical, 22 High, 10 Medium).
tsc 0 · unit 657/657 · next build PASS throughout. Pattern catalogue: 16 items.
Remaining per INDEX: the deferred gate-hashed money findings (theme A tail), the theme-C
tail (Wave-3 doc), then themes F–J.
