# Scheduled cron jobs — ambiguity+ui scan

> Total: 5 findings (0 critical / 3 high / 2 medium / 0 low)

> Scope note: `src/app/api/cron/microsite/route.ts` from the context map does not exist on disk — the context map has drifted; only 5 cron routes exist (sync, catalog-sync, digest, report, social), matching vercel.json.

## 1. Claimed-but-never-published social post is stranded in "publishing" limbo forever
- **Severity**: High
- **Lens**: ambiguity
- **Category**: claim-without-recovery
- **File**: src/app/api/cron/social/route.ts:43-65
- **Scenario**: `claimScheduledPost` flips the post `scheduled → publishing`, then `publishPost` (or the follow-up `updatePost`) throws — network blip, platform 5xx, store write error. The per-post catch logs and increments `failed`, but the post is left in `publishing` status.
- **Root cause**: The claim comment explains why a claimed post "isn't re-listed" (`listDueScheduled` only returns `scheduled`), but there is no compensating write in the catch and no reaper that returns stale `publishing` posts to `scheduled`/`failed`. The one-way state transition has no failure edge.
- **Impact**: The user's scheduled post silently never publishes and never shows as failed — it sits in a status the UI has no terminal meaning for, and no retry will ever pick it up. Data-loss-adjacent for a marketing tool whose core promise is "it posts on time".
- **Fix sketch**: In the per-post catch, best-effort `updatePost(tenant, post.id, { status: "failed", error: String(postErr) })`; additionally (or instead) add a limbo sweep at the top of the run: any `publishing` post older than ~2× maxDuration reverts to `scheduled` (idempotent thanks to the claim).

## 2. Digest weekly claim is never released on send failure — the tenant silently loses that week's digest
- **Severity**: High
- **Lens**: ambiguity
- **Category**: claim-first-no-release
- **File**: src/app/api/cron/digest/route.ts:105 (claim) vs onError at 239-249
- **Scenario**: `claimWeeklyDigest` succeeds, then anything downstream throws — `recordAlert`, `runTenantDiagnoses`, `resolveReportDataset`, `sendEmail`. The fan-out `onError` records the failure, but the ISO-week claim stays consumed.
- **Root cause**: The sibling report cron deliberately pairs `claimReportDay` with `releaseReportDay` on total failure (report/route.ts:91, 146) and documents why. The digest adopted claim-first without the release half, and nothing in the code or comment acknowledges the asymmetry — a future maintainer will reasonably assume a failed pair retries next run.
- **Impact**: One transient error means that tenant gets no weekly digest at all for the week (email, in-app alert, diagnosis, insights) with no retry path; the operator only sees it by reading the cron-run errors.
- **Fix sketch**: Add `releaseSentPeriod(tenant, "digest-weekly", week)` to sent-guard and call it in a per-pair catch when nothing was actually sent — or at minimum document the intentional at-most-once trade-off next to the claim.

## 3. Global, app-wide AI telemetry is embedded in every tenant's digest email
- **Severity**: High
- **Lens**: ambiguity
- **Category**: cross-tenant-disclosure
- **File**: src/app/api/cron/digest/route.ts:70-82, 225
- **Scenario**: The digest fans out per (user, account, project) precisely to prevent cross-client leakage (the comment at 84-90 celebrates closing that breach), yet `aiHtml` — computed once from `listLlmTelemetrySince` over the whole app — is appended to every recipient's email at line 225.
- **Root cause**: The comment at 70-72 admits "llmTelemetry is app-wide, not per-tenant" and treats "compute once" as an optimization, but never resolves the audience question: the digest goes to every connected user, not to a single operator. The header comment ("so the operator learns…") assumes single-operator deployment; the fan-out assumes multi-tenant.
- **Impact**: Every user/client receives aggregate AI call counts, estimated cost, demo-rate and provider-health for the entire installation — internal ops data (and a hint of other tenants' activity) in a client-facing email. Also incoherent UX: a client's "weekly performance summary" contains vendor infrastructure telemetry.
- **Fix sketch**: Drop `aiHtml` from the per-tenant email and keep the AI section only in the once-per-run operator webhook (line 254-256), or gate the email section on `userId === OPERATOR_USER_ID` / an `isOperator(userId)` check.

## 4. "Klientský report odeslán" alert and webhook fire even when 0 of N emails were delivered
- **Severity**: Medium
- **Lens**: ui
- **Category**: misleading-status-copy
- **File**: src/app/api/cron/report/route.ts:136-146
- **Scenario**: All recipients fail (SMTP down). `summarizeDelivery` yields delivered=0, the day-claim is correctly released for retry — but before that, `sendWebhook` and `recordAlert` have already announced "Klientský report odeslán · 0/0 příjemců" into the in-app inbox.
- **Root cause**: The alert/webhook writes are unconditional, placed above the `shouldMarkSent` decision; the title is a past-tense success claim regardless of outcome.
- **Impact**: The in-app alert history shows a "sent" event for a report nobody received; when the retry later succeeds, the tenant sees duplicate "sent" alerts for the same period. Erodes trust in the alert inbox as a delivery record.
- **Fix sketch**: Move `recordAlert`/`sendWebhook` after `summarizeDelivery` and branch the copy: success → "Klientský report odeslán · X/N příjemců"; total failure → skip the alert (the claim release already handles retry) or record "Odeslání reportu selhalo — zkusíme znovu".

## 5. Failed token decryption is silently coerced to an empty string, masking key-rotation breakage
- **Severity**: Medium
- **Lens**: ambiguity
- **Category**: swallowed-error-cause
- **File**: src/app/api/cron/catalog-sync/route.ts:42
- **Scenario**: `TOKEN_CRYPTO_KEY` is rotated (or the ciphertext is corrupt); `decryptToken` returns null for every stored connection and `?? ""` turns that into an empty token passed to `runCatalogSync`.
- **Root cause**: The comment only explains the happy path ("demo needs none") — it conflates "no token stored" with "token undecryptable". The distinction between the two null-ish states is erased at the call site.
- **Impact**: Every credentialed connection starts failing with the provider's generic 401 ("invalid token"), triggering `alertSyncFailed` with a misleading message; the operator debugs provider credentials while the real cause (crypto key mismatch) is invisible in logs and alerts.
- **Fix sketch**: When `connection.tokenEnc` is set but `decryptToken` returns null, short-circuit with an explicit result `reason: "token-decrypt-failed (check TOKEN_CRYPTO_KEY)"` and feed that into `classifySyncResult`/the alert instead of calling the provider with "".
