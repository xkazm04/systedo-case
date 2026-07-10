# Scheduled cron jobs

> Total: 5
> Critical: 0 · High: 2 · Medium: 2 · Low: 1
> Lenses: bug-hunter 4 · code-refactor 1 (new-only, deduped vs code-refactor-2026-07-09)

## 1. Weekly digest & scheduled report only cover the *active* Ads account — every other connected account's client is silently never contacted

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/cron/digest/route.ts:54`
- **Scenario**: `sync/route.ts` fans out over **all** connected accounts — `listConnectedAccounts(userId)` → for each `accountId` it calls `resolveCampaignContext(userId, projectId, type, accountId)`, whose `override = getConnectedAccount(userId, accountId)` makes the tenant key account-specific (`u_{user}_proj_{proj}_{customerId}`). So sync writes campaigns/series/snapshots into a *distinct tenant per connected account*. But `digest/route.ts:54` and `report/route.ts:42` resolve the tenant via `resolveTenant(userId, project?.id)`, which calls `getAdsConnection(userId)` — and that returns **only the active (or first) account** (`connection.ts:70-75`). The digest/report therefore read `u_{user}_proj_{proj}_{ACTIVE customerId}` only; for every non-active account, `getSyncMeta(tenant)` is null / `getReportConfig` points at an unsynced tenant, so the loop `continue`s with `sent:false`. An MCC agency with 4 connected client accounts gets a weekly digest and scheduled client report for exactly **one** of them — whichever `activeCustomerId` happened to be last (it flips whenever the user calls `setActiveAccount`).
- **Root cause**: Two tenant-resolution paths that must agree don't: the write path (sync) enumerates *all* accounts, the read path (digest/report) collapses to the *active* account. `resolveTenant` was designed for the interactive "current account" view and reused verbatim in a fan-out context that needs per-account iteration.
- **Impact**: Data loss of a business promise — synced data and alerts exist for all accounts, but the scheduled emails/reports (the paid deliverable) go out for only one. No error is logged; the run reports `ok:true, sent:false` for the skipped ones, reading as "nothing due."
- **Fix sketch**: In `digest` and `report`, fan out over `listConnectedAccounts(userId).accounts` the same way `sync` does and resolve the tenant per `(project, accountId)` via `resolveCampaignContext(...).tenant` (or a shared `listAccountTenants(userId, project)` helper), instead of the single-account `resolveTenant`. Keeps read/write tenant keys identical.

## 2. `social` publish cron has no claim/idempotency — overlapping runs (or a failed status write after a successful publish) double-post

- **Severity**: High
- **Lens**: bug-hunter
- **Category**: race-condition
- **File**: `src/app/api/cron/social/route.ts:27`
- **Scenario**: `listDueScheduled(tenant, nowIso)` reads every doc `where status == "scheduled"` and `scheduledAt <= now` (`social/store.ts:68`), then for each it calls `publishPost(...)` and only afterwards `updatePost(..., { status: "published" })`. There is no atomic "claim" (no transactional read-modify-write, no CAS from `scheduled`→`publishing`). Two ways this double-publishes to the real platform: (a) two cron invocations overlap — Vercel can start the next scheduled run while a prior one is still inside its `maxDuration = 300` window across a large user set, and both read the same still-`scheduled` post; (b) `publishPost` succeeds but the subsequent `updatePost` throws (Firestore hiccup) — the caught error leaves the post `scheduled`, so the next run republishes it. `publishPost` is at-least-once with no dedupe key.
- **Root cause**: The pipeline assumes single-threaded, always-completing execution and treats "publish then mark" as atomic; it isn't across process boundaries or partial failures.
- **Impact**: Duplicate live social posts (user-visible, embarrassing, unretractable) and duplicated `externalUrl`s. Silent — the run counter still reports one `published`.
- **Fix sketch**: Claim before send with a transaction: `firestore.runTransaction` that flips `scheduled`→`publishing` only if still `scheduled` (skip if already claimed), then `publishPost`, then set `published`/`failed`. Or pass an idempotency key derived from `post.id` to `publishPost` so the provider dedupes. Also guard the `scheduledAt`-missing case (`"" <= nowIso` currently publishes an unscheduled post immediately).

## 3. Scheduled report: one failing recipient aborts the rest and skips `markReportSent`, with no retry until the next cadence day

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/app/api/cron/report/route.ts:77`
- **Scenario**: The recipient loop `for (const to of recipients) { await sendEmail(to, ...) }` (lines 77-79) is inside the per-tenant `try` but is not individually guarded. If `sendEmail` throws on the *second* of three recipients (one bad address / transient SMTP error), the exception unwinds the whole iteration to the `catch` at line 91. By then: `createSharedReport` already minted a share token, recipient #1 already got the email, the webhook/alert (lines 81-87) never ran, and crucially `markReportSent(tenant, today)` (line 88) never ran. Because `isDue` is true only on the exact cadence day (Monday / the 1st), the next daily run has `isDue === false`, so the report is **not** retried this period — leaving a partial send (some clients got it, some didn't) that never self-heals.
- **Root cause**: All-or-nothing ordering assumes the recipient fan-out either fully succeeds or is safely retried, but the `isDue` exact-day filter means a mid-loop throw is neither completed nor rescheduled.
- **Impact**: Partial client-report delivery with no recovery; the operator sees `ok:false` but not that some recipients were already emailed a live report link.
- **Fix sketch**: Wrap each `sendEmail` in its own try/catch, collect per-recipient failures, and call `markReportSent` as long as at least one send succeeded (or track delivered recipients so a retry only re-sends the failures). Move `markReportSent` off the strict happy-path.

## 4. Scheduled report email interpolates `accountName` / `brand` / `url` into HTML unescaped — the sibling digest route escapes, this one doesn't

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/app/api/cron/report/route.ts:74`
- **Scenario**: The email body is built as `` `<p>Je připravený nový report ... pro <strong>${accountName}</strong>.</p>` + `<p><a href="${url}">...</a></p>` + `<p ...>${brand} · ...</p>` `` (lines 73-76). `accountName` comes from `getAdsConnection().customerName ?? project?.name` (line 50-51) and `brand` from `config.brandName || project?.name` (line 66) — all user-editable free-text (project name, report-config brand name, Google-supplied account name). None are passed through `escapeHtml`, even though `escapeHtml` is now the shared helper in `@/lib/html` and the *neighbouring* `digest/route.ts` deliberately escapes every interpolated string (lines 45, 104). A project named `Ceník < 2024 & spol.` corrupts the rendered email; a crafted brand string can inject arbitrary markup/links into a report email delivered to the client's recipients.
- **Root cause**: The report route pre-dates (or was never migrated to) the escaping discipline the digest route follows; presentation strings are concatenated raw.
- **Impact**: Broken email rendering for benign inputs containing `<`/`&`, and HTML/link injection into an outbound client-facing report email for adversarial inputs — inconsistent with the escaping the codebase already standardized.
- **Fix sketch**: `import { escapeHtml } from "@/lib/html"` and wrap `accountName`, `brand` (and encode `url` via `encodeURI`/attribute-escape) at each interpolation, matching `digest/route.ts`.

## 5. The six cron routes disagree on the failure-result key (`reason` vs `error`) in their JSON output

- **Severity**: Low
- **Lens**: code-refactor
- **Category**: structure
- **File**: `src/app/api/cron/digest/route.ts:32`
- **Scenario**: Each route returns a `results[]` array of per-tenant outcomes, but the failure field name is inconsistent: `catalog-sync` and `report` use `reason` (`catalog-sync:31/70`, `report:35/93`), while `digest` and `social`/`sync` use `error` (`digest:32/120`, `sync:27/74`). The success/ancillary keys also drift (`sent` vs `alerted` vs `published`). This is *not* the fan-out duplication already flagged in code-refactor-2026-07-09 #3, nor the `err instanceof Error` ternary from that report's #5 — it's the divergent *result envelope shape* across the sibling endpoints, which the prior report did not cover.
- **Root cause**: Each route's result type was declared inline and independently; no shared `CronResult`/`CronRunSummary` type ties the six together.
- **Impact**: Any operator dashboard or log parser consuming cron JSON must special-case each endpoint to find the error string; a copy-paste of one route into a new cron silently picks whichever key the source used. Purely a consistency/maintainability issue, no runtime defect.
- **Fix sketch**: Define one `type CronItemResult = { userId: string; projectId?: string; ok: boolean; error?: string }` (pick `error`) in a shared `src/app/api/cron/_types.ts` (or `@/lib/cron-auth` neighbour) and have all six routes extend it, standardizing on a single failure key.
