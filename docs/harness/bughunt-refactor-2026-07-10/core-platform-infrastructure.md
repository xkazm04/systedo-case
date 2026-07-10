# Core Platform Infrastructure

> Total: 5
> Critical: 0 · High: 0 · Medium: 3 · Low: 2
> Lenses: bug-hunter 5 · code-refactor 0 (new-only, deduped vs code-refactor-2026-07-09)

## 1. `storageBucket()` fallback guesses a wrong or invalid bucket name

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: edge-case
- **File**: `src/lib/firebase.ts:47`
- **Scenario**: A deployment sets Firebase credentials (`FIREBASE_SERVICE_ACCOUNT`) but does not set `FIREBASE_STORAGE_BUCKET`. `storageBucket()` then builds `` `${process.env.GOOGLE_CLOUD_PROJECT ?? ""}.appspot.com` ``. Two failure modes: (a) if `GOOGLE_CLOUD_PROJECT` is also unset the name becomes the literal `.appspot.com`, so every Creative Studio call in `src/lib/images/store.ts` (upload line 38, download line 84, delete line 96) throws against a non-existent/invalid bucket; (b) any Firebase project created after Oct 2024 has its default bucket named `<project>.firebasestorage.app`, **not** `<project>.appspot.com`, so the guessed name points at a bucket that does not exist and uploads 404.
- **Root cause**: The fallback assumes the legacy `appspot.com` default-bucket convention and assumes `GOOGLE_CLOUD_PROJECT` is always populated — neither is guaranteed on Vercel or on modern Firebase projects.
- **Impact**: Creative Studio image save/download/delete silently break (throws surface as generic 500s) for a whole class of otherwise-correctly-configured deployments; the asset library appears empty or errors with no hint that the bucket name is the cause.
- **Fix sketch**: Resolve the bucket from the service-account/`admin.storage()` default (call `getStorage(firebaseApp).bucket()` with no name to use the app's configured default bucket) and fail loudly with a clear error if no bucket can be resolved, instead of fabricating a `.appspot.com` string.

## 2. Alert `fetch` calls have no timeout — a hung provider stalls the whole cron

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/email.ts:11`
- **Scenario**: `sendWebhook` (line 11) and `sendEmail` (line 40) call `fetch(...)` with no `signal`/timeout. These are `await`ed sequentially inside the cron and alert paths — `src/app/api/cron/report/route.ts:78/81`, `src/app/api/cron/digest/route.ts` (looped over recipients at :114), and the per-recipient loops in `campaigns/alerts.ts`, `campaigns/anomaly-alerts.ts`, `inventory/sync-alerts.ts`. If `ALERT_WEBHOOK_URL` or Resend accepts the TCP connection but never sends a response (a slow-loris/black-hole endpoint, common with misconfigured Slack/Teams proxies), the `await` hangs indefinitely. Default `fetch` has no timeout.
- **Root cause**: "Best-effort" alerting was written to swallow *errors* but not to bound *time*; the design assumes the remote always responds or resets, which a hung endpoint violates.
- **Impact**: One unresponsive alert endpoint stalls the entire cron invocation until the platform's max-duration kill; every alert/email queued *after* the hung one in the same loop never sends, and the cron reports no error. Silent loss of all downstream alerts plus wasted function time.
- **Fix sketch**: Pass `signal: AbortSignal.timeout(5000)` to both `fetch` calls (and treat the resulting abort as the existing `catch → return false` best-effort path), so a hung provider degrades to a skipped alert instead of a stalled cron.

## 3. `busy_timeout` on synchronous `node:sqlite` blocks the entire event loop under write contention

- **Severity**: Medium
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/db.ts:239`
- **Scenario**: `getDb()` sets `PRAGMA busy_timeout = 5000` on a `DatabaseSync` handle. `node:sqlite` is fully synchronous, and `busy_timeout` implements the wait by **sleeping the calling thread** in C — which in Next.js is the single Node event-loop thread. The `rate_limits` table is written on every unauthenticated `/api/ai` request (a paid, high-traffic endpoint). Under a concurrency burst, if the WAL writer lock is held when another request's synchronous `UPDATE`/`INSERT ... ON CONFLICT` runs, that call busy-waits — synchronously — for up to 5 seconds, freezing *all* in-flight requests on the same instance, not just the DB one.
- **Root cause**: The comment treats `busy_timeout` as a graceful backoff ("5s is generous for this low-write workload"), but with a synchronous DB driver on a single-threaded server a backoff is a full event-loop stall, not a per-request wait.
- **Impact**: A short write-contention window on the hot rate-limiter path degrades into a multi-second stall of every concurrent request on the instance (availability degradation / latency spikes / cascading timeouts) precisely when traffic is highest.
- **Fix sketch**: Lower `busy_timeout` to a small value (e.g. 50–100 ms) so a contended write fails fast rather than freezing the loop, and have the rate-limiter treat a `SQLITE_BUSY` as fail-open (allow the request) rather than blocking — or move the rate-limit counter off the synchronous shared handle entirely.

## 4. Migration `catch {}` permanently swallows genuine `ALTER` failures

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: silent-failure
- **File**: `src/lib/db.ts:254`
- **Scenario**: The `COLUMN_MIGRATIONS` loop does `try { db.exec(m.ddl) } catch { /* concurrent add */ }`, then unconditionally sets `g.__systedoSchema = SCHEMA_KEY` after the loop (line 258). The `catch` is intended only for the "another process already added the column" race, but it swallows *every* error — a genuinely failed `ALTER` (locked DB that exhausted `busy_timeout`, disk full, a malformed future DDL) is silently discarded. Because `hasColumn` guards the loop and the schema key is now marked applied, the migration never runs again for the lifetime of that cached handle/process.
- **Root cause**: The error handler cannot distinguish a benign "duplicate column" race from a real failure, and marking the schema as applied is not conditioned on the migrations actually succeeding.
- **Impact**: In LOCAL_DB mode a column that failed to add stays missing for the whole process; every subsequent read/write of that column (e.g. `warehouse_connection.last_error`, `projects.logo_url`) fails with a confusing "no such column" error and no trace of the swallowed root cause.
- **Fix sketch**: In the `catch`, re-check `hasColumn` — if the column still doesn't exist, rethrow (or log) instead of swallowing; and only set `g.__systedoSchema = SCHEMA_KEY` once all expected columns are confirmed present.

## 5. `downloadDataUrl` leaks an `<a>` element on every download

- **Severity**: Low
- **Lens**: bug-hunter
- **Category**: latent-failure
- **File**: `src/lib/export.ts:71`
- **Scenario**: `downloadDataUrl` (lines 63-71) appends the anchor to `document.body` and calls `a.click()` but never removes it — unlike its sibling `downloadText` (line 57), which correctly calls `a.remove()`. `CreativeStudio.tsx:739` invokes `downloadDataUrl` for the image-download button, so each generated-image download leaves one orphan `<a href="data:...">` node attached to `document.body`.
- **Root cause**: `downloadDataUrl` was written as a trimmed copy of `downloadText` and the cleanup line was dropped; the data-URL variant also holds a (potentially large) base64 `href` alive in the DOM.
- **Impact**: Minor DOM/memory leak — orphan anchor nodes accumulate across repeated Creative Studio downloads in a long-lived tab, each retaining its full data-URL string; no functional break but unbounded growth over a session.
- **Fix sketch**: Add `a.remove()` after `a.click()` (mirroring `downloadText`), so the anchor is detached immediately after the download is triggered.
